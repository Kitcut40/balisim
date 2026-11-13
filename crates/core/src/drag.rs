//! Drag coefficient models.
//!
//! * Standard reference functions G1 and G7 scaled by a ballistic coefficient.
//! * Spheres (smooth or dimpled) with Reynolds-number dependence (drag crisis) blended
//!   into a compressible Mach table.
//! * Blunt round-nose cylinder (40 mm type), optionally with a dimpled nose.
//! * Tumbling body (unstabilised projectile).
//! * Custom Cd(Mach) table.

use serde::{Deserialize, Serialize};

pub const G1: &[(f64, f64)] = &[
    (0.0, 0.2629), (0.05, 0.2558), (0.1, 0.2487), (0.15, 0.2413), (0.2, 0.2344), (0.25, 0.2278),
    (0.3, 0.2214), (0.35, 0.2155), (0.4, 0.2104), (0.45, 0.2061), (0.5, 0.2032), (0.55, 0.2020),
    (0.6, 0.2034), (0.7, 0.2165), (0.725, 0.2230), (0.75, 0.2313), (0.775, 0.2417), (0.8, 0.2546),
    (0.825, 0.2706), (0.85, 0.2901), (0.875, 0.3136), (0.9, 0.3415), (0.925, 0.3734), (0.95, 0.4084),
    (0.975, 0.4448), (1.0, 0.4805), (1.025, 0.5136), (1.05, 0.5427), (1.075, 0.5677), (1.1, 0.5883),
    (1.125, 0.6053), (1.15, 0.6191), (1.2, 0.6393), (1.25, 0.6518), (1.3, 0.6589), (1.35, 0.6621),
    (1.4, 0.6625), (1.45, 0.6607), (1.5, 0.6573), (1.55, 0.6528), (1.6, 0.6474), (1.65, 0.6413),
    (1.7, 0.6347), (1.75, 0.6280), (1.8, 0.6210), (1.85, 0.6141), (1.9, 0.6072), (1.95, 0.6003),
    (2.0, 0.5934), (2.05, 0.5867), (2.1, 0.5804), (2.15, 0.5743), (2.2, 0.5685), (2.25, 0.5630),
    (2.3, 0.5577), (2.35, 0.5527), (2.4, 0.5481), (2.45, 0.5438), (2.5, 0.5397), (2.6, 0.5325),
    (2.7, 0.5264), (2.8, 0.5211), (2.9, 0.5168), (3.0, 0.5133), (3.2, 0.5084), (3.4, 0.5054),
    (3.6, 0.5030), (3.8, 0.5016), (4.0, 0.5006), (5.0, 0.4955),
];

pub const G7: &[(f64, f64)] = &[
    (0.0, 0.1198), (0.05, 0.1197), (0.1, 0.1196), (0.15, 0.1194), (0.2, 0.1193), (0.25, 0.1194),
    (0.3, 0.1194), (0.35, 0.1194), (0.4, 0.1193), (0.45, 0.1193), (0.5, 0.1194), (0.55, 0.1193),
    (0.6, 0.1194), (0.65, 0.1197), (0.7, 0.1202), (0.725, 0.1207), (0.75, 0.1215), (0.775, 0.1226),
    (0.8, 0.1242), (0.825, 0.1266), (0.85, 0.1306), (0.875, 0.1368), (0.9, 0.1464), (0.925, 0.1660),
    (0.95, 0.2054), (0.975, 0.2993), (1.0, 0.3803), (1.025, 0.4015), (1.05, 0.4043), (1.075, 0.4034),
    (1.1, 0.4014), (1.15, 0.3955), (1.2, 0.3884), (1.3, 0.3732), (1.4, 0.3580), (1.5, 0.3440),
    (1.6, 0.3315), (1.8, 0.3100), (2.0, 0.2922), (2.2, 0.2770), (2.4, 0.2635), (2.6, 0.2511),
    (2.8, 0.2397), (3.0, 0.2294), (3.5, 0.2073), (4.0, 0.1898), (5.0, 0.1625),
];

/// Compressible sphere drag (supersonic plateau ~0.9-1.0).
pub const SPHERE_MACH: &[(f64, f64)] = &[
    (0.0, 0.47), (0.4, 0.47), (0.6, 0.50), (0.7, 0.55), (0.8, 0.62), (0.9, 0.72), (1.0, 0.86),
    (1.1, 0.95), (1.2, 1.0), (1.5, 1.0), (2.0, 0.98), (3.0, 0.95), (5.0, 0.92),
];

/// Smooth sphere Cd vs log10(Re): subcritical plateau, drag crisis near Re 3e5.
pub const SPHERE_SMOOTH_RE: &[(f64, f64)] = &[
    (3.0, 0.47), (4.0, 0.40), (5.0, 0.47), (5.301, 0.46), (5.398, 0.42), (5.477, 0.30),
    (5.544, 0.12), (5.602, 0.08), (6.0, 0.13), (6.477, 0.18), (7.0, 0.20),
];

/// Dimpled (golf-type) sphere: crisis shifted to Re ~5e4-8e4, higher post-critical Cd.
pub const SPHERE_DIMPLED_RE: &[(f64, f64)] = &[
    (3.0, 0.47), (4.0, 0.47), (4.477, 0.48), (4.602, 0.46), (4.699, 0.40), (4.778, 0.32),
    (4.903, 0.26), (5.0, 0.25), (5.176, 0.25), (5.301, 0.26), (5.477, 0.27), (6.0, 0.30), (7.0, 0.32),
];

/// Round-nose cylinder, nose first.
pub const BLUNT_MACH: &[(f64, f64)] = &[
    (0.0, 0.30), (0.5, 0.31), (0.7, 0.35), (0.8, 0.40), (0.9, 0.52), (0.95, 0.65), (1.05, 0.85),
    (1.2, 0.90), (1.5, 0.88), (2.0, 0.82), (3.0, 0.75), (5.0, 0.70),
];

pub fn interp(table: &[(f64, f64)], x: f64) -> f64 {
    if x <= table[0].0 {
        return table[0].1;
    }
    for w in table.windows(2) {
        let (a, b) = (w[0], w[1]);
        if x <= b.0 {
            return a.1 + (b.1 - a.1) * (x - a.0) / (b.0 - a.0);
        }
    }
    table[table.len() - 1].1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Surface {
    #[default]
    Smooth,
    Dimpled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DragModel {
    /// G1 reference with ballistic coefficient in lb/in^2.
    G1 { bc: f64 },
    G7 { bc: f64 },
    Sphere { surface: Surface, #[serde(default = "one")] mult: f64 },
    BluntNose { surface: Surface, #[serde(default = "one")] mult: f64 },
    /// Unstabilised body tumbling end over end; `cd` = mean low-speed Cd.
    Tumbling { cd: f64 },
    /// Custom Cd(Mach) points.
    Table { points: Vec<(f64, f64)>, #[serde(default = "one")] mult: f64 },
}

fn one() -> f64 {
    1.0
}

/// Blend factor 0 (incompressible, Reynolds-driven) -> 1 (compressible, Mach-driven).
fn mach_blend(mach: f64) -> f64 {
    ((mach - 0.4) / 0.4).clamp(0.0, 1.0)
}

impl DragModel {
    /// Drag coefficient referred to the projectile cross-section.
    /// `mass` kg, `diameter` m (for the BC form factor), `re` Reynolds number.
    pub fn cd(&self, mach: f64, re: f64, mass: f64, diameter: f64) -> f64 {
        match self {
            DragModel::G1 { bc } => interp(G1, mach) * form_factor(mass, diameter, *bc),
            DragModel::G7 { bc } => interp(G7, mach) * form_factor(mass, diameter, *bc),
            DragModel::Sphere { surface, mult } => {
                let lre = re.max(1.0).log10();
                let cre = match surface {
                    Surface::Smooth => interp(SPHERE_SMOOTH_RE, lre),
                    Surface::Dimpled => interp(SPHERE_DIMPLED_RE, lre),
                };
                let b = mach_blend(mach);
                mult * (cre * (1.0 - b) + interp(SPHERE_MACH, mach) * b)
            }
            DragModel::BluntNose { surface, mult } => {
                let base = interp(BLUNT_MACH, mach);
                let f = match surface {
                    Surface::Smooth => 1.0,
                    // Estimated: dimples on the nose trip the boundary layer; benefit only in
                    // the critical Reynolds window, small penalty above it.
                    Surface::Dimpled => {
                        let lre = re.max(1.0).log10();
                        interp(&[(4.0, 1.0), (4.7, 1.0), (4.9, 0.85), (5.6, 0.85), (5.9, 1.04), (7.0, 1.06)], lre)
                    }
                };
                let b = mach_blend(mach);
                mult * base * (f * (1.0 - b) + b)
            }
            DragModel::Tumbling { cd } => cd * interp(SPHERE_MACH, mach) / 0.47,
            DragModel::Table { points, mult } => mult * interp(points, mach),
        }
    }

    pub fn is_sphere(&self) -> bool {
        matches!(self, DragModel::Sphere { .. })
    }
}

/// i = SD / BC with SD in lb/in^2.
pub fn form_factor(mass: f64, diameter: f64, bc: f64) -> f64 {
    sectional_density(mass, diameter) / bc.max(1e-4)
}

pub fn sectional_density(mass: f64, diameter: f64) -> f64 {
    (mass * 2.204_622_6) / (diameter / 0.0254).powi(2)
}
