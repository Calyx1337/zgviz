import { Group, Mesh, MeshBasicMaterial, BufferGeometry, Float32BufferAttribute, BufferAttribute, LineSegments, LineBasicMaterial } from 'three';
import type { DistrictLabel } from './districts';

interface WaterFile {
  izvor: string;
  poligoni: { ime: string | null; vrsta: string; povrsina_m2: number; centroid: [number, number]; v: number[]; t: number[] }[];
  linije: { ime: string | null; xy: number[] }[];
}

/**
 * OSM water layer: triangulated water bodies (Sava, lakes) draped on the terrain and
 * streams as thin lines. Drawn without depth test right after the terrain so it always
 * reads as "painted on the ground"; buildings render afterwards and cover it normally.
 */
export async function loadWater(baseUrl: string, heightAt: (x: number, y: number) => number): Promise<{ group: Group; labels: DistrictLabel[] } | null> {
  const res = await fetch(`${baseUrl}water.json`);
  if (!res.ok) return null;
  const file = (await res.json()) as WaterFile;
  const pos: number[] = [];
  const idx: number[] = [];
  const labels: DistrictLabel[] = [];
  for (const p of file.poligoni) {
    const base = pos.length / 3;
    for (let i = 0; i < p.v.length; i += 2) pos.push(p.v[i], heightAt(p.v[i], p.v[i + 1]) + 0.6, -p.v[i + 1]);
    for (const t of p.t) idx.push(base + t);
    if (p.ime && p.povrsina_m2 > 150000) labels.push({ ime: p.ime, x: p.centroid[0], y: p.centroid[1], z: heightAt(p.centroid[0], p.centroid[1]) + 10, slug: `voda-${p.ime}` });
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), 1));
  const mesh = new Mesh(geo, new MeshBasicMaterial({ color: 0x1f4f7a, transparent: true, opacity: 0.85, depthTest: true, depthWrite: false }));
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;

  const lv: number[] = [];
  for (const l of file.linije) {
    for (let i = 0; i + 3 < l.xy.length; i += 2) {
      const ax = l.xy[i], ay = l.xy[i + 1], bx = l.xy[i + 2], by = l.xy[i + 3];
      lv.push(ax, heightAt(ax, ay) + 1.2, -ay, bx, heightAt(bx, by) + 1.2, -by);
    }
  }
  const lgeo = new BufferGeometry();
  lgeo.setAttribute('position', new Float32BufferAttribute(lv, 3));
  const lines = new LineSegments(lgeo, new LineBasicMaterial({ color: 0x3f7fb5, transparent: true, opacity: 0.55, depthWrite: false }));
  lines.renderOrder = 2;

  const group = new Group();
  group.add(mesh, lines);
  group.name = 'voda';
  return { group, labels };
}
