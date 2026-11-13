//! Air properties: ISA pressure with altitude, humid-air density, speed of sound,
//! Sutherland viscosity.

use serde::{Deserialize, Serialize};

const R_DRY: f64 = 287.05;
const R_VAPOUR: f64 = 461.5;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Atmosphere {
    /// Density (kg/m^3).
    pub density: f64,
    /// Speed of sound (m/s).
    pub sound_speed: f64,
    /// Dynamic viscosity (Pa.s).
    pub viscosity: f64,
    /// Static pressure (Pa).
    pub pressure: f64,
    /// Temperature (K).
    pub temperature: f64,
}

impl Atmosphere {
    /// `altitude` m, `temp_c` deg C, `humidity` 0..1, `pressure` Pa (None = ISA at altitude).
    pub fn new(altitude: f64, temp_c: f64, humidity: f64, pressure: Option<f64>) -> Self {
        let t = temp_c + 273.15;
        let p = pressure.unwrap_or_else(|| 101_325.0 * (1.0 - 2.25577e-5 * altitude.max(-500.0)).powf(5.25588));
        // Buck (1981) saturation vapour pressure, hPa -> Pa.
        let es = 611.21 * ((18.678 - temp_c / 234.5) * (temp_c / (257.14 + temp_c))).exp();
        let pv = (humidity.clamp(0.0, 1.0) * es).min(p * 0.5);
        let density = (p - pv) / (R_DRY * t) + pv / (R_VAPOUR * t);
        let viscosity = 1.716e-5 * (t / 273.15).powf(1.5) * (273.15 + 110.4) / (t + 110.4);
        Atmosphere { density, sound_speed: (1.4 * R_DRY * t).sqrt(), viscosity, pressure: p, temperature: t }
    }

    pub fn standard() -> Self {
        Self::new(0.0, 15.0, 0.0, None)
    }
}
