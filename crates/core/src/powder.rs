//! Propellant description and grain form functions.
//!
//! Step 1 uses Vieille's burn-rate law r = beta * P^alpha with a polynomial form
//! function psi(Z) = chi * Z * (1 + lambda * Z + mu * Z^2) (classical lumped-parameter
//! interior ballistics). Step 2 adds the GRT-compatible two-phase model.

use serde::{Deserialize, Serialize};

/// Data quality tag carried by every record (see spec section 5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Quality {
    Measured,
    Calibrated,
    Manufacturer,
    Standard,
    #[default]
    Estimated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GrainShape {
    /// Thin disc (flake): mildly degressive.
    Flake,
    /// Ball powder: strongly degressive, psi = 1 - (1 - Z)^3.
    Sphere,
    /// Single-perforated tube: almost neutral.
    Tube,
    /// Multi-perforated grain: progressive.
    Multi7,
    /// Irregular black-powder grains (treated like spheres).
    Grain,
}

impl GrainShape {
    /// (chi, lambda, mu) of the form function.
    pub fn coefficients(self) -> (f64, f64, f64) {
        match self {
            GrainShape::Flake => (1.15, -0.13, 0.0),
            GrainShape::Sphere | GrainShape::Grain => (3.0, -1.0, 1.0 / 3.0),
            GrainShape::Tube => (1.02, -0.0196, 0.0),
            GrainShape::Multi7 => (0.75, 1.0 / 3.0, 0.0),
        }
    }

    /// Burnt mass fraction psi for burnt web fraction Z in [0, 1].
    pub fn psi(self, z: f64) -> f64 {
        let (chi, lam, mu) = self.coefficients();
        let z = z.clamp(0.0, 1.0);
        (chi * z * (1.0 + lam * z + mu * z * z)).min(1.0)
    }

    /// d(psi)/dZ.
    pub fn dpsi_dz(self, z: f64) -> f64 {
        let (chi, lam, mu) = self.coefficients();
        let z = z.clamp(0.0, 1.0);
        (chi * (1.0 + 2.0 * lam * z + 3.0 * mu * z * z)).max(0.0)
    }
}

/// Propellant parameters in SI units.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Powder {
    pub id: String,
    pub name: String,
    /// Impetus / force F = R * T0 (J/kg).
    pub force: f64,
    /// Ratio of specific heats of the combustion gas.
    pub gamma: f64,
    /// Co-volume (m^3/kg).
    pub covolume: f64,
    /// Grain (solid) density (kg/m^3).
    pub density: f64,
    /// Bulk density (kg/m^3), used for fill ratio.
    #[serde(default = "default_bulk")]
    pub bulk_density: f64,
    /// Burn-rate coefficient: r[mm/s] = beta_mm * (P[MPa])^alpha.
    pub beta_mm: f64,
    pub alpha: f64,
    /// Full web thickness (m); the burning distance is web / 2.
    pub web: f64,
    pub shape: GrainShape,
    /// Velocity temperature sensitivity, fraction of burn rate per degree C (0 = none).
    #[serde(default)]
    pub temp_coeff: f64,
    #[serde(default)]
    pub quality: Quality,
    #[serde(default)]
    pub source: String,
}

fn default_bulk() -> f64 {
    900.0
}

impl Powder {
    /// Linear burn rate (m/s) at pressure p (Pa) and powder temperature (deg C).
    pub fn burn_rate(&self, p: f64, temp_c: f64) -> f64 {
        let t_factor = 1.0 + self.temp_coeff * (temp_c - 21.0);
        self.beta_mm * 1e-3 * (p.max(101_325.0) / 1e6).powf(self.alpha) * t_factor.max(0.1)
    }
}
