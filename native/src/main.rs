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
#[cfg(feature = "desktop")]
mod decoder;
mod engine;
mod geometry;
#[cfg(feature = "desktop")]
mod gpu;
#[cfg(feature = "desktop")]
mod history;
mod learning;
#[cfg(feature = "desktop")]
mod menus;
mod neural;
#[cfg(feature = "desktop")]
mod pool;
#[cfg(feature = "desktop")]
mod preferences;
mod reward;
#[cfg(feature = "desktop")]
mod scene;
#[cfg(feature = "desktop")]
mod scenery;
mod surface;
mod vehicle;
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
    if let [flag, model, count, ticks, loss @ ..] = args.as_slice()
        && flag == "--probe-gpu"
    {
        let setup = Setup {
            model: model.clone(),
            population: count.parse()?,
            ..Setup::default()
        };
        let ticks: u32 = ticks.parse()?;
        let lose_device = loss.first().is_some_and(|flag| flag == "--lose-device");
        let report = thread::Builder::new()
            .stack_size(8 * 1024 * 1024)
            .spawn(move || gpu_probe(setup, ticks, lose_device).map_err(|error| error.to_string()))?
            .join()
            .map_err(|_| "Worker GPU interrotto")??;
        println!("{report}");
        return Ok(());
    }
    #[cfg(feature = "desktop")]
    if let [flag, input, output, rest @ ..] = args.as_slice()
        && flag == "--probe-pool"
    {
        let (input, output) = (PathBuf::from(input), PathBuf::from(output));
        let ticks: u32 = rest.first().map(|x| x.parse()).transpose()?.unwrap_or(0);
        let report = thread::Builder::new()
            .stack_size(8 * 1024 * 1024)
            .spawn(move || pool_probe(input, output, ticks).map_err(|error| error.to_string()))?
            .join()
            .map_err(|_| "Worker multi-worker interrotto")??;
        println!("{report}");
        return Ok(());
    }
    #[cfg(feature = "desktop")]
    if let [flag, path, ticks] = args.as_slice()
        && flag == "--probe-decoder"
    {
        let path = PathBuf::from(path);
        let ticks: u32 = ticks.parse()?;
        let report = thread::Builder::new()
            .stack_size(8 * 1024 * 1024)
            .spawn(move || decoder_probe(path, ticks).map_err(|error| error.to_string()))?
            .join()
            .map_err(|_| "Worker decoder interrotto")??;
        println!("{report}");
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

#[cfg(feature = "desktop")]
fn gpu_probe(setup: Setup, ticks: u32, lose_device: bool) -> Result<String> {
    let engine = Engine::new_gpu()?;
    engine.start(&setup)?;
    let start = Instant::now();
    let before = engine.advance(ticks)?;
    let after = if lose_device {
        engine.simulate_device_loss()?;
        Some(engine.advance(12)?)
    } else {
        None
    };
    Ok(serde_json::json!({
        "before":before, "after":after, "seconds":start.elapsed().as_secs_f64()
    })
    .to_string())
}

#[cfg(feature = "desktop")]
fn pool_probe(input: PathBuf, output: PathBuf, ticks: u32) -> Result<String> {
    let mut pool = crate::pool::Pool::new(true)?;
    let text = std::fs::read_to_string(input)?;
    let draft = pool.primary.decode_pool(&text)?;
    let (settings, _, mut frame, _) = pool.load_checked(draft)?;
    if ticks > 0 {
        frame = pool.advance(ticks)?;
    }
    std::fs::write(output, pool.save(settings.speed)?)?;
    Ok(serde_json::json!({
        "generation":frame.generation, "elapsed":frame.elapsed,
        "workerCount":frame.worker_count, "ticks":frame.ticks
    })
    .to_string())
}

#[cfg(feature = "desktop")]
fn decoder_probe(path: PathBuf, ticks: u32) -> Result<String> {
    let bundle = crate::decoder::Bundle::load(&path)?;
    let engine = Engine::new()?;
    engine.actor_start(&bundle, &[], 1, None)?;
    engine.track_two_laps()?;
    let frame = engine.advance(ticks)?;
    Ok(serde_json::json!({"snapshot":frame,"decoderSha256":bundle.hash}).to_string())
}
