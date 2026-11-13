//! Exterior ballistics: 3-DOF point mass in a local frame
//! (x downrange, y up, z to the right), RK4 with adaptive step.
//!
//! Forces: gravity, drag Cd(Mach, Re) on the air-relative velocity (3D wind),
//! Magnus lift for spinning spheres (hop-up, dimpled balls), Coriolis acceleration.
//! Spin drift of rifled bullets is added with Litz's empirical formula.

use crate::atmosphere::Atmosphere;
use crate::drag::DragModel;
use serde::{Deserialize, Serialize};

pub const G0: f64 = 9.806_65;
const OMEGA_EARTH: f64 = 7.292_115e-5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Projectile {
    pub mass: f64,
    pub diameter: f64,
    #[serde(default)]
    pub length: f64,
    pub drag: DragModel,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Environment {
    pub atmosphere: Atmosphere,
    /// Air velocity vector in the local frame (m/s): x = tailwind, z = wind from the left.
    pub wind: [f64; 3],
    /// Latitude (deg) for Coriolis; NaN disables it.
    pub latitude: f64,
    /// Firing azimuth (deg from north).
    pub azimuth: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Launch {
    pub velocity: f64,
    /// Elevation (rad).
    pub elevation: f64,
    /// Height of the muzzle above the ground (m).
    pub height: f64,
    /// Backspin rate (rad/s) for Magnus lift on spheres (hop-up). 0 = none.
    #[serde(default)]
    pub backspin: f64,
    /// Spin decay time constant (s).
    #[serde(default = "default_tau")]
    pub spin_tau: f64,
    /// Gyroscopic stability factor (for spin drift), 0 = no drift.
    #[serde(default)]
    pub sg: f64,
    /// Right-hand twist (+1) or left (-1).
    #[serde(default = "one")]
    pub twist_sign: f64,
}

fn default_tau() -> f64 {
    8.0
}
fn one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub v: f64,
    pub vx: f64,
    pub vy: f64,
    pub mach: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct Stop {
    pub max_x: f64,
    /// Stop when y falls below this (m, relative to the muzzle).
    pub ground_y: f64,
    pub max_t: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trajectory {
    pub points: Vec<Point>,
    pub range: f64,
    pub time_of_flight: f64,
    pub impact_velocity: f64,
    pub apex: f64,
}

/// Magnus lift coefficient of a spinning sphere vs spin parameter S = w r / v
/// (Sawicki, Hubbard & Stronge 2003 fit; estimated for other balls).
pub fn magnus_cl(s: f64) -> f64 {
    if s <= 0.0 {
        0.0
    } else if s < 0.1 {
        1.5 * s
    } else {
        (0.09 + 0.6 * s).min(0.4)
    }
}

pub fn simulate(p: &Projectile, env: &Environment, launch: &Launch, stop: Stop) -> Trajectory {
    let atm = env.atmosphere;
    let area = std::f64::consts::PI * p.diameter * p.diameter / 4.0;
    let k = 0.5 * atm.density * area / p.mass;
    let radius = p.diameter / 2.0;
    let sphere = p.drag.is_sphere();
    let coriolis = if env.latitude.is_finite() {
        let (lat, az) = (env.latitude.to_radians(), env.azimuth.to_radians());
        [OMEGA_EARTH * lat.cos() * az.cos(), OMEGA_EARTH * lat.sin(), -OMEGA_EARTH * lat.cos() * az.sin()]
    } else {
        [0.0; 3]
    };

    let acc = |v: [f64; 3], t: f64| -> [f64; 3] {
        let r = [v[0] - env.wind[0], v[1] - env.wind[1], v[2] - env.wind[2]];
        let vr = (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]).sqrt().max(1e-9);
        let mach = vr / atm.sound_speed;
        let re = atm.density * vr * p.diameter / atm.viscosity;
        let cd = p.drag.cd(mach, re, p.mass, p.diameter);
        let kd = k * cd * vr;
        let mut a = [-kd * r[0], -kd * r[1] - G0, -kd * r[2]];
        if sphere && launch.backspin > 0.0 {
            // Backspin axis = +z; lift direction = z_hat x v_hat (perpendicular to v, upward).
            let w = launch.backspin * (-t / launch.spin_tau.max(0.01)).exp();
            let cl = magnus_cl(w * radius / vr);
            let kl = k * cl * vr;
            a[0] += -kl * r[1];
            a[1] += kl * r[0];
        }
        // Coriolis: a = -2 Omega x v
        let om = coriolis;
        a[0] -= 2.0 * (om[1] * v[2] - om[2] * v[1]);
        a[1] -= 2.0 * (om[2] * v[0] - om[0] * v[2]);
        a[2] -= 2.0 * (om[0] * v[1] - om[1] * v[0]);
        a
    };

    let mut pos = [0.0, 0.0, 0.0];
    let mut vel = [launch.velocity * launch.elevation.cos(), launch.velocity * launch.elevation.sin(), 0.0];
    let mut t = 0.0;
    let mach0 = launch.velocity / atm.sound_speed;
    let mut pts = vec![Point { t, x: 0.0, y: 0.0, z: 0.0, v: launch.velocity, vx: vel[0], vy: vel[1], mach: mach0 }];
    let mut apex: f64 = 0.0;
    let drift = |t: f64| -> f64 {
        if launch.sg > 0.0 {
            launch.twist_sign * 0.0254 * 1.25 * (launch.sg + 1.2) * t.powf(1.83)
        } else {
            0.0
        }
    };
    let mut last_rec = 0.0;
    let rec_dt = 0.01;

    while t < stop.max_t {
        let speed = (vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]).sqrt();
        let h = (1.5 / speed.max(1.0)).clamp(0.0005, 0.004);
        let a1 = acc(vel, t);
        let v2 = [vel[0] + 0.5 * h * a1[0], vel[1] + 0.5 * h * a1[1], vel[2] + 0.5 * h * a1[2]];
        let a2 = acc(v2, t + 0.5 * h);
        let v3 = [vel[0] + 0.5 * h * a2[0], vel[1] + 0.5 * h * a2[1], vel[2] + 0.5 * h * a2[2]];
        let a3 = acc(v3, t + 0.5 * h);
        let v4 = [vel[0] + h * a3[0], vel[1] + h * a3[1], vel[2] + h * a3[2]];
        let a4 = acc(v4, t + h);
        let prev = pos;
        for i in 0..3 {
            pos[i] += h * vel[i] + h * h / 6.0 * (a1[i] + a2[i] + a3[i]);
            vel[i] += h / 6.0 * (a1[i] + 2.0 * a2[i] + 2.0 * a3[i] + a4[i]);
        }
        t += h;
        apex = apex.max(pos[1]);
        let v = (vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]).sqrt();
        if pos[1] <= stop.ground_y {
            let f = (prev[1] - stop.ground_y) / (prev[1] - pos[1]);
            let te = t - h * (1.0 - f);
            pts.push(Point {
                t: te,
                x: prev[0] + (pos[0] - prev[0]) * f,
                y: stop.ground_y,
                z: prev[2] + (pos[2] - prev[2]) * f + drift(te),
                v,
                vx: vel[0],
                vy: vel[1],
                mach: v / atm.sound_speed,
            });
            break;
        }
        let done = pos[0] >= stop.max_x;
        if t - last_rec >= rec_dt || done {
            pts.push(Point { t, x: pos[0], y: pos[1], z: pos[2] + drift(t), v, vx: vel[0], vy: vel[1], mach: v / atm.sound_speed });
            last_rec = t;
        }
        if done {
            break;
        }
    }
    let last = *pts.last().unwrap();
    Trajectory { range: last.x, time_of_flight: last.t, impact_velocity: last.v, apex, points: pts }
}

/// Linear interpolation of a trajectory at downrange distance `x`.
pub fn at_x(points: &[Point], x: f64) -> Option<Point> {
    if x <= 0.0 {
        return points.first().copied();
    }
    points.windows(2).find(|w| w[1].x >= x).map(|w| {
        let (a, b) = (w[0], w[1]);
        let f = (x - a.x) / (b.x - a.x).max(1e-12);
        let l = |p: f64, q: f64| p + (q - p) * f;
        Point { t: l(a.t, b.t), x, y: l(a.y, b.y), z: l(a.z, b.z), v: l(a.v, b.v), vx: l(a.vx, b.vx), vy: l(a.vy, b.vy), mach: l(a.mach, b.mach) }
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaxRange {
    pub elevation_deg: f64,
    pub trajectory: Trajectory,
}

pub fn max_range(p: &Projectile, env: &Environment, launch: &Launch) -> MaxRange {
    let run = |deg: f64| {
        let l = Launch { elevation: deg.to_radians(), ..*launch };
        simulate(p, env, &l, Stop { max_x: f64::INFINITY, ground_y: -launch.height, max_t: 400.0 })
    };
    let (mut a, mut b) = (1.0_f64, 60.0_f64);
    let gr = (5.0_f64.sqrt() - 1.0) / 2.0;
    let mut c1 = b - gr * (b - a);
    let mut c2 = a + gr * (b - a);
    let mut f1 = run(c1).range;
    let mut f2 = run(c2).range;
    for _ in 0..26 {
        if f1 > f2 {
            b = c2;
            c2 = c1;
            f2 = f1;
            c1 = b - gr * (b - a);
            f1 = run(c1).range;
        } else {
            a = c1;
            c1 = c2;
            f1 = f2;
            c2 = a + gr * (b - a);
            f2 = run(c2).range;
        }
    }
    let deg = (a + b) / 2.0;
    MaxRange { elevation_deg: deg, trajectory: run(deg) }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hit {
    pub elevation_deg: f64,
    pub point: Point,
    pub trajectory: Trajectory,
}

/// Low-arc elevation that puts the projectile at height `dy` (relative to the muzzle)
/// at distance `distance`. None if out of reach.
pub fn hit(p: &Projectile, env: &Environment, launch: &Launch, distance: f64, dy: f64, max_deg: f64) -> Option<Hit> {
    let run = |deg: f64| {
        let l = Launch { elevation: deg.to_radians(), ..*launch };
        simulate(p, env, &l, Stop { max_x: distance + 0.01, ground_y: -1e5, max_t: 400.0 })
    };
    let y_at = |deg: f64| at_x(&run(deg).points, distance).map(|q| q.y - dy).unwrap_or(-1e9);
    let (mut lo, mut hi) = (-10.0, max_deg);
    if y_at(hi) < 0.0 {
        return None;
    }
    for _ in 0..44 {
        let m = 0.5 * (lo + hi);
        if y_at(m) < 0.0 {
            lo = m;
        } else {
            hi = m;
        }
    }
    let deg = 0.5 * (lo + hi);
    let tr = run(deg);
    at_x(&tr.points, distance).map(|point| Hit { elevation_deg: deg, point, trajectory: tr })
}
