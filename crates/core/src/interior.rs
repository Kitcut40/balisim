//! Interior ballistics: lumped-parameter thermodynamic model.
//!
//! Noble-Abel equation of state, Résal energy balance, Vieille burn law with a grain
//! form function, Lagrange pressure gradient, shot-start pressure and bore friction,
//! heat loss, gas leakage around the projectile. Two layouts:
//!
//! * `Direct`: the projectile sits on the cartridge (classic firearm).
//! * `HighLow`: high-pressure chamber (blank cartridge) vented through an orifice into
//!   a low-pressure chamber behind the projectile (40 mm launchers).
//!
//! Integration: classical RK4 with an adaptive step limited by the burn and travel rates.

use crate::powder::Powder;
use serde::{Deserialize, Serialize};

pub const P_ATM: f64 = 101_325.0;
const R_AIR: f64 = 287.05;
const T_AMB: f64 = 293.15;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Layout {
    #[default]
    Direct,
    HighLow,
}

/// All inputs in SI units.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteriorConfig {
    pub layout: Layout,
    pub powder: Powder,
    /// Powder charge (kg).
    pub charge: f64,
    /// Primer gas-equivalent mass (kg).
    pub primer: f64,
    /// Case capacity (m^3), water volume.
    pub case_volume: f64,
    /// Length of the projectile seated inside the case (m), direct layout only.
    #[serde(default)]
    pub seating_depth: f64,
    /// Bore diameter (m).
    pub bore: f64,
    /// Projectile travel to the muzzle (m).
    pub travel: f64,
    /// Projectile mass (kg).
    pub projectile_mass: f64,
    /// Pressure needed to start the projectile (Pa).
    pub shot_start: f64,
    /// Mean bore resistance expressed as base pressure (Pa).
    pub friction: f64,
    /// Fraction of chemical energy lost to the walls (0..1).
    pub heat_loss: f64,
    /// Leak area around the projectile (m^2).
    #[serde(default)]
    pub leak_area: f64,
    /// High/low: initial low-pressure chamber volume (m^3).
    #[serde(default)]
    pub low_volume: f64,
    /// High/low: vent orifice diameter (m).
    #[serde(default)]
    pub vent_diameter: f64,
    /// High/low: vent discharge coefficient.
    #[serde(default = "default_cd")]
    pub vent_cd: f64,
    /// High/low: crimp opening pressure (Pa).
    #[serde(default)]
    pub burst_pressure: f64,
    /// Powder temperature (deg C).
    #[serde(default = "default_temp")]
    pub powder_temp: f64,
    /// Rifling twist (m per turn), 0 = smooth bore.
    #[serde(default)]
    pub twist: f64,
}

fn default_cd() -> f64 {
    0.8
}
fn default_temp() -> f64 {
    21.0
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Sample {
    /// Time (s).
    pub t: f64,
    /// Projectile travel (m).
    pub x: f64,
    /// Projectile velocity (m/s).
    pub v: f64,
    /// High-chamber pressure (Pa) (the only chamber in direct layout).
    pub p_high: f64,
    /// Low-chamber pressure (Pa) (high/low only).
    pub p_low: f64,
    /// Breech pressure (Pa) of the chamber that drives the projectile.
    pub p_breech: f64,
    /// Projectile base pressure (Pa).
    pub p_base: f64,
    /// Burnt powder fraction.
    pub psi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteriorResult {
    pub ok: bool,
    pub error: Option<String>,
    pub muzzle_velocity: f64,
    pub barrel_time: f64,
    pub muzzle_pressure: f64,
    pub burnt_fraction: f64,
    pub p_breech_max: f64,
    pub p_high_max: f64,
    pub p_low_max: f64,
    pub t_peak: f64,
    pub t_vent: Option<f64>,
    pub t_start: Option<f64>,
    /// Chemical energy of the charge, F * w / (gamma - 1) (J).
    pub chemical_energy: f64,
    /// Muzzle kinetic energy / chemical energy.
    pub efficiency: f64,
    /// Fill ratio: bulk powder volume / free case volume.
    pub fill_ratio: f64,
    /// Spin at the muzzle (rad/s), 0 for smooth bores.
    pub muzzle_spin: f64,
    /// Gas mass still in the barrel at exit (kg).
    pub gas_mass_exit: f64,
    pub samples: Vec<Sample>,
}

fn orifice_flow(pu: f64, pd: f64, mu: f64, uu: f64, g: f64, area: f64) -> (f64, f64) {
    if pu <= pd || mu <= 0.0 || area <= 0.0 {
        return (0.0, 0.0);
    }
    let rt = (g - 1.0) * uu / mu;
    if rt <= 0.0 {
        return (0.0, 0.0);
    }
    let r = pd / pu;
    let crit = (2.0 / (g + 1.0)).powf(g / (g - 1.0));
    let m = if r <= crit {
        area * pu * (g / rt).sqrt() * (2.0 / (g + 1.0)).powf((g + 1.0) / (2.0 * (g - 1.0)))
    } else {
        area * pu * ((2.0 * g / ((g - 1.0) * rt)) * (r.powf(2.0 / g) - r.powf((g + 1.0) / g))).max(0.0).sqrt()
    };
    (m, m * g / (g - 1.0) * rt)
}

struct Model<'a> {
    c: &'a InteriorConfig,
    area: f64,
    v_high0: f64,
    vent_area: f64,
    leak_area: f64,
    f_eff: f64,
    e1: f64,
    hilo: bool,
}

#[derive(Clone, Copy)]
struct Pressures {
    psi: f64,
    p_high: f64,
    p_low: f64,
}

const N: usize = 7; // Z, mH, UH, mL, UL, x, v

impl<'a> Model<'a> {
    fn pressures(&self, s: &[f64; N]) -> Pressures {
        let c = self.c;
        let g = c.powder.gamma;
        let psi = c.powder.shape.psi(s[0]);
        let mut vh = self.v_high0 - c.charge * (1.0 - psi) / c.powder.density - c.powder.covolume * s[1];
        if !self.hilo {
            vh += self.area * s[5];
        }
        let p_high = ((g - 1.0) * s[2] / vh.max(1e-12)).max(0.0);
        let p_low = if self.hilo {
            let vl = c.low_volume + self.area * s[5] - c.powder.covolume * s[3];
            ((g - 1.0) * s[4] / vl.max(1e-12)).max(0.0)
        } else {
            0.0
        };
        Pressures { psi, p_high, p_low }
    }

    fn deriv(&self, s: &[f64; N], moving: bool, vent: bool, out: &mut [f64; N]) {
        let c = self.c;
        let g = c.powder.gamma;
        let pr = self.pressures(s);
        *out = [0.0; N];
        if s[0] < 1.0 {
            let dz = c.powder.burn_rate(pr.p_high, c.powder_temp) / self.e1;
            out[0] = dz;
            let dm = c.charge * c.powder.shape.dpsi_dz(s[0]) * dz;
            out[1] += dm;
            out[2] += dm * self.f_eff / (g - 1.0);
        }
        if self.hilo && vent {
            if pr.p_high >= pr.p_low {
                let (m, e) = orifice_flow(pr.p_high, pr.p_low, s[1], s[2], g, self.vent_area);
                out[1] -= m;
                out[2] -= e;
                out[3] += m;
                out[4] += e;
            } else {
                let (m, e) = orifice_flow(pr.p_low, pr.p_high, s[3], s[4], g, self.vent_area);
                out[3] -= m;
                out[4] -= e;
                out[1] += m;
                out[2] += e;
            }
        }
        if self.leak_area > 0.0 {
            if self.hilo {
                let (m, e) = orifice_flow(pr.p_low, P_ATM, s[3], s[4], g, self.leak_area);
                out[3] -= m;
                out[4] -= e;
            } else {
                let (m, e) = orifice_flow(pr.p_high, P_ATM, s[1], s[2], g, self.leak_area);
                out[1] -= m;
                out[2] -= e;
            }
        }
        if moving {
            let pc = if self.hilo { pr.p_low } else { pr.p_high };
            let mg = if self.hilo { s[3] } else { s[1] };
            let pb = pc / (1.0 + mg / (3.0 * c.projectile_mass));
            let mut a = self.area * (pb - c.friction - P_ATM) / c.projectile_mass;
            if s[6] <= 0.0 && a < 0.0 {
                a = 0.0;
            }
            out[5] = s[6];
            out[6] = a;
            let work = pc * self.area * s[6].max(0.0);
            if self.hilo {
                out[4] -= work;
            } else {
                out[2] -= work;
            }
        }
    }
}

/// Run the interior ballistics simulation.
pub fn simulate(c: &InteriorConfig) -> InteriorResult {
    let hilo = c.layout == Layout::HighLow;
    let area = std::f64::consts::PI * c.bore * c.bore / 4.0;
    let v_high0 = if hilo { c.case_volume } else { c.case_volume - area * c.seating_depth };
    let g = c.powder.gamma;
    let chem = c.charge * c.powder.force / (g - 1.0);
    let powder_vol = c.charge / c.powder.density;
    let mut res = InteriorResult {
        ok: false,
        error: None,
        muzzle_velocity: 0.0,
        barrel_time: 0.0,
        muzzle_pressure: 0.0,
        burnt_fraction: 0.0,
        p_breech_max: 0.0,
        p_high_max: 0.0,
        p_low_max: 0.0,
        t_peak: 0.0,
        t_vent: None,
        t_start: None,
        chemical_energy: chem,
        efficiency: 0.0,
        fill_ratio: if v_high0 > 0.0 { c.charge / c.powder.bulk_density / v_high0 } else { 0.0 },
        muzzle_spin: 0.0,
        gas_mass_exit: 0.0,
        samples: Vec::new(),
    };
    let invalid = |m: &str| InteriorResult { error: Some(m.to_string()), ..res.clone() };
    if !(c.bore > 0.0 && c.projectile_mass > 0.0 && c.charge > 0.0 && c.travel > 0.0) {
        return invalid("Paramètres incomplets : calibre, masse, charge et course doivent être positifs.");
    }
    if !(c.powder.web > 0.0 && c.powder.beta_mm > 0.0 && g > 1.0) {
        return invalid("Paramètres de poudre invalides.");
    }
    if v_high0 <= powder_vol * 1.001 {
        return invalid("Volume de chambre trop petit : la poudre ne rentre pas dans l'étui.");
    }

    let model = Model {
        c,
        area,
        v_high0,
        vent_area: if hilo { std::f64::consts::PI * c.vent_diameter.powi(2) / 4.0 * c.vent_cd } else { 0.0 },
        leak_area: c.leak_area * 0.7,
        f_eff: c.powder.force * (1.0 - c.heat_loss),
        e1: c.powder.web / 2.0,
        hilo,
    };

    let mut s = [0.0; N];
    s[1] = c.primer;
    s[2] = c.primer * model.f_eff / (g - 1.0);
    if hilo {
        s[3] = P_ATM * c.low_volume / (R_AIR * T_AMB);
        s[4] = P_ATM * c.low_volume / (g - 1.0);
    } else {
        let va = v_high0 - powder_vol;
        s[1] += P_ATM * va / (R_AIR * T_AMB);
        s[2] += P_ATM * va / (g - 1.0);
    }

    let mut moving = false;
    let mut vent = !hilo;
    let mut t = 0.0;
    let dt_max: f64 = if hilo { 2e-7 } else { 5e-8 };
    let sample_dt = if hilo { 2e-6 } else { 1e-6 };
    let t_max = 0.25;
    let mut last_sample = -1.0;
    let (mut k1, mut k2, mut k3, mut k4, mut tmp) = ([0.0; N], [0.0; N], [0.0; N], [0.0; N], [0.0; N]);

    let record = |s: &[f64; N], pr: Pressures, t: f64, samples: &mut Vec<Sample>| {
        let mg = if hilo { s[3] } else { s[1] };
        let pc = if hilo { pr.p_low } else { pr.p_high };
        let pb = pc / (1.0 + mg / (3.0 * c.projectile_mass));
        samples.push(Sample {
            t,
            x: s[5],
            v: s[6],
            p_high: pr.p_high,
            p_low: pr.p_low,
            p_breech: pb * (1.0 + mg / (2.0 * c.projectile_mass)),
            p_base: pb,
            psi: pr.psi,
        });
    };
    record(&s, model.pressures(&s), 0.0, &mut res.samples);

    let mut exited = false;
    while t < t_max {
        model.deriv(&s, moving, vent, &mut k1);
        let mut h = dt_max;
        if k1[0] > 0.0 {
            h = h.min(0.002 / k1[0]);
        }
        if s[6] > 0.0 {
            h = h.min((c.travel / 4000.0).max(1e-5) / s[6]);
        }
        h = h.max(1e-9);
        for i in 0..N {
            tmp[i] = s[i] + 0.5 * h * k1[i];
        }
        model.deriv(&tmp, moving, vent, &mut k2);
        for i in 0..N {
            tmp[i] = s[i] + 0.5 * h * k2[i];
        }
        model.deriv(&tmp, moving, vent, &mut k3);
        for i in 0..N {
            tmp[i] = s[i] + h * k3[i];
        }
        model.deriv(&tmp, moving, vent, &mut k4);
        for i in 0..N {
            s[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
        }
        s[0] = s[0].min(1.0);
        for v in s.iter_mut().skip(1).take(4) {
            *v = v.max(0.0);
        }
        s[6] = s[6].max(0.0);
        t += h;

        let pr = model.pressures(&s);
        let mg = if hilo { s[3] } else { s[1] };
        let pc = if hilo { pr.p_low } else { pr.p_high };
        let pb = pc / (1.0 + mg / (3.0 * c.projectile_mass));
        let pbr = pb * (1.0 + mg / (2.0 * c.projectile_mass));
        if pr.p_high > res.p_high_max {
            res.p_high_max = pr.p_high;
            if !hilo {
                res.t_peak = t;
            }
        }
        if pr.p_low > res.p_low_max {
            res.p_low_max = pr.p_low;
            if hilo {
                res.t_peak = t;
            }
        }
        res.p_breech_max = res.p_breech_max.max(pbr);
        if hilo && !vent && pr.p_high >= c.burst_pressure {
            vent = true;
            res.t_vent = Some(t);
        }
        if !moving && pb - P_ATM >= c.shot_start {
            moving = true;
            res.t_start = Some(t);
        }
        if t - last_sample >= sample_dt {
            record(&s, pr, t, &mut res.samples);
            last_sample = t;
        }
        if s[5] >= c.travel {
            record(&s, pr, t, &mut res.samples);
            res.muzzle_velocity = s[6];
            res.barrel_time = t;
            res.muzzle_pressure = pc;
            res.burnt_fraction = pr.psi;
            res.gas_mass_exit = mg;
            exited = true;
            break;
        }
        if t > 0.02 && s[0] >= 1.0 && ((!moving && vent) || (moving && s[6] <= 0.0)) {
            break;
        }
    }

    if exited {
        res.ok = true;
        res.efficiency = 0.5 * c.projectile_mass * res.muzzle_velocity.powi(2) / chem;
        if c.twist > 0.0 {
            res.muzzle_spin = 2.0 * std::f64::consts::PI * res.muzzle_velocity / c.twist;
        }
    } else {
        res.error = Some(if moving {
            "Le projectile s'arrête dans le canon : pas assez d'énergie pour vaincre le frottement.".into()
        } else {
            "Le projectile ne démarre pas : la pression n'atteint jamais la pression de décollement.".into()
        });
    }
    res
}
