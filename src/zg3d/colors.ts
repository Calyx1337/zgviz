import type { Columns, Manifest } from './types';

type RGB = [number, number, number];
export interface ColorMode {
  id: string;
  label: string;
  short: string;
  kind: 'ramp' | 'cat';
  column: string;
  unit?: string;
  log?: boolean;
  domain: [number, number];
  ramp?: RGB[];
  categories?: { value: number; label: string; color: RGB }[];
  opis: string;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Gold ↔ slate — the project's house ramp. */
const ZLATO_SKRILJEVAC: RGB[] = ['#1b2634', '#34506b', '#5d7d99', '#9a8b6a', '#d9ab4f', '#f6d98a', '#fff5d6'].map(hex);
const RELJEF: RGB[] = ['#1d3b3a', '#2f6b57', '#7f9d4f', '#c9b36a', '#c98d5a', '#a8664d', '#f0ece4'].map(hex);
const INDEKS: RGB[] = ['#2b3d55', '#4f6f8f', '#9fb3b8', '#e0c46a', '#e08a3c', '#c8402e'].map(hex);
const CAT: RGB[] = ['#e0b458', '#5fa8d3', '#c86b85', '#7bc47f', '#a97ee6', '#f2915a', '#4fc1b6', '#d9d9d9', '#b5835a', '#8fa3ff', '#f0e68c', '#d55e9d'].map(hex);

export function buildModes(m: Manifest): ColorMode[] {
  const r = m.raspon;
  const years = Object.keys(m.grad.godine).map(Number).sort((a, b) => a - b);
  const modes: ColorMode[] = [
    { id: 'visina', label: 'Visina zgrade', short: 'Visina', kind: 'ramp', column: 'zdelta', unit: 'm', domain: [0, Math.max(30, r.zdelta.p98)], ramp: ZLATO_SKRILJEVAC, opis: 'Z_Delta — visina od dna do vrha zgrade.' },
    { id: 'volumen', label: 'Volumen', short: 'Volumen', kind: 'ramp', column: 'volume', unit: 'm³', log: true, domain: [Math.max(20, r.volume.p2), Math.max(1000, r.volume.p98)], ramp: ZLATO_SKRILJEVAC, opis: 'Volumen zgrade (logaritamska skala).' },
    { id: 'godina', label: 'Godina izvora', short: 'Godina', kind: 'cat', column: 'godina', domain: [0, 1], categories: years.map((y, i) => ({ value: y, label: String(y), color: CAT[i % CAT.length] })), opis: 'Godina snimanja iz kojeg potječe model zgrade.' },
    { id: 'indeks', label: 'Indeks razvedenosti krova', short: 'Krov', kind: 'ramp', column: 'indeks', domain: [0.9, Math.max(1.3, Math.min(2.2, r.indeks.p98))], ramp: INDEKS, opis: 'SArea / (2·tlocrt + opseg·prosj. visina). 1 = kutija; više = razvedeniji krov i pročelja.' },
    { id: 'ravan', label: 'Ravan / kosi krov', short: 'Ravan', kind: 'cat', column: 'ravan', domain: [0, 1], categories: [{ value: 1, label: 'ravan krov', color: hex('#e0b458') }, { value: 0, label: 'kosi krov', color: hex('#4f6f8f') }], opis: '|Volume/tlocrt − Z_Delta| < 1,5 m → ravan krov.' },
    { id: 'reljef', label: 'Reljef (kota dna)', short: 'Reljef', kind: 'ramp', column: 'zmin', unit: 'm n.v.', domain: [Math.floor(r.zmin?.p2 ?? 100), Math.ceil(r.zmin?.p98 ?? 300)], ramp: RELJEF, opis: 'Z_Min — apsolutna nadmorska visina dna zgrade.' },
    { id: 'izvor', label: 'Izvor snimanja', short: 'Izvor', kind: 'cat', column: 'izvor', domain: [0, 1], categories: m.izvori.map((s, i) => ({ value: i, label: s || '—', color: CAT[(i + 1) % CAT.length] })), opis: 'Metoda snimanja (multisenzorsko / aerofotogrametrijsko).' },
    { id: 'cetvrt', label: 'Gradska četvrt', short: 'Četvrt', kind: 'cat', column: 'cetvrt', domain: [0, 1], categories: m.cetvrti.map((c, i) => ({ value: i, label: c.ime, color: CAT[i % CAT.length] })), opis: 'Skup podataka (gradska četvrt) iz kojeg zgrada dolazi.' },
  ];
  if (!r.zmin) {
    // older manifests: derive from terrain-less data
    modes.find((x) => x.id === 'reljef')!.domain = [80, 400];
  }
  return modes;
}

export function rampColor(ramp: RGB[], t: number): RGB {
  t = Math.max(0, Math.min(1, t));
  const s = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(s));
  const f = s - i;
  const a = ramp[i], b = ramp[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function normalize(mode: ColorMode, v: number): number {
  const [lo, hi] = mode.domain;
  if (mode.log) {
    const l = Math.log(Math.max(lo, 1e-3)), h = Math.log(hi);
    return (Math.log(Math.max(v, 1e-3)) - l) / (h - l);
  }
  return (v - lo) / (hi - lo);
}

/** Fill `out` (RGBA8, n×4) with the colour of every building in the tile. */
export function colorize(mode: ColorMode, columns: Columns, n: number, out: Uint8Array): void {
  const col = columns[mode.column];
  if (!col) {
    // column missing at this LOD → neutral slate
    for (let i = 0; i < n; i++) { out[4 * i] = 0x5d; out[4 * i + 1] = 0x6b; out[4 * i + 2] = 0x80; out[4 * i + 3] = 255; }
    return;
  }
  if (mode.kind === 'cat') {
    const map = new Map<number, RGB>();
    for (const c of mode.categories!) map.set(c.value, c.color);
    for (let i = 0; i < n; i++) {
      const c = map.get(col[i]) ?? [110, 110, 110];
      out[4 * i] = c[0]; out[4 * i + 1] = c[1]; out[4 * i + 2] = c[2]; out[4 * i + 3] = 255;
    }
    return;
  }
  const ramp = mode.ramp!;
  for (let i = 0; i < n; i++) {
    const c = rampColor(ramp, normalize(mode, col[i]));
    out[4 * i] = c[0]; out[4 * i + 1] = c[1]; out[4 * i + 2] = c[2]; out[4 * i + 3] = 255;
  }
}

export function cssGradient(ramp: RGB[]): string {
  return `linear-gradient(90deg, ${ramp.map((c, i) => `rgb(${c.map(Math.round).join(',')}) ${(100 * i) / (ramp.length - 1)}%`).join(', ')})`;
}

export const fmt = {
  m: (v: number, d = 1) => `${v.toLocaleString('hr-HR', { maximumFractionDigits: d, minimumFractionDigits: 0 })}`,
  int: (v: number) => Math.round(v).toLocaleString('hr-HR'),
  big: (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('hr-HR', { maximumFractionDigits: 2 })} mil.` : Math.round(v).toLocaleString('hr-HR')),
};
