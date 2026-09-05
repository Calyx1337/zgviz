/** HTRS96/TM (EPSG:3765) ↔ WGS84 — same formulas as pipeline/lib/proj.mjs. */
const a = 6378137.0;
const f = 1 / 298.257222101;
const k0 = 0.9999;
const lon0 = (16.5 * Math.PI) / 180;
const FE = 500000;
const e2 = 2 * f - f * f;
const e4 = e2 * e2;
const e6 = e4 * e2;
const ep2 = e2 / (1 - e2);
const M_A = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
const M_B = (3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024;
const M_C = (15 * e4) / 256 + (45 * e6) / 1024;
const M_D = (35 * e6) / 3072;
const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

export interface Origin { E: number; N: number }
let origin: Origin = { E: 459000, N: 5074000 };
export function setOrigin(o: Origin) { origin = o; }

export function forward(lonDeg: number, latDeg: number): [number, number] {
  const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat), tanLat = sinLat / cosLat;
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat, C = ep2 * cosLat * cosLat, A = (lon - lon0) * cosLat;
  const M = a * (M_A * lat - M_B * Math.sin(2 * lat) + M_C * Math.sin(4 * lat) - M_D * Math.sin(6 * lat));
  const A2 = A * A, A3 = A2 * A, A4 = A3 * A, A5 = A4 * A, A6 = A5 * A;
  const x = k0 * N * (A + ((1 - T + C) * A3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5) / 120) + FE;
  const y = k0 * (M + N * tanLat * (A2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6) / 720));
  return [x, y];
}

export function inverse(E: number, N: number): [number, number] {
  const M = N / k0;
  const mu = M / (a * M_A);
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1), cos1 = Math.cos(phi1), tan1 = sin1 / cos1;
  const C1 = ep2 * cos1 * cos1, T1 = tan1 * tan1;
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const D = (E - FE) / (N1 * k0);
  const D2 = D * D, D3 = D2 * D, D4 = D3 * D, D5 = D4 * D, D6 = D5 * D;
  const lat = phi1 - ((N1 * tan1) / R1) * (D2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6) / 720);
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5) / 120) / cos1;
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** lon/lat → local metres [x east, y north]. */
export function toLocal(lon: number, lat: number): [number, number] {
  const [E, N] = forward(lon, lat);
  return [E - origin.E, N - origin.N];
}
/** local metres → [lon, lat]. */
export function fromLocal(x: number, y: number): [number, number] {
  return inverse(x + origin.E, y + origin.N);
}
