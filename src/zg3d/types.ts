export interface TileEntry { x: number; y: number; bytes: number; count: number }
export interface LevelInfo {
  z: number; size: number; mode: 'extrude' | 'roofs' | 'flat'; columns: 'full' | 'lite';
  tiles: [number, number, number, number][]; bytes: number; maxBytes: number;
}
export interface DistrictStat {
  ime: string; slug: string; sifra: string | null; povrsina_km2: number | null; centroid: [number, number] | null;
  izvor_skupa: string; faza_b: boolean; n: number; zbroj_tlocrt_m2: number; zbroj_volumen_m3: number;
  srednja_visina_m: number; medijan_visina_m: number; udio_ravnih_pct: number; srednji_indeks_krova: number;
  srednja_kompaktnost: number; gustoca_zgrada_km2: number | null; gustoca_volumena_m3_km2: number | null;
  pokrivenost_pct: number | null; godine: Record<string, number>; izvori: Record<string, number>;
  max_visina: { oid: number; zdelta: number; cx: number; cy: number } | null;
}
export interface Range { min: number; p2: number; p50: number; p98: number; max: number }
export interface Manifest {
  verzija: number; generirano: string; naziv: string;
  izvor: { naziv: string; licenca: string; url: string; attribution: string };
  crs: { origin: { E: number; N: number; lon: number; lat: number } };
  quant: number; grid: { x0: number; y0: number };
  levels: LevelInfo[];
  columns: Record<string, { name: string; type: string }[]>;
  izvori: string[];
  cetvrti: DistrictStat[];
  grad: DistrictStat;
  raspon: Record<string, Range>;
  reljef: { file: string; x0: number; y0: number; cell: number; nx: number; ny: number; scale: number } | null;
  ukupno_zgrada: number; ukupno_bajtova: number;
}
export interface DistrictsFile {
  cetvrti: { ime: string; sifra: string | null; slug: string; povrsina_km2: number; centroid: [number, number]; bbox: number[]; prsteni: number[][] }[];
}
/** Columnar per-building attributes of one tile. */
export type Columns = Record<string, Float32Array | Uint32Array | Uint16Array | Uint8Array>;
export interface Building {
  oid: number; cetvrt: number; godina: number; izvor: number; zmin: number; zdelta: number;
  sarea?: number; volume: number; tlocrt?: number; opseg?: number; indeks: number; prosj?: number;
  kompakt?: number; ravan: number; cx?: number; cy?: number;
}
