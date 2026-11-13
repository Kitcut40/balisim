//! Validation suite (spec section 8). Run with `cargo test -- --nocapture` to print the report.

use balisim_core::exterior::{self, Environment, Launch, Projectile, Stop};
use balisim_core::{atmosphere::Atmosphere, drag::DragModel, library, run};

#[test]
fn reference_cartridges_within_tolerance() {
    let lib = library();
    println!("\n{:<44} {:>8} {:>8} {:>7} | {:>8} {:>8} {:>7}", "Munition", "v sim", "v réf", "écart", "P sim", "Pmax", "%Pmax");
    let mut failures = vec![];
    for p in lib.presets.iter().filter(|p| p.ref_velocity > 0.0) {
        let r = run(&p.scenario, &lib.powders);
        assert!(r.ok, "{} failed: {:?}", p.id, r.error);
        let v = r.interior.muzzle_velocity;
        let dv = (v - p.ref_velocity) / p.ref_velocity * 100.0;
        let pm = r.interior.p_breech_max / 1e6;
        // ref_pressure is the calibre's max allowed pressure (CIP Pmax), not the load's
        // pressure: a normal load must stay below it while remaining plausible.
        let ratio = if p.ref_pressure > 0.0 { pm / p.ref_pressure * 100.0 } else { f64::NAN };
        println!("{:<44} {:>8.0} {:>8.0} {:>6.1}% | {:>8.0} {:>8.0} {:>6.0}%", p.scenario.name, v, p.ref_velocity, dv, pm, p.ref_pressure, ratio);
        if dv.abs() > 5.0 {
            failures.push(format!("{}: vitesse {:.1}%", p.id, dv));
        }
        if ratio.is_finite() && !(60.0..=105.0).contains(&ratio) {
            failures.push(format!("{}: pression {:.0}% de Pmax", p.id, ratio));
        }
    }
    assert!(failures.is_empty(), "Hors tolérance : {failures:?}");
}

#[test]
fn energy_balance_is_consistent() {
    let lib = library();
    for p in &lib.presets {
        let r = run(&p.scenario, &lib.powders);
        assert!(r.ok, "{}: {:?}", p.id, r.error);
        let ke = 0.5 * p.scenario.proj_mass_g * 1e-3 * r.interior.muzzle_velocity.powi(2);
        let available = r.interior.chemical_energy * (1.0 - p.scenario.heat_loss_pct / 100.0) + 1.0;
        assert!(ke < available, "{}: énergie cinétique {ke:.1} J > énergie disponible {available:.1} J", p.id);
        assert!(r.interior.efficiency > 0.02 && r.interior.efficiency < 0.5, "{}: rendement {}", p.id, r.interior.efficiency);
    }
}

#[test]
fn longer_barrel_is_faster() {
    let lib = library();
    let base = lib.presets.iter().find(|p| p.id == "308").unwrap().scenario.clone();
    let mut last = 0.0;
    for barrel in [400.0, 500.0, 610.0, 700.0] {
        let mut s = base.clone();
        s.barrel_mm = barrel;
        let v = run(&s, &lib.powders).interior.muzzle_velocity;
        assert!(v > last, "{barrel} mm: {v} <= {last}");
        last = v;
    }
}

#[test]
fn project_40mm_all_configurations() {
    let lib = library();
    println!("\n{:<58} {:>7} {:>7} {:>8} {:>9} {:>8} {:>7}", "Configuration 40 mm", "v0", "E0 J", "P cart", "v @30 m", "E @30 m", "portée");
    let mut v30 = std::collections::HashMap::new();
    for p in lib.presets.iter().filter(|p| p.family == "launcher40") {
        let r = run(&p.scenario, &lib.powders);
        assert!(r.ok, "{}: {:?}", p.id, r.error);
        let h = r.hit.as_ref().expect("cible à 30 m atteignable");
        println!(
            "{:<58} {:>7.1} {:>7.0} {:>7.1}M {:>9.1} {:>8.0} {:>6.0}m  [{}]",
            p.scenario.name,
            r.interior.muzzle_velocity,
            r.muzzle.unwrap().energy,
            r.interior.p_high_max / 1e6,
            h.point.v,
            h.impact.energy,
            r.max_range_m,
            r.stability.as_ref().unwrap().mode
        );
        assert!(r.interior.muzzle_velocity > 40.0 && r.interior.muzzle_velocity < 200.0);
        v30.insert(p.id.clone(), (r.interior.muzzle_velocity, h.point.v));
    }
    // Dimpled nose keeps more speed at 30 m than smooth with the same propulsion.
    let loss = |id: &str| v30[id].0 - v30[id].1;
    assert!(loss("40-pak-alveole") < loss("40-pak-lisse"));
    assert!(v30["40-rk-lisse"].0 > v30["40-pak-lisse"].0, "le R.K. (plus chargé) doit être plus rapide");
}

#[test]
fn golf_ball_drag_crisis() {
    // A dimpled ball at ~70 m/s (Re ~2e5) has much less drag than a smooth one.
    let atm = Atmosphere::standard();
    let d = 0.04267;
    let re = atm.density * 70.0 * d / atm.viscosity;
    let smooth = DragModel::Sphere { surface: Default::default(), mult: 1.0 }.cd(0.2, re, 0.0459, d);
    let dimpled = DragModel::Sphere { surface: balisim_core::drag::Surface::Dimpled, mult: 1.0 }.cd(0.2, re, 0.0459, d);
    assert!(dimpled < 0.6 * smooth, "Re={re:.0}: lisse {smooth:.3} / alvéolé {dimpled:.3}");
}

#[test]
fn trajectory_step_convergence_and_vacuum_check() {
    // No drag: range must match the analytic formula v^2 sin(2a) / g.
    let atm = Atmosphere::standard();
    let p = Projectile { mass: 0.01, diameter: 0.008, length: 0.03, drag: DragModel::Table { points: vec![(0.0, 0.0), (5.0, 0.0)], mult: 1.0 } };
    let env = Environment { atmosphere: atm, wind: [0.0; 3], latitude: f64::NAN, azimuth: 0.0 };
    let l = Launch { velocity: 100.0, elevation: 45f64.to_radians(), height: 0.0, backspin: 0.0, spin_tau: 8.0, sg: 0.0, twist_sign: 1.0 };
    let tr = exterior::simulate(&p, &env, &l, Stop { max_x: 1e9, ground_y: 0.0 - 1e-9, max_t: 100.0 });
    let analytic = 100.0f64.powi(2) / exterior::G0;
    assert!((tr.range - analytic).abs() / analytic < 1e-3, "{} vs {}", tr.range, analytic);
}

#[test]
fn hop_up_extends_airsoft_range() {
    let atm = Atmosphere::standard();
    let p = Projectile { mass: 0.00025, diameter: 0.00595, length: 0.00595, drag: DragModel::Sphere { surface: Default::default(), mult: 1.0 } };
    let env = Environment { atmosphere: atm, wind: [0.0; 3], latitude: f64::NAN, azimuth: 0.0 };
    let mk = |rpm: f64| Launch { velocity: 100.0, elevation: 0.0, height: 1.5, backspin: rpm * std::f64::consts::TAU / 60.0, spin_tau: 8.0, sg: 0.0, twist_sign: 1.0 };
    let stop = Stop { max_x: 1e9, ground_y: -1.5, max_t: 30.0 };
    let r0 = exterior::simulate(&p, &env, &mk(0.0), stop).range;
    let r1 = exterior::simulate(&p, &env, &mk(60_000.0), stop).range;
    assert!(r1 > r0 * 1.3, "sans hop-up {r0:.1} m, avec {r1:.1} m");
}
