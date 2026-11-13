//! A full shot described in user units (mm, g, cm^3, MPa, kJ/kg, %, m/s, deg C):
//! interior -> stability -> exterior -> terminal, plus recoil and warnings.
//! This is the single entry point used by the UI (through WebAssembly) and the game runtime.

use crate::atmosphere::Atmosphere;
use crate::drag::DragModel;
use crate::exterior::{self, Environment, Launch, Point, Projectile, Stop};
use crate::interior::{self, InteriorConfig, InteriorResult, Layout};
use crate::powder::{GrainShape, Powder, Quality};
use crate::stability::miller_sg;
use crate::terminal::{self, Impact};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowderUser {
    pub id: String,
    pub name: String,
    /// kJ/kg
    pub force_kj: f64,
    pub gamma: f64,
    /// cm^3/g
    pub covolume: f64,
    /// g/cm^3
    pub density: f64,
    /// g/cm^3
    #[serde(default = "bulk")]
    pub bulk_density: f64,
    /// mm/s at 1 MPa
    pub beta_mm: f64,
    pub alpha: f64,
    /// mm
    pub web_mm: f64,
    pub shape: GrainShape,
    /// % of burn rate per deg C
    #[serde(default)]
    pub temp_coeff_pct: f64,
    #[serde(default)]
    pub family: String,
    #[serde(default)]
    pub quality: Quality,
    #[serde(default)]
    pub source: String,
}

fn bulk() -> f64 {
    0.9
}

impl PowderUser {
    pub fn to_si(&self) -> Powder {
        Powder {
            id: self.id.clone(),
            name: self.name.clone(),
            force: self.force_kj * 1e3,
            gamma: self.gamma,
            covolume: self.covolume * 1e-3,
            density: self.density * 1e3,
            bulk_density: self.bulk_density * 1e3,
            beta_mm: self.beta_mm,
            alpha: self.alpha,
            web: self.web_mm * 1e-3,
            shape: self.shape,
            temp_coeff: self.temp_coeff_pct / 100.0,
            quality: self.quality,
            source: self.source.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Stabilisation {
    /// Spin from rifling (twist > 0) or none.
    #[default]
    Auto,
    Fins,
    /// Assume nose-first flight whatever the spin (hypothesis, flagged).
    ForcedNoseFirst,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvUser {
    pub target_m: f64,
    #[serde(default)]
    pub target_height_m: f64,
    #[serde(default = "h0")]
    pub height_m: f64,
    #[serde(default)]
    pub altitude_m: f64,
    #[serde(default = "t15")]
    pub temp_c: f64,
    #[serde(default)]
    pub humidity_pct: f64,
    /// Wind speed (m/s).
    #[serde(default)]
    pub wind_ms: f64,
    /// Wind direction "from", clock position 1..12 (12 = headwind, 3 = from the right).
    #[serde(default = "twelve")]
    pub wind_clock: f64,
    /// Latitude (deg); null/absent disables Coriolis.
    #[serde(default)]
    pub latitude: Option<f64>,
    #[serde(default)]
    pub azimuth: f64,
    /// Powder temperature (deg C); defaults to air temperature.
    #[serde(default)]
    pub powder_temp_c: Option<f64>,
}

fn h0() -> f64 {
    1.5
}
fn t15() -> f64 {
    15.0
}
fn twelve() -> f64 {
    12.0
}

impl Default for EnvUser {
    fn default() -> Self {
        EnvUser {
            target_m: 100.0,
            target_height_m: 0.0,
            height_m: 1.5,
            altitude_m: 0.0,
            temp_c: 15.0,
            humidity_pct: 0.0,
            wind_ms: 0.0,
            wind_clock: 12.0,
            latitude: None,
            azimuth: 0.0,
            powder_temp_c: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioInput {
    pub name: String,
    pub layout: Layout,
    /// Powder id in the library (used when `powder` is absent).
    #[serde(default)]
    pub powder_id: String,
    #[serde(default)]
    pub powder: Option<PowderUser>,
    pub charge_g: f64,
    pub primer_mg: f64,
    pub case_cap_cm3: f64,
    pub case_len_mm: f64,
    #[serde(default)]
    pub oal_mm: f64,
    #[serde(default)]
    pub burst_mpa: f64,
    #[serde(default)]
    pub vent_d_mm: f64,
    #[serde(default = "cd08")]
    pub vent_cd: f64,
    #[serde(default)]
    pub low_vol_cm3: f64,
    pub proj_mass_g: f64,
    pub bore_mm: f64,
    pub proj_len_mm: f64,
    pub drag: DragModel,
    #[serde(default)]
    pub stabilisation: Stabilisation,
    pub shot_start_mpa: f64,
    pub friction_mpa: f64,
    #[serde(default)]
    pub leak_mm2: f64,
    pub barrel_mm: f64,
    /// Rifling twist (mm per turn), 0 = smooth bore.
    #[serde(default)]
    pub twist_mm: f64,
    pub heat_loss_pct: f64,
    pub weapon_kg: f64,
    /// Hop-up / backspin (rpm), spheres only.
    #[serde(default)]
    pub backspin_rpm: f64,
    /// Max allowed pressure of the calibre (MPa), 0 = unknown.
    #[serde(default)]
    pub pmax_mpa: f64,
    #[serde(default)]
    pub env: EnvUser,
    #[serde(default = "step10")]
    pub table_step_m: f64,
}

fn cd08() -> f64 {
    0.8
}
fn step10() -> f64 {
    10.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    pub code: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableRow {
    pub distance: f64,
    pub time: f64,
    pub velocity: f64,
    pub energy: f64,
    /// Drop below the bore line for a flat shot (m).
    pub drop: f64,
    /// Lateral deflection (wind + spin drift + Coriolis), m, positive = right.
    pub drift: f64,
    pub mach: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stability {
    /// "spin", "fins", "sphere", "forced", "tumbling"
    pub mode: String,
    pub sg: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recoil {
    pub velocity: f64,
    pub energy: f64,
    pub momentum: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HitOut {
    pub elevation_deg: f64,
    pub point: Point,
    pub impact: Impact,
    pub points: Vec<Point>,
    /// Drop at the target for a flat shot (m).
    pub flat_drop: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioResult {
    pub ok: bool,
    pub error: Option<String>,
    pub name: String,
    pub interior: InteriorResult,
    pub muzzle: Option<Impact>,
    pub stability: Option<Stability>,
    pub atmosphere: Atmosphere,
    pub max_range_m: f64,
    pub max_range_deg: f64,
    pub max_range_tof: f64,
    pub max_range_apex: f64,
    pub max_range_impact_v: f64,
    pub max_range_points: Vec<Point>,
    pub hit: Option<HitOut>,
    pub table: Vec<TableRow>,
    pub recoil: Option<Recoil>,
    /// Effective drag model used in flight (after stability decisions).
    pub flight_drag: Option<DragModel>,
    /// Effective Cd vs Mach of the flying projectile, sampled for game engines
    /// (Reynolds number evaluated at each Mach in the shot's atmosphere).
    pub cd_curve: Vec<(f64, f64)>,
    pub warnings: Vec<Warning>,
}

/// Body-wall model for the blunt criterion (thorax, adult), estimated.
const TARGET_MASS: f64 = 70.0;
const WALL_CM: f64 = 2.0;

pub fn resolve_powder(input: &ScenarioInput, powders: &[PowderUser]) -> Option<PowderUser> {
    input.powder.clone().or_else(|| powders.iter().find(|p| p.id == input.powder_id).cloned())
}

pub fn interior_config(s: &ScenarioInput, powder: &PowderUser) -> InteriorConfig {
    let mm = 1e-3;
    let hilo = s.layout == Layout::HighLow;
    let seat = (s.case_len_mm + s.proj_len_mm - s.oal_mm).max(0.0) * mm;
    let travel = if hilo { s.barrel_mm * mm } else { ((s.barrel_mm - (s.oal_mm - s.proj_len_mm)) * mm).max(mm) };
    InteriorConfig {
        layout: s.layout,
        powder: powder.to_si(),
        charge: s.charge_g * 1e-3,
        primer: s.primer_mg * 1e-6,
        case_volume: s.case_cap_cm3 * 1e-6,
        seating_depth: if hilo { 0.0 } else { seat },
        bore: s.bore_mm * mm,
        travel,
        projectile_mass: s.proj_mass_g * 1e-3,
        shot_start: s.shot_start_mpa * 1e6,
        friction: s.friction_mpa * 1e6,
        heat_loss: s.heat_loss_pct / 100.0,
        leak_area: s.leak_mm2 * 1e-6,
        low_volume: s.low_vol_cm3 * 1e-6,
        vent_diameter: s.vent_d_mm * mm,
        vent_cd: s.vent_cd,
        burst_pressure: s.burst_mpa * 1e6,
        powder_temp: s.env.powder_temp_c.unwrap_or(s.env.temp_c),
        twist: s.twist_mm * mm,
    }
}

fn decimate(points: &[Point], max: usize) -> Vec<Point> {
    if points.len() <= max {
        return points.to_vec();
    }
    let step = points.len() as f64 / max as f64;
    let mut out: Vec<Point> = (0..max).map(|i| points[(i as f64 * step) as usize]).collect();
    out.push(*points.last().unwrap());
    out
}

pub fn run(input: &ScenarioInput, powders: &[PowderUser]) -> ScenarioResult {
    let atm = Atmosphere::new(input.env.altitude_m, input.env.temp_c, input.env.humidity_pct / 100.0, None);
    let mut out = ScenarioResult {
        ok: false,
        error: None,
        name: input.name.clone(),
        interior: interior::simulate(&InteriorConfig {
            layout: Layout::Direct,
            powder: PowderUser {
                id: String::new(), name: String::new(), force_kj: 1.0, gamma: 1.2, covolume: 1.0, density: 1.6,
                bulk_density: 0.9, beta_mm: 1.0, alpha: 0.9, web_mm: 0.1, shape: GrainShape::Flake,
                temp_coeff_pct: 0.0, family: String::new(), quality: Quality::Estimated, source: String::new(),
            }.to_si(),
            charge: 0.0, primer: 0.0, case_volume: 0.0, seating_depth: 0.0, bore: 0.0, travel: 0.0,
            projectile_mass: 0.0, shot_start: 0.0, friction: 0.0, heat_loss: 0.0, leak_area: 0.0,
            low_volume: 0.0, vent_diameter: 0.0, vent_cd: 0.8, burst_pressure: 0.0, powder_temp: 21.0, twist: 0.0,
        }),
        muzzle: None,
        stability: None,
        atmosphere: atm,
        max_range_m: 0.0,
        max_range_deg: 0.0,
        max_range_tof: 0.0,
        max_range_apex: 0.0,
        max_range_impact_v: 0.0,
        max_range_points: vec![],
        hit: None,
        table: vec![],
        recoil: None,
        flight_drag: None,
        cd_curve: vec![],
        warnings: vec![],
    };
    let Some(powder) = resolve_powder(input, powders) else {
        out.error = Some(format!("Poudre introuvable : {}", input.powder_id));
        return out;
    };
    let cfg = interior_config(input, &powder);
    let ir = interior::simulate(&cfg);
    out.interior = ir.clone();
    if !ir.ok {
        out.error = ir.error.clone();
        return out;
    }
    let mut w = |code: &str, value: f64| out.warnings.push(Warning { code: code.into(), value });

    let v0 = ir.muzzle_velocity;
    let mass = cfg.projectile_mass;
    let d = cfg.bore;
    let len = input.proj_len_mm * 1e-3;

    // Pressure checks
    let p_check = if input.layout == Layout::HighLow { ir.p_high_max } else { ir.p_breech_max };
    if input.pmax_mpa > 0.0 && p_check > input.pmax_mpa * 1e6 {
        w("overpressure", (p_check / (input.pmax_mpa * 1e6) - 1.0) * 100.0);
    } else if input.pmax_mpa > 0.0 && p_check > 0.95 * input.pmax_mpa * 1e6 {
        w("near_pmax", p_check / (input.pmax_mpa * 1e6) * 100.0);
    }
    if input.layout == Layout::Direct && p_check > 450e6 {
        w("extreme_pressure", p_check / 1e6);
    }
    if ir.burnt_fraction < 0.9 {
        w("unburnt", (1.0 - ir.burnt_fraction) * 100.0);
    }
    if ir.fill_ratio > 1.0 {
        w("compressed", ir.fill_ratio * 100.0);
    } else if input.layout == Layout::Direct && ir.fill_ratio < 0.4 {
        w("low_fill", ir.fill_ratio * 100.0);
    }
    if powder.quality == Quality::Estimated {
        w("estimated_powder", 0.0);
    }

    // Stability -> effective flight drag
    let mut drag = input.drag.clone();
    let stab = if drag.is_sphere() {
        Stability { mode: "sphere".into(), sg: None }
    } else {
        match input.stabilisation {
            Stabilisation::Fins => Stability { mode: "fins".into(), sg: None },
            Stabilisation::ForcedNoseFirst => {
                w("forced_nose_first", 0.0);
                Stability { mode: "forced".into(), sg: None }
            }
            Stabilisation::Auto => match miller_sg(mass, d, len, cfg.twist, v0, &atm) {
                Some(sg) if sg >= 1.0 => {
                    if sg < 1.3 {
                        w("marginal_stability", sg);
                    }
                    Stability { mode: "spin".into(), sg: Some(sg) }
                }
                sg => {
                    w("tumbling", sg.unwrap_or(0.0));
                    drag = DragModel::Tumbling { cd: 1.0 };
                    Stability { mode: "tumbling".into(), sg }
                }
            },
        }
    };
    if input.leak_mm2 > 0.0 && input.layout == Layout::Direct && input.twist_mm > 0.0 {
        w("leak", input.leak_mm2);
    }

    let proj = Projectile { mass, diameter: d, length: len, drag: drag.clone() };
    let penetrating = matches!(input.drag, DragModel::G1 { .. } | DragModel::G7 { .. } | DragModel::Table { .. });
    // Wind: speed + clock direction it comes FROM (12 = headwind, 3 = from the right).
    let ang = input.env.wind_clock / 12.0 * std::f64::consts::TAU;
    let wind = [-input.env.wind_ms * ang.cos(), 0.0, -input.env.wind_ms * ang.sin()];
    let env = Environment {
        atmosphere: atm,
        wind,
        latitude: input.env.latitude.unwrap_or(f64::NAN),
        azimuth: input.env.azimuth,
    };
    let launch = Launch {
        velocity: v0,
        elevation: 0.0,
        height: input.env.height_m.max(0.0),
        backspin: input.backspin_rpm * std::f64::consts::TAU / 60.0,
        spin_tau: 8.0,
        // Litz's spin-drift formula is fitted on rifle bullets only (G1/G7 bodies).
        sg: if stab.mode == "spin" && matches!(drag, DragModel::G1 { .. } | DragModel::G7 { .. }) { stab.sg.unwrap_or(0.0) } else { 0.0 },
        twist_sign: 1.0,
    };

    let mr = exterior::max_range(&proj, &env, &launch);
    out.max_range_m = mr.trajectory.range;
    out.max_range_deg = mr.elevation_deg;
    out.max_range_tof = mr.trajectory.time_of_flight;
    out.max_range_apex = mr.trajectory.apex;
    out.max_range_impact_v = mr.trajectory.impact_velocity;
    out.max_range_points = decimate(&mr.trajectory.points, 600);

    let table_max = mr.trajectory.range.min((input.env.target_m * 1.5).max(1000.0));
    let flat = exterior::simulate(&proj, &env, &launch, Stop { max_x: table_max, ground_y: -1e5, max_t: 400.0 });
    let step = input.table_step_m.max(1.0);
    let mut dist = 0.0;
    while dist <= table_max + 1e-9 && out.table.len() < 500 {
        if let Some(p) = exterior::at_x(&flat.points, dist) {
            out.table.push(TableRow {
                distance: dist,
                time: p.t,
                velocity: p.v,
                energy: 0.5 * mass * p.v * p.v,
                drop: -p.y,
                drift: p.z,
                mach: p.mach,
            });
        } else {
            break;
        }
        dist += step;
    }

    let target = input.env.target_m.max(1.0);
    if target < mr.trajectory.range {
        if let Some(h) = exterior::hit(&proj, &env, &launch, target, input.env.target_height_m, mr.elevation_deg) {
            let imp = terminal::impact(mass, d, h.point.v, TARGET_MASS, WALL_CM, penetrating);
            let flat_drop = exterior::at_x(&flat.points, target).map(|p| -p.y).unwrap_or(f64::NAN);
            out.hit = Some(HitOut {
                elevation_deg: h.elevation_deg,
                point: h.point,
                impact: imp,
                points: decimate(&h.trajectory.points, 600),
                flat_drop,
            });
        }
    } else {
        w("out_of_range", mr.trajectory.range);
    }

    out.muzzle = Some(terminal::impact(mass, d, v0, TARGET_MASS, WALL_CM, penetrating));
    let gas = cfg.charge * ir.burnt_fraction;
    let p = mass * v0 + gas * 1.7 * v0;
    let mw = input.weapon_kg.max(0.05);
    let vr = p / mw;
    out.recoil = Some(Recoil { velocity: vr, energy: 0.5 * mw * vr * vr, momentum: p });
    out.cd_curve = (0..=60)
        .map(|i| {
            let mach = i as f64 * 0.05;
            let v = mach * atm.sound_speed;
            let re = atm.density * v * d / atm.viscosity;
            (mach, (drag.cd(mach, re, mass, d) * 1e4).round() / 1e4)
        })
        .collect();
    out.stability = Some(stab);
    out.flight_drag = Some(drag);
    out.ok = true;
    out
}
