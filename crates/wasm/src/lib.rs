//! WebAssembly bindings for the BALISIM core (used by the web / Tauri UI).
use wasm_bindgen::prelude::*;

/// Run a scenario (JSON in user units) and return the result as JSON.
#[wasm_bindgen]
pub fn run_scenario(input: &str) -> String {
    balisim_core::run_json(input)
}

/// Built-in library (powders + presets) as JSON.
#[wasm_bindgen]
pub fn library() -> String {
    balisim_core::library_json()
}

/// Engine version.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
