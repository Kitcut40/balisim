//! Terminal ballistics (step 1 subset): energy, momentum, energy density and the
//! Sturdivan blunt criterion for less-lethal impacts, plus a documented game-damage rule.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Impact {
    pub velocity: f64,
    pub energy: f64,
    pub momentum: f64,
    /// Energy per frontal area (J/cm^2).
    pub energy_density: f64,
    /// Sturdivan blunt criterion ln(E / (W^(1/3) T D)).
    pub blunt_criterion: f64,
    /// Game damage 0..100 (game rule, not medical data).
    pub game_damage: f64,
    /// True for penetrating projectiles (bullets): the blunt criterion does not apply.
    pub penetrating: bool,
}

/// `target_mass` kg (body), `wall_cm` body-wall thickness (cm).
/// For penetrating projectiles the Sturdivan criterion is not valid; the game rule then
/// uses kinetic energy (100 * (1 - exp(-E / 800 J))).
pub fn impact(mass: f64, diameter: f64, velocity: f64, target_mass: f64, wall_cm: f64, penetrating: bool) -> Impact {
    let energy = 0.5 * mass * velocity * velocity;
    let d_cm = diameter * 100.0;
    let area_cm2 = std::f64::consts::PI * d_cm * d_cm / 4.0;
    let bc = (energy.max(1e-9) / (target_mass.cbrt() * wall_cm * d_cm)).ln();
    // Game rules (documented, not medical data):
    // blunt impacts: logistic on the blunt criterion, 50 points at BC = 0;
    // penetrating impacts: saturating function of kinetic energy.
    let game_damage = if penetrating { 100.0 * (1.0 - (-energy / 800.0).exp()) } else { 100.0 / (1.0 + (-1.6 * bc).exp()) };
    Impact {
        velocity,
        energy,
        momentum: mass * velocity,
        energy_density: energy / area_cm2,
        blunt_criterion: if penetrating { f64::NAN } else { bc },
        game_damage,
        penetrating,
    }
}
