import { Group, LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute } from 'three';
import type { DistrictsFile } from './types';

export interface DistrictLabel { ime: string; x: number; y: number; z: number; slug: string }

/** District boundaries as draped gold lines + label anchors. */
export async function loadDistricts(baseUrl: string, heightAt: (x: number, y: number) => number): Promise<{ group: Group; labels: DistrictLabel[] } | null> {
  const res = await fetch(`${baseUrl}districts.json`);
  if (!res.ok) return null;
  const file = (await res.json()) as DistrictsFile;
  const verts: number[] = [];
  const labels: DistrictLabel[] = [];
  for (const d of file.cetvrti) {
    for (const ring of d.prsteni) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * j], by = ring[2 * j + 1];
        verts.push(ax, heightAt(ax, ay) + 4, -ay, bx, heightAt(bx, by) + 4, -by);
      }
    }
    labels.push({ ime: d.ime, x: d.centroid[0], y: d.centroid[1], z: heightAt(d.centroid[0], d.centroid[1]) + 40, slug: d.slug });
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  const mat = new LineBasicMaterial({ color: 0xe0b458, transparent: true, opacity: 0.55, depthWrite: false });
  const lines = new LineSegments(geo, mat);
  lines.renderOrder = 5;
  const group = new Group();
  group.add(lines);
  group.name = 'cetvrti';
  return { group, labels };
}
