//! Gyroscopic stability (Miller twist rule) with velocity and atmosphere corrections.

use crate::atmosphere::Atmosphere;

/// Miller stability factor Sg.
/// `mass` kg, `diameter` m, `length` m, `twist` m/turn, `velocity` m/s.
/// Returns None for smooth bores or missing geometry.
pub fn miller_sg(mass: f64, diameter: f64, length: f64, twist: f64, velocity: f64, atm: &Atmosphere) -> Option<f64> {
    if twist <= 0.0 || diameter <= 0.0 || length <= 0.0 || mass <= 0.0 {
        return None;
    }
    let m_gr = mass * 15_432.358;
    let d_in = diameter / 0.0254;
    let t_cal = twist / diameter;
    let l_cal = length / diameter;
    let base = 30.0 * m_gr / (t_cal * t_cal * d_in.powi(3) * l_cal * (1.0 + l_cal * l_cal));
    let v_fps = (velocity / 0.3048).max(1.0);
    let temp_f = (atm.temperature - 273.15) * 9.0 / 5.0 + 32.0;
    let p_inhg = atm.pressure / 3386.389;
    Some(base * (v_fps / 2800.0).powf(1.0 / 3.0) * ((temp_f + 460.0) / 519.0) * (29.92 / p_inhg))
}
