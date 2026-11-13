// Unit system: values are stored in metric (the core's user units) and converted for display.

export type UnitSystem = 'metric' | 'imperial';
export type Kind =
  | 'velocity' | 'energy' | 'mass_g' | 'mass_kg' | 'length_mm' | 'distance_m' | 'pressure'
  | 'volume_cm3' | 'temp_c' | 'drop_m' | 'area_mm2' | 'raw';

interface Conv { metric: string; imperial: string; f: number; offset?: number }

const CONV: Record<Kind, Conv> = {
  velocity: { metric: 'm/s', imperial: 'ft/s', f: 3.280839895 },
  energy: { metric: 'J', imperial: 'ft·lbf', f: 0.737562149 },
  mass_g: { metric: 'g', imperial: 'gr', f: 15.4323584 },
  mass_kg: { metric: 'kg', imperial: 'lb', f: 2.20462262 },
  length_mm: { metric: 'mm', imperial: 'in', f: 1 / 25.4 },
  distance_m: { metric: 'm', imperial: 'yd', f: 1.0936133 },
  pressure: { metric: 'MPa', imperial: 'psi', f: 145.0377377 },
  volume_cm3: { metric: 'cm³', imperial: 'gr H₂O', f: 15.4323584 },
  temp_c: { metric: '°C', imperial: '°F', f: 1.8, offset: 32 },
  drop_m: { metric: 'cm', imperial: 'in', f: 39.37007874 },
  area_mm2: { metric: 'mm²', imperial: 'in²', f: 1 / 645.16 },
  raw: { metric: '', imperial: '', f: 1 },
};

export function unitLabel(kind: Kind, sys: UnitSystem): string {
  if (kind === 'drop_m' && sys === 'metric') return 'cm';
  return CONV[kind][sys];
}

/** Metric -> display value. */
export function toDisplay(v: number, kind: Kind, sys: UnitSystem): number {
  if (kind === 'drop_m' && sys === 'metric') return v * 100;
  if (sys === 'metric') return v;
  const c = CONV[kind];
  return v * c.f + (c.offset ?? 0);
}

/** Display value -> metric. */
export function fromDisplay(v: number, kind: Kind, sys: UnitSystem): number {
  if (kind === 'drop_m' && sys === 'metric') return v / 100;
  if (sys === 'metric') return v;
  const c = CONV[kind];
  return (v - (c.offset ?? 0)) / c.f;
}

export function fmt(v: number | null | undefined, digits = 0, lang = 'fr'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.5 * Math.pow(10, -digits)) v = 0;
  return v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Format a metric value in the chosen system with its unit. */
export function fu(v: number | null | undefined, kind: Kind, sys: UnitSystem, digits = 0, lang = 'fr'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const u = unitLabel(kind, sys);
  return `${fmt(toDisplay(v, kind, sys), digits, lang)}${u ? ' ' + u : ''}`;
}

/** Sensible decimals for a display value. */
export function autoDigits(v: number): number {
  const a = Math.abs(v);
  if (a === 0) return 0;
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  if (a >= 1) return 2;
  return 3;
}
