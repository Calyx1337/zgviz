import { BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, BufferAttribute, Box3, Sphere, Vector3 } from 'three';
import type { Columns } from './types';

export interface TileData {
  geometry: BufferGeometry;
  columns: Columns;
  count: number;
  origin: [number, number];
  quant: number;
  z: number; x: number; y: number;
  mode: string;
}

/** Parse a ZG3D tile GLB (see pipeline/lib/glb.mjs) into a ready BufferGeometry + columns. */
export function parseTile(buf: ArrayBuffer): TileData {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('nije GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binOff = 28 + jsonLen;
  const views = json.bufferViews as { byteOffset: number; byteLength: number; byteStride?: number }[];
  const acc = json.accessors as { bufferView: number; componentType: number; count: number; min?: number[]; max?: number[] }[];
  const prim = json.meshes[0].primitives[0];
  const meta = json.extras.zg3d;

  const posAcc = acc[prim.attributes.POSITION];
  const posView = views[posAcc.bufferView];
  const posArr = new Int16Array(buf, binOff + posView.byteOffset, posView.byteLength / 2);
  const posBuf = new InterleavedBuffer(posArr, (posView.byteStride ?? 8) / 2);

  const idAcc = acc[prim.attributes._ID];
  const idView = views[idAcc.bufferView];
  const idArr = new Uint16Array(buf, binOff + idView.byteOffset, idView.byteLength / 2);
  const idBuf = new InterleavedBuffer(idArr, (idView.byteStride ?? 4) / 2);

  const idxAcc = acc[prim.indices];
  const idxView = views[idxAcc.bufferView];
  const idxArr = idxAcc.componentType === 5125
    ? new Uint32Array(buf, binOff + idxView.byteOffset, idxAcc.count)
    : new Uint16Array(buf, binOff + idxView.byteOffset, idxAcc.count);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new InterleavedBufferAttribute(posBuf, 3, 0));
  geometry.setAttribute('_id', new InterleavedBufferAttribute(idBuf, 1, 0));
  geometry.setIndex(new BufferAttribute(idxArr, 1));
  if (posAcc.min && posAcc.max) {
    geometry.boundingBox = new Box3(new Vector3(...(posAcc.min as [number, number, number])), new Vector3(...(posAcc.max as [number, number, number])));
    geometry.boundingSphere = new Sphere();
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);
  }

  const columns: Columns = {};
  const av = views[meta.attrBufferView];
  const base = binOff + av.byteOffset;
  const n = meta.count as number;
  for (const c of meta.columns as { name: string; type: string; offset: number }[]) {
    const o = base + c.offset;
    switch (c.type) {
      case 'f32': columns[c.name] = new Float32Array(buf, o, n); break;
      case 'u32': columns[c.name] = new Uint32Array(buf, o, n); break;
      case 'u16': columns[c.name] = new Uint16Array(buf, o, n); break;
      case 'u8': columns[c.name] = new Uint8Array(buf, o, n); break;
    }
  }
  return { geometry, columns, count: n, origin: meta.origin, quant: meta.quant, z: meta.z, x: meta.x, y: meta.y, mode: meta.mode };
}
