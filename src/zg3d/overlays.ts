import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, DoubleSide, BufferGeometry, Float32BufferAttribute, BufferAttribute, LineSegments, LineBasicMaterial, Color } from 'three';
import type { DistrictLabel } from './districts';

type HeightFn = (x: number, y: number) => number;

interface RoadsFile { ceste: Record<string, number[][]>; zeljeznica: number[][]; tramvaj: number[][] }
interface GreenFile { poligoni: { ime: string | null; vrsta: string; povrsina_m2: number; centroid: [number, number]; v: number[]; t: number[] }[] }

/** Road classes drawn as draped ribbons (width in metres). Widths are visual, a little above real-world, so streets stay readable when tilted. */
const RIBBON: Record<string, { w: number; color: number }> = {
  autocesta: { w: 16, color: 0x6b7690 },
  autocesta_prikljucak: { w: 8, color: 0x6b7690 },
  brza: { w: 13, color: 0x66728c },
  brza_prikljucak: { w: 7, color: 0x66728c },
  glavna: { w: 13, color: 0x5e6a82 },
  sekundarna: { w: 11, color: 0x556178 },
  tercijarna: { w: 9, color: 0x4d586e },
  ulica: { w: 6, color: 0x4c5870 },
  pjesacka: { w: 3, color: 0x4c5870 },
};

const GREEN: Record<string, { color: string; opacity: number }> = {
  park: { color: '#9fb393', opacity: 0.9 },
  suma: { color: '#839779', opacity: 0.9 },
  groblje: { color: '#a2af99', opacity: 0.85 },
  travnjak: { color: '#1b3128', opacity: 0.7 },
};

/** Ribbon strip for a polyline: every segment becomes a quad, extended w/2 past its ends to hide corner gaps. */
function ribbon(xy: number[], w: number, heightAt: HeightFn, lift: number, pos: number[], idx: number[]) {
  const h = w / 2;
  for (let i = 0; i + 3 < xy.length; i += 2) {
    let ax = xy[i], ay = xy[i + 1], bx = xy[i + 2], by = xy[i + 3];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 0.01) continue;
    const ux = dx / L, uy = dy / L;            // along
    const nx = -uy * h, ny = ux * h;           // across
    ax -= ux * h; ay -= uy * h; bx += ux * h; by += uy * h;
    const base = pos.length / 3;
    const za = heightAt(ax, ay) + lift, zb = heightAt(bx, by) + lift;
    pos.push(ax + nx, za, -(ay + ny), ax - nx, za, -(ay - ny), bx + nx, zb, -(by + ny), bx - nx, zb, -(by - ny));
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
}

function lines(polys: number[][], heightAt: HeightFn, lift: number, out: number[]) {
  for (const xy of polys) {
    for (let i = 0; i + 3 < xy.length; i += 2) {
      const n=Math.max(1,Math.ceil(Math.hypot(xy[i+2]-xy[i],xy[i+3]-xy[i+1])/30));
      for(let j=0;j<n;j++)for(const t of [j/n,(j+1)/n]){const x=xy[i]+(xy[i+2]-xy[i])*t,y=xy[i+1]+(xy[i+3]-xy[i+1])*t;out.push(x,heightAt(x,y)+lift,-y);}
    }
  }
}

function meshOf(pos: number[], idx: number[], color: number | string, opacity = 1, order = 3): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), 1));
  geo.computeVertexNormals();
  const Material = order === 1 ? MeshLambertMaterial : MeshBasicMaterial;
  const m = new Mesh(geo, new Material({ side: DoubleSide, color: new Color(color), transparent: opacity < 1, opacity, depthTest: true, depthWrite: false }));
  m.renderOrder = order; m.frustumCulled = false;
  return m;
}

/** Streets (OSM highway=*), railways and tram lines, draped on the terrain. */
export async function loadRoads(baseUrl: string, heightAt: HeightFn): Promise<Group | null> {
  const res = await fetch(`${baseUrl}roads.json`);
  if (!res.ok) return null;
  const file = (await res.json()) as RoadsFile;
  const group = new Group(); group.name = 'ceste';
  // ribbons by class ascending so major roads paint over minor ones
  for (const k of ['pjesacka', 'ulica', 'tercijarna', 'sekundarna', 'glavna', 'brza_prikljucak', 'brza', 'autocesta_prikljucak', 'autocesta']) {
    const polys = file.ceste[k]; if (!polys?.length) continue;
    const pos: number[] = [], idx: number[] = [];
    for (const xy of polys) ribbon(xy, RIBBON[k].w, heightAt, 1.0, pos, idx);
    group.add(meshOf(pos, idx, RIBBON[k].color, 1, 3));
  }
  const rv: number[] = [], tv: number[] = [];
  lines(file.zeljeznica, heightAt, 1.1, rv);
  lines(file.tramvaj, heightAt, 1.2, tv);
  for (const [v, color, op] of [[rv, 0x8a8f9a, 0.7], [tv, 0xb08a4a, 0.55]] as const) {
    if (!v.length) continue;
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(v, 3));
    const l = new LineSegments(g, new LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: true, depthWrite: false }));
    l.renderOrder = 3; l.frustumCulled = false; group.add(l);
  }
  return group;
}

/** Parks, forests, cemeteries, meadows as tinted ground patches (+ labels for larger named parks). */
export async function loadGreen(baseUrl: string, heightAt: HeightFn): Promise<{ group: Group; labels: DistrictLabel[] } | null> {
  const res = await fetch(`${baseUrl}green.json`);
  if (!res.ok) return null;
  const file = (await res.json()) as GreenFile;
  const buckets: Record<string, { pos: number[]; idx: number[] }> = {};
  const labels: DistrictLabel[] = [];
  for (const p of file.poligoni) {
    // Broad forest cover is represented by the shaded terrain itself; avoid a second terrain skin.
    if (p.vrsta === 'suma') continue;
    const b = (buckets[p.vrsta] ||= { pos: [], idx: [] });
    const add = (a:number[], c:number[], d:number[], depth=0):void => {
      const edges=[[a,c,d],[c,d,a],[d,a,c]].sort((u,v)=>Math.hypot(v[0][0]-v[1][0],v[0][1]-v[1][1])-Math.hypot(u[0][0]-u[1][0],u[0][1]-u[1][1]));
      const [u,v,w]=edges[0];
      if(depth<14&&Math.hypot(u[0]-v[0],u[1]-v[1])>100){const mid=[(u[0]+v[0])/2,(u[1]+v[1])/2];add(u,mid,w,depth+1);add(mid,v,w,depth+1);return;}
      const base=b.pos.length/3;for(const q of [a,c,d])b.pos.push(q[0],heightAt(q[0],q[1])+1,-q[1]);b.idx.push(base,base+1,base+2);
    };
    for(let i=0;i<p.t.length;i+=3){const points=p.t.slice(i,i+3).map(j=>[p.v[j*2],p.v[j*2+1]]);add(points[0],points[1],points[2]);}
    if (p.ime && p.vrsta === 'park' && p.povrsina_m2 > 120000) labels.push({ ime: p.ime, x: p.centroid[0], y: p.centroid[1], z: heightAt(p.centroid[0], p.centroid[1]) + 8, slug: `park-${p.ime}` });
  }
  const group = new Group(); group.name = 'zelenilo';
  for (const k of ['travnjak', 'suma', 'groblje', 'park']) {
    const b = buckets[k]; if (!b) continue;
    group.add(meshOf(b.pos, b.idx, GREEN[k].color, GREEN[k].opacity, 1));
  }
  return { group, labels };
}
