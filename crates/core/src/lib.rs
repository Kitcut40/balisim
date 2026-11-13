//! BALISIM physics core.
//!
//! Pure, deterministic, no graphics dependency. Units are SI internally; the
//! `scenario` module converts from user units (mm, g, cm^3, MPa).

pub mod atmosphere;
pub mod drag;
pub mod exterior;
pub mod interior;
pub mod library;
pub mod powder;
pub mod scenario;
pub mod stability;
pub mod terminal;

pub use library::library;
pub use scenario::{run, ScenarioInput, ScenarioResult};

/// Run a scenario given as JSON; returns the result as JSON.
pub fn run_json(input: &str) -> String {
    let lib = library::library();
    match serde_json::from_str::<ScenarioInput>(input) {
        Ok(s) => serde_json::to_string(&scenario::run(&s, &lib.powders)).unwrap_or_else(|e| error_json(&e.to_string())),
        Err(e) => error_json(&format!("Entrée invalide : {e}")),
    }
}

/// The built-in library (powders + presets) as JSON.
pub fn library_json() -> String {
    library::LIBRARY_JSON.to_string()
}

fn error_json(msg: &str) -> String {
    serde_json::json!({ "ok": false, "error": msg }).to_string()
}
