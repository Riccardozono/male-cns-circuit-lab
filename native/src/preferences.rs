use crate::{engine::Setup, window::Session};
use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Preferences {
    model: String,
    circuit: String,
    speed: f64,
    pub dark: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            model: "v5".into(),
            circuit: "lab".into(),
            speed: 1.0,
            dark: false,
        }
    }
}

fn path() -> Option<PathBuf> {
    Some(
        PathBuf::from(std::env::var_os("LOCALAPPDATA")?)
            .join("MAL-E CNS Circuit Lab Native")
            .join("preferences.json"),
    )
}

impl Preferences {
    pub fn load() -> Self {
        let Some(mut saved) = path()
            .and_then(|path| fs::read(path).ok())
            .and_then(|bytes| serde_json::from_slice::<Self>(&bytes).ok())
        else {
            return Self::default();
        };
        if !crate::window::MODELS.contains(&saved.model.as_str()) {
            saved.model = "v5".into();
        }
        if !crate::window::CIRCUITS.contains(&saved.circuit.as_str()) {
            saved.circuit = "lab".into();
        }
        saved.speed = (saved.speed.clamp(0.5, 30.) * 2.).round() * 0.5;
        saved
    }

    pub fn setup(&self) -> Setup {
        Setup {
            model: self.model.clone(),
            circuit: self.circuit.clone(),
            speed: self.speed,
            ..Setup::default()
        }
    }
}

#[derive(Resource)]
pub struct Stored {
    previous: Preferences,
    enabled: bool,
}

impl Stored {
    pub fn new(previous: Preferences, enabled: bool) -> Self {
        Self { previous, enabled }
    }
}

pub fn store(
    s: Res<Session>,
    comparison: Res<crate::comparison::Comparison>,
    mut state: ResMut<Stored>,
) {
    if comparison.running || !state.enabled || s.track.is_none() {
        return;
    }
    let values = Preferences {
        model: s.setup.model.clone(),
        circuit: s.setup.circuit.clone(),
        speed: s.setup.speed,
        dark: s.dark,
    };
    if state.previous == values {
        return;
    }
    state.previous = values.clone();
    let Some(path) = path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if let Err(error) = fs::create_dir_all(parent)
        .and_then(|()| crate::window::write_atomically(&path, &serde_json::to_string(&values)?))
    {
        warn!("Preferenze non salvate: {error}");
    }
}
