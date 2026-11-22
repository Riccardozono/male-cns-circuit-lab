#![cfg_attr(
    all(target_os = "windows", feature = "desktop"),
    windows_subsystem = "windows"
)]

#[cfg(feature = "desktop")]
mod atlas;
#[cfg(feature = "desktop")]
mod comparison;
#[cfg(feature = "desktop")]
mod dashboard;
mod engine;
mod geometry;
mod neural;
#[cfg(feature = "desktop")]
mod scene;
#[cfg(feature = "desktop")]
mod scenery;
mod surface;
#[cfg(feature = "desktop")]
mod window;

use engine::{Engine, Result, Setup};
use std::{env, path::PathBuf, thread, time::Instant};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.first().is_some_and(|arg| arg == "--probe") {
        let [_, model, circuit, population, ticks, rest @ ..] = args.as_slice() else {
            return Err("Uso: --probe v3 monza 16 120 [file.malecns-save]".into());
        };
        let setup = Setup {
            model: model.clone(),
            circuit: circuit.clone(),
            population: population.parse()?,
            ..Setup::default()
        };
        let ticks: u32 = ticks.parse()?;
        let saved_file = rest.first().map(PathBuf::from);
        let outcome = thread::Builder::new()
            .stack_size(8 * 1024 * 1024)
            .spawn(move || probe(&setup, ticks, saved_file).map_err(|e| e.to_string()))?
            .join()
            .map_err(|_| "Worker di prova interrotto")?;
        println!("{}", outcome?);
        return Ok(());
    }
    #[cfg(feature = "desktop")]
    {
        let smoke = match args.as_slice() {
            [] => None,
            [flag, directory] if flag == "--smoke" => Some(PathBuf::from(directory)),
            _ => return Err("Opzioni della finestra non riconosciute".into()),
        };
        if window::run(smoke).is_success() {
            Ok(())
        } else {
            Err("L'app nativa si è chiusa con un errore".into())
        }
    }
    #[cfg(not(feature = "desktop"))]
    Err("Usare --probe o compilare con la feature desktop".into())
}

fn probe(setup: &Setup, ticks: u32, saved_file: Option<PathBuf>) -> Result<String> {
    let engine = Engine::new()?;
    let (track, first) = engine.start(setup)?;
    let time = Instant::now();
    let snapshot = engine.advance(ticks)?;
    let seconds = time.elapsed().as_secs_f64();
    let save = engine.save(setup.speed)?;
    let (reloaded, _, restored) = engine.load(&save)?;
    if first.cars.len() != setup.population as usize
        || &reloaded != setup
        || restored.elapsed != 0.0
        || restored.generation != snapshot.generation
        || restored.cars.len() != snapshot.cars.len()
    {
        return Err("Il ricaricamento dei progressi nativi non coincide".into());
    }
    if let Some(path) = saved_file {
        std::fs::write(path, save)?;
    }
    Ok(serde_json::to_string(&serde_json::json!({
        "setup": setup, "length": track.length, "seconds": seconds,
        "track": {"label": track.label, "vertices": track.outer.len() + track.inner.len(),
                  "width": track.bounds.width, "height": track.bounds.height,
                  "x": track.bounds.x, "y": track.bounds.y, "center": track.center.len()},
        "snapshot": snapshot, "roundtrip": true
    }))?)
}
