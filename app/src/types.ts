// TypeScript mirror of the Rust core's JSON types (crates/core/src/scenario.rs).

export type Layout = 'direct' | 'high_low';
export type GrainShape = 'flake' | 'sphere' | 'tube' | 'multi7' | 'grain';
export type Quality = 'measured' | 'calibrated' | 'manufacturer' | 'standard' | 'estimated';
export type Surface = 'smooth' | 'dimpled';
export type Stabilisation = 'auto' | 'fins' | 'forced_nose_first';

export type DragModel =
  | { kind: 'g1'; bc: number }
  | { kind: 'g7'; bc: number }
  | { kind: 'sphere'; surface: Surface; mult: number }
  | { kind: 'blunt_nose'; surface: Surface; mult: number }
  | { kind: 'tumbling'; cd: number }
  | { kind: 'table'; points: [number, number][]; mult: number };

export interface PowderUser {
  id: string;
  name: string;
  force_kj: number;
  gamma: number;
  covolume: number;
  density: number;
  bulk_density: number;
  beta_mm: number;
  alpha: number;
  web_mm: number;
  shape: GrainShape;
  temp_coeff_pct: number;
  family: string;
  quality: Quality;
  source: string;
}

export interface EnvUser {
  target_m: number;
  target_height_m?: number;
  height_m: number;
  altitude_m: number;
  temp_c: number;
  humidity_pct: number;
  wind_ms: number;
  wind_clock: number;
  latitude?: number | null;
  azimuth?: number;
  powder_temp_c?: number | null;
}

export interface ScenarioInput {
  name: string;
  layout: Layout;
  powder_id: string;
  powder?: PowderUser | null;
  charge_g: number;
  primer_mg: number;
  case_cap_cm3: number;
  case_len_mm: number;
  oal_mm: number;
  burst_mpa: number;
  vent_d_mm: number;
  vent_cd: number;
  low_vol_cm3: number;
  proj_mass_g: number;
  bore_mm: number;
  proj_len_mm: number;
  drag: DragModel;
  stabilisation: Stabilisation;
  shot_start_mpa: number;
  friction_mpa: number;
  leak_mm2: number;
  barrel_mm: number;
  twist_mm: number;
  heat_loss_pct: number;
  weapon_kg: number;
  backspin_rpm: number;
  pmax_mpa: number;
  env: EnvUser;
  table_step_m: number;
}

export interface Preset {
  id: string;
  family: string;
  reference: string;
  ref_velocity: number;
  ref_pressure: number;
  scenario: ScenarioInput;
}

export interface Library {
  schema_version: number;
  powders: PowderUser[];
  presets: Preset[];
}

export interface Sample {
  t: number;
  x: number;
  v: number;
  p_high: number;
  p_low: number;
  p_breech: number;
  p_base: number;
  psi: number;
}

export interface InteriorResult {
  ok: boolean;
  error: string | null;
  muzzle_velocity: number;
  barrel_time: number;
  muzzle_pressure: number;
  burnt_fraction: number;
  p_breech_max: number;
  p_high_max: number;
  p_low_max: number;
  t_peak: number;
  t_vent: number | null;
  t_start: number | null;
  chemical_energy: number;
  efficiency: number;
  fill_ratio: number;
  muzzle_spin: number;
  gas_mass_exit: number;
  samples: Sample[];
}

export interface Point {
  t: number;
  x: number;
  y: number;
  z: number;
  v: number;
  vx: number;
  vy: number;
  mach: number;
}

export interface Impact {
  velocity: number;
  energy: number;
  momentum: number;
  energy_density: number;
  blunt_criterion: number;
  game_damage: number;
  penetrating: boolean;
}

export interface TableRow {
  distance: number;
  time: number;
  velocity: number;
  energy: number;
  drop: number;
  drift: number;
  mach: number;
}

export interface Warning {
  code: string;
  value: number;
}

export interface ScenarioResult {
  ok: boolean;
  error: string | null;
  name: string;
  interior: InteriorResult;
  muzzle: Impact | null;
  stability: { mode: string; sg: number | null } | null;
  atmosphere: { density: number; sound_speed: number; viscosity: number; pressure: number; temperature: number };
  max_range_m: number;
  max_range_deg: number;
  max_range_tof: number;
  max_range_apex: number;
  max_range_impact_v: number;
  max_range_points: Point[];
  hit: { elevation_deg: number; point: Point; impact: Impact; points: Point[]; flat_drop: number } | null;
  table: TableRow[];
  recoil: { velocity: number; energy: number; momentum: number } | null;
  flight_drag: DragModel | null;
  cd_curve: [number, number][];
  warnings: Warning[];
}

/** Fill every optional field with the same defaults as the Rust core (serde defaults). */
export function normalizeScenario(s: Partial<ScenarioInput> & { name: string }): ScenarioInput {
  const env: EnvUser = {
    target_m: 100, target_height_m: 0, height_m: 1.5, altitude_m: 0, temp_c: 15, humidity_pct: 0,
    wind_ms: 0, wind_clock: 12, latitude: null, azimuth: 0, powder_temp_c: null, ...(s.env ?? {}),
  };
  return {
    layout: 'direct', powder_id: '', powder: null, charge_g: 0, primer_mg: 0, case_cap_cm3: 0, case_len_mm: 0,
    oal_mm: 0, burst_mpa: 0, vent_d_mm: 0, vent_cd: 0.8, low_vol_cm3: 0, proj_mass_g: 0, bore_mm: 0, proj_len_mm: 0,
    drag: { kind: 'g1', bc: 0.3 }, stabilisation: 'auto', shot_start_mpa: 0, friction_mpa: 0, leak_mm2: 0, barrel_mm: 0,
    twist_mm: 0, heat_loss_pct: 10, weapon_kg: 1, backspin_rpm: 0, pmax_mpa: 0, table_step_m: 10,
    ...s,
    env,
  } as ScenarioInput;
}
