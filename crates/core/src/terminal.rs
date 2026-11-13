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
    // Game rules (documented, not medical data): saturating functions of kinetic energy.
    // The blunt criterion is still reported for information.
    // Blunt: 100 * (1 - exp(-E / 120 J)) gives a usable spread over 20-250 J
    // (about 15 at 20 J, 34 at 50 J, 56 at 100 J, 71 at 150 J, 82 at 200 J).
    let game_damage = if penetrating { 100.0 * (1.0 - (-energy / 800.0).exp()) } else { 100.0 * (1.0 - (-energy / 120.0).exp()) };
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

/// Game effects per body zone (design rules chosen for Benjamin's game, not medical data).
///
/// Severity `s` (0..1) comes from the impact's game damage (blunt criterion for blunt
/// projectiles, energy for penetrating ones). Every effect scales linearly with `s`
/// between the bounds below, so the game designer can retune the coefficients.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ZoneEffects {
    /// Severity 0..1 used for every zone.
    pub severity: f64,
    pub head: HeadEffect,
    pub torso: BodyEffect,
    pub groin: BodyEffect,
    pub legs: LegEffect,
    pub arms: ArmEffect,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct HeadEffect {
    /// True: knocked out; false (very low energy): dazed only.
    pub unconscious: bool,
    /// Unconscious (or dazed) duration, s.
    pub duration_s: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BodyEffect {
    /// Hit points removed, in % of the player's max HP.
    pub hp_loss_pct: f64,
    /// Blurred / darkened vision duration, s.
    pub vision_blur_s: f64,
    /// Movement speed reduction, %.
    pub move_slow_pct: f64,
    /// Duration of the slowdown, s.
    pub move_slow_s: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LegEffect {
    pub move_slow_pct: f64,
    pub move_slow_s: f64,
    /// Cannot sprint or jump during this time, s.
    pub no_sprint_s: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ArmEffect {
    /// Cannot use a weapon during this time, s.
    pub weapon_disabled_s: f64,
    /// The weapon is dropped (strong hits).
    pub drops_weapon: bool,
}

fn lerp(a: f64, b: f64, s: f64) -> f64 {
    a + (b - a) * s
}

/// Severity threshold under which a head hit only dazes the player.
pub const HEAD_KO_THRESHOLD: f64 = 0.25;
/// Severity above which an arm hit makes the player drop the weapon.
pub const DROP_WEAPON_THRESHOLD: f64 = 0.6;

pub fn zone_effects(game_damage: f64) -> ZoneEffects {
    let s = (game_damage / 100.0).clamp(0.0, 1.0);
    let r1 = |x: f64| (x * 10.0).round() / 10.0;
    let body = |hp_mult: f64| BodyEffect {
        hp_loss_pct: r1((lerp(10.0, 60.0, s) * hp_mult).min(95.0)),
        vision_blur_s: r1(lerp(1.0, 8.0, s)),
        move_slow_pct: r1(lerp(15.0, 60.0, s)),
        move_slow_s: r1(lerp(2.0, 10.0, s)),
    };
    ZoneEffects {
        severity: (s * 1000.0).round() / 1000.0,
        head: HeadEffect { unconscious: s >= HEAD_KO_THRESHOLD, duration_s: r1(if s >= HEAD_KO_THRESHOLD { lerp(5.0, 30.0, s) } else { lerp(1.0, 4.0, s / HEAD_KO_THRESHOLD) }) },
        torso: body(1.0),
        groin: body(1.15),
        legs: LegEffect { move_slow_pct: r1(lerp(25.0, 80.0, s)), move_slow_s: r1(lerp(3.0, 15.0, s)), no_sprint_s: r1(lerp(2.0, 20.0, s)) },
        arms: ArmEffect { weapon_disabled_s: r1(lerp(2.0, 15.0, s)), drops_weapon: s >= DROP_WEAPON_THRESHOLD },
    }
}
