//! Built-in data library (powders and presets), stored as JSON in `data/library.json`.

use crate::scenario::{PowderUser, ScenarioInput};
use serde::{Deserialize, Serialize};

pub const LIBRARY_JSON: &str = include_str!("../../../data/library.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub family: String,
    /// Published reference values for comparison (free text, FR).
    #[serde(default)]
    pub reference: String,
    /// Reference velocity (m/s) used by the validation suite, 0 = none.
    #[serde(default)]
    pub ref_velocity: f64,
    /// Max allowed pressure of the calibre (CIP Pmax, MPa), 0 = none.
    #[serde(default)]
    pub ref_pressure: f64,
    pub scenario: ScenarioInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Library {
    pub schema_version: u32,
    pub powders: Vec<PowderUser>,
    pub presets: Vec<Preset>,
}

pub fn library() -> Library {
    serde_json::from_str(LIBRARY_JSON).expect("data/library.json is valid")
}
