import { PlaneGeometry, Mesh, MeshLambertMaterial, Color, BufferAttribute, DoubleSide } from 'three';
import type { Manifest } from './types';

export interface Terrain {
  mesh: Mesh;
  heightAt: (x: number, y: number) => number;
  min: number; max: number;
}

/** Terrain grid from the pipeline's terrain.bin (uint16 decimetres) — a dark cartographic ground. */
export async function loadTerrain(baseUrl: string, m: Manifest): Promise<Terrain | null> {
  const t = m.reljef;
  if (!t) return null;
  const res = await fetch(`${baseUrl}${t.file}`);
  if (!res.ok) return null;
  const data = new Uint16Array(await res.arrayBuffer());
  const { nx, ny, cell, x0, y0, scale } = t;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) { const v = data[i] * scale; if (v < min) min = v; if (v > max) max = v; }

  const heightAt = (x: number, y: number): number => {
    const fx = (x - x0) / cell, fy = (y - y0) / cell;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j));
    const h00 = data[j * nx + i], h10 = data[j * nx + i + 1], h01 = data[(j + 1) * nx + i], h11 = data[(j + 1) * nx + i + 1];
    return (ty > tx ? h00 + ty * (h01 - h00) + tx * (h11 - h01) : h00 + tx * (h10 - h00) + ty * (h11 - h10)) * scale;
  };

  const w = (nx - 1) * cell, h = (ny - 1) * cell;
  const geo = new PlaneGeometry(w, h, nx - 1, ny - 1);
  geo.rotateX(-Math.PI / 2); // plane in XZ, +Y up; after rotation v goes along -Z
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const low = new Color('#d0d3c8'), high = new Color('#9cab92'), c = new Color();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const vi = j * nx + i; // PlaneGeometry vertex order: row-major from top (+y) to bottom
      // Row j of the plane (before rotation) runs from y=+h/2 (j=0) to y=-h/2; after rotateX(-90°) y→-z, so
      // j=0 is at z=-h/2 (north). Terrain row jj = ny-1-j (north = high local y).
      const jj = ny - 1 - j;
      const hgt = data[jj * nx + i] * scale;
      pos.setY(vi, hgt - 0.5);
      c.copy(low).lerp(high, Math.max(0, Math.min(1, (hgt - min) / Math.max(1, max - min))));
      colors[3 * vi] = c.r; colors[3 * vi + 1] = c.g; colors[3 * vi + 2] = c.b;
    }
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new Mesh(geo, mat);
  // plane is centred at origin: shift so that local (x0, y0) maps to the SW corner. world z = -y.
  mesh.position.set(x0 + w / 2, 0, -(y0 + h / 2));
  mesh.receiveShadow = true;
  mesh.name = 'reljef';
  return { mesh, heightAt, min, max };
}
