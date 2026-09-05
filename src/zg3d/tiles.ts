import { Mesh, Scene, PerspectiveCamera, Frustum, Matrix4, Box3, Vector3, Raycaster, Intersection } from 'three';
import { parseTile, type TileData } from './glb';
import { createBuildingMaterial, makePalette } from './material';
import { colorize, type ColorMode } from './colors';
import type { Manifest, LevelInfo, Building } from './types';

interface Node { z: number; x: number; y: number; key: string; exists: boolean; bytes: number; count: number; box: Box3; cx: number; cy: number; size: number }
interface LoadedTile { node: Node; data: TileData; mesh: Mesh; palData: Uint8Array; lastUsed: number }

export interface TileStats { visible: number; loaded: number; loading: number; bytes: number; triangles: number; buildings: number }
export interface PickResult { building: Building; tile: LoadedTile; id: number; point: Vector3; columns: TileData['columns'] }

export interface TileManagerOptions {
  baseUrl: string;
  maxLoaded: number;      // LRU size (tiles kept in memory, incl. hidden)
  refineDist: number[];   // per level: refine when camera closer than this (m)
  maxDist: number;        // don't load anything farther than this
  concurrency: number;
}

/**
 * Quadtree tile streaming: picks the level per region by camera distance, keeps
 * parents visible until children arrive (no holes), evicts LRU tiles beyond a budget.
 */
export class TileManager {
  private levels: LevelInfo[];
  private nodes = new Map<string, Node>();          // all existing tiles by key
  private virtual = new Map<string, Set<string>>();  // key → child keys (existing subtree)
  private loaded = new Map<string, LoadedTile>();
  private inflight = new Map<string, AbortController>();
  private queue: Node[] = [];
  private shown = new Set<string>();
  private mode: ColorMode | null = null;
  private frame = 0;
  private selected: { key: string; id: number } | null = null;
  private frustum = new Frustum();
  private projView = new Matrix4();
  private tmpBox = new Box3();
  stats: TileStats = { visible: 0, loaded: 0, loading: 0, bytes: 0, triangles: 0, buildings: 0 };
  onChange: (() => void) | null = null;
  heightAt: (x: number, y: number) => number = () => 120;
  castShadow = true;

  constructor(private scene: Scene, private manifest: Manifest, public opts: TileManagerOptions) {
    this.levels = manifest.levels;
    for (const L of this.levels) {
      for (const [x, y, bytes, count] of L.tiles) {
        const key = `${L.z}/${x}/${y}`;
        const x0 = manifest.grid.x0 + x * L.size, y0 = manifest.grid.y0 + y * L.size;
        const node: Node = { z: L.z, x, y, key, exists: true, bytes, count, size: L.size, cx: x0 + L.size / 2, cy: y0 + L.size / 2,
          box: new Box3(new Vector3(x0 - 200, 0, -(y0 + L.size) - 200), new Vector3(x0 + L.size + 200, 1300, -y0 + 200)) };
        this.nodes.set(key, node);
        // register in ancestors' virtual child lists
        let cz = L.z, cx = x, cy = y;
        while (cz > 0) {
          const pz = cz - 1, px = Math.floor(cx / 2), py = Math.floor(cy / 2);
          const pk = `${pz}/${px}/${py}`;
          let set = this.virtual.get(pk);
          if (!set) { set = new Set(); this.virtual.set(pk, set); }
          set.add(`${cz}/${cx}/${cy}`);
          cz = pz; cx = px; cy = py;
        }
      }
    }
  }

  setMode(mode: ColorMode) {
    this.mode = mode;
    for (const t of this.loaded.values()) this.recolor(t);
  }

  setSelected(sel: { key: string; id: number } | null) {
    if (this.selected) {
      const t = this.loaded.get(this.selected.key);
      if (t) (t.mesh.material as any).uniformsRef.uSel.value = -1;
    }
    this.selected = sel;
    if (sel) {
      const t = this.loaded.get(sel.key);
      if (t) (t.mesh.material as any).uniformsRef.uSel.value = sel.id;
    }
  }

  private recolor(t: LoadedTile) {
    if (!this.mode) return;
    colorize(this.mode, t.data.columns, t.data.count, t.palData);
    const mat = t.mesh.material as any;
    mat.uniformsRef.uPal.value.needsUpdate = true;
  }

  private rootKeys(): string[] {
    const roots = new Set<string>();
    for (const n of this.nodes.values()) {
      let cz = n.z, cx = n.x, cy = n.y;
      while (cz > 0) { cz--; cx = Math.floor(cx / 2); cy = Math.floor(cy / 2); }
      roots.add(`0/${cx}/${cy}`);
    }
    return [...roots];
  }
  private roots: string[] | null = null;

  /** Distance from camera to a node footprint (metres, 3D using ground height at node centre). */
  private distTo(node: Node, cam: Vector3): number {
    const half = node.size / 2;
    const dx = Math.max(Math.abs(cam.x - node.cx) - half, 0);
    const dz = Math.max(Math.abs(-cam.z - node.cy) - half, 0);
    const dy = Math.max(cam.y - (this.heightAt(node.cx, node.cy) + 30), 0);
    return Math.sqrt(dx * dx + dz * dz + dy * dy);
  }

  private nodeBox(z: number, x: number, y: number): Box3 {
    const size = this.levels[z].size;
    const x0 = this.manifest.grid.x0 + x * size, y0 = this.manifest.grid.y0 + y * size;
    const h = this.heightAt(x0 + size / 2, y0 + size / 2);
    return this.tmpBox.set(new Vector3(x0 - 150, h - 60, -(y0 + size) - 150), new Vector3(x0 + size + 150, h + 260, -y0 + 150));
  }

  /** Select desired tiles for this camera. */
  update(camera: PerspectiveCamera) {
    this.frame++;
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const cam = camera.position;
    if (!this.roots) this.roots = this.rootKeys();

    const desired: Node[] = [];
    const visit = (key: string) => {
      const [zs, xs, ys] = key.split('/');
      const z = +zs, x = +xs, y = +ys;
      const box = this.nodeBox(z, x, y);
      if (!this.frustum.intersectsBox(box)) return;
      const node = this.nodes.get(key);
      const probe: Node = node ?? { z, x, y, key, exists: false, bytes: 0, count: 0, size: this.levels[z].size, cx: (box.min.x + box.max.x) / 2, cy: -(box.min.z + box.max.z) / 2, box: box.clone() };
      const d = this.distTo(probe, cam);
      if (d > this.opts.maxDist) return;
      const children = this.virtual.get(key);
      const refine = z < this.levels.length - 1 && children && d < this.opts.refineDist[z];
      if (refine) { for (const ck of children!) visit(ck); return; }
      if (node) desired.push(node);
      else if (children) for (const ck of children) visit(ck); // no tile at this level, show finer ones
    };
    for (const rk of this.roots) visit(rk);

    // Requests
    const desiredKeys = new Set(desired.map((n) => n.key));
    desired.sort((a, b) => this.distTo(a, cam) - this.distTo(b, cam));
    this.queue = desired.filter((n) => !this.loaded.has(n.key) && !this.inflight.has(n.key));
    for (const [key, ctl] of this.inflight) if (!desiredKeys.has(key)) { ctl.abort(); this.inflight.delete(key); }
    this.pump();

    // Visibility: desired & loaded → show; desired & missing → show loaded ancestor or previously shown descendants
    const show = new Set<string>();
    for (const n of desired) {
      const t = this.loaded.get(n.key);
      if (t) { show.add(n.key); t.lastUsed = this.frame; continue; }
      let found = false;
      let cz = n.z, cx = n.x, cy = n.y;
      while (cz > 0) {
        cz--; cx = Math.floor(cx / 2); cy = Math.floor(cy / 2);
        const ak = `${cz}/${cx}/${cy}`;
        const at = this.loaded.get(ak);
        if (at) { show.add(ak); at.lastUsed = this.frame; found = true; break; }
      }
      if (!found) {
        const kids = this.virtual.get(n.key);
        if (kids) for (const k of kids) { const kt = this.loaded.get(k); if (kt && this.shown.has(k)) { show.add(k); kt.lastUsed = this.frame; } }
        // deeper descendants (2 levels) — only those already shown
        if (kids) for (const k of kids) { const gk = this.virtual.get(k); if (gk) for (const g of gk) { const gt = this.loaded.get(g); if (gt && this.shown.has(g)) { show.add(g); gt.lastUsed = this.frame; } } }
      }
    }
    let changed = false;
    for (const t of this.loaded.values()) {
      const v = show.has(t.node.key);
      if (t.mesh.visible !== v) { t.mesh.visible = v; changed = true; }
    }
    this.shown = show;
    this.evict();
    this.updateStats();
    if (changed && this.onChange) this.onChange();
  }

  private pump() {
    while (this.inflight.size < this.opts.concurrency && this.queue.length) {
      const node = this.queue.shift()!;
      if (this.loaded.has(node.key) || this.inflight.has(node.key)) continue;
      const ctl = new AbortController();
      this.inflight.set(node.key, ctl);
      fetch(`${this.opts.baseUrl}tiles/${node.key}.glb`, { signal: ctl.signal })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((buf) => { if (!ctl.signal.aborted) this.install(node, parseTile(buf)); })
        .catch((e) => { if (e?.name !== 'AbortError') console.warn('pločica', node.key, e); })
        .finally(() => { this.inflight.delete(node.key); this.pump(); if (this.onChange) this.onChange(); });
    }
  }

  private install(node: Node, data: TileData) {
    const { tex, data: palData, w, h } = makePalette(data.count);
    const mat = createBuildingMaterial(tex, w, h);
    const mesh = new Mesh(data.geometry, mat);
    const s = 1 / data.quant;
    mesh.scale.set(s, s, s);
    mesh.position.set(data.origin[0], 0, -data.origin[1]);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.renderOrder = 4;
    mesh.visible = false;
    mesh.name = node.key;
    mesh.userData.key = node.key;
    mesh.updateMatrixWorld();
    const t: LoadedTile = { node, data, mesh, palData, lastUsed: this.frame };
    this.loaded.set(node.key, t);
    this.recolor(t);
    if (this.selected && this.selected.key === node.key) mat.uniformsRef.uSel.value = this.selected.id;
    this.scene.add(mesh);
  }

  private evict() {
    if (this.loaded.size <= this.opts.maxLoaded) return;
    const candidates = [...this.loaded.values()].filter((t) => !this.shown.has(t.node.key)).sort((a, b) => a.lastUsed - b.lastUsed);
    let excess = this.loaded.size - this.opts.maxLoaded;
    for (const t of candidates) {
      if (excess-- <= 0) break;
      this.dispose(t);
    }
  }

  private dispose(t: LoadedTile) {
    this.scene.remove(t.mesh);
    t.data.geometry.dispose();
    const mat = t.mesh.material as any;
    mat.uniformsRef.uPal.value.dispose();
    mat.dispose();
    this.loaded.delete(t.node.key);
  }

  setShadows(on: boolean) {
    this.castShadow = on;
    for (const t of this.loaded.values()) t.mesh.castShadow = on;
  }

  private updateStats() {
    let bytes = 0, tris = 0, bld = 0, vis = 0;
    for (const t of this.loaded.values()) {
      bytes += t.node.bytes;
      if (t.mesh.visible) { vis++; tris += (t.data.geometry.index?.count ?? 0) / 3; bld += t.data.count; }
    }
    this.stats = { visible: vis, loaded: this.loaded.size, loading: this.inflight.size + this.queue.length, bytes, triangles: tris, buildings: bld };
  }

  visibleMeshes(): Mesh[] {
    const out: Mesh[] = [];
    for (const t of this.loaded.values()) if (t.mesh.visible) out.push(t.mesh);
    return out;
  }

  /** Raycast the visible tiles; returns the picked building (any LOD). */
  pick(raycaster: Raycaster): PickResult | null {
    const hits: Intersection[] = raycaster.intersectObjects(this.visibleMeshes(), false);
    if (!hits.length) return null;
    const hit = hits[0];
    const mesh = hit.object as Mesh;
    const t = this.loaded.get(mesh.userData.key);
    if (!t || hit.face === undefined || hit.face === null) return null;
    const idAttr = t.data.geometry.getAttribute('_id');
    const id = idAttr.getX(hit.face.a);
    const c = t.data.columns;
    const get = (name: string) => (c[name] ? c[name][id] : undefined);
    const building: Building = {
      oid: get('oid') ?? 0, cetvrt: get('cetvrt') ?? 0, godina: get('godina') ?? 0, izvor: get('izvor') ?? 0,
      zmin: get('zmin') ?? 0, zdelta: get('zdelta') ?? 0, volume: get('volume') ?? 0, indeks: get('indeks') ?? 0, ravan: get('ravan') ?? 0,
      sarea: get('sarea'), tlocrt: get('tlocrt'), opseg: get('opseg'), prosj: get('prosj'), kompakt: get('kompakt'), cx: get('cx'), cy: get('cy'),
    };
    return { building, tile: t, id, point: hit.point, columns: c };
  }

  /** Find a building by OBJECTID + district among loaded tiles (used for "najviša zgrada" links). */
  findLoaded(oid: number, cetvrt: number): { key: string; id: number } | null {
    for (const t of this.loaded.values()) {
      const oids = t.data.columns.oid, cs = t.data.columns.cetvrt;
      if (!oids || !cs) continue;
      for (let i = 0; i < t.data.count; i++) if (oids[i] === oid && cs[i] === cetvrt) return { key: t.node.key, id: i };
    }
    return null;
  }
}
