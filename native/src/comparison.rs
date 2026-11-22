use crate::{
    engine::{Engine, Setup},
    window::Session,
};
use bevy::prelude::*;
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Default)]
pub struct Trial {
    pub status: String,
    pub seconds: f64,
    pub elapsed: f64,
    pub laps: u32,
    pub lap_time: Option<f64>,
}

#[derive(Resource, Default)]
pub struct Comparison {
    pub running: bool,
    pub rows: [Trial; 4],
    pub circuit: String,
    pub population: u32,
    rx: Mutex<Option<mpsc::Receiver<(usize, Trial)>>>,
    cancel: Arc<AtomicBool>,
}

impl Comparison {
    pub fn stop(&mut self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn start(&mut self, mut settings: Setup, mutation: f64, minutes: u32) {
        let (tx, rx) = mpsc::channel();
        self.circuit = settings.circuit.clone();
        self.population = settings.population;
        self.rows = std::array::from_fn(|_| Trial {
            status: "In attesa".into(),
            ..default()
        });
        self.running = true;
        self.cancel = Arc::new(AtomicBool::new(false));
        let stop = self.cancel.clone();
        *self.rx.get_mut().unwrap() = Some(rx);
        let spawned = thread::Builder::new()
            .name("confronto-male-cns".into())
            .stack_size(8 * 1024 * 1024)
            .spawn(move || {
                let engine = Engine::new();
                for (index, model) in ["v2", "v3", "v4", "v5"].into_iter().enumerate() {
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                    let _ = tx.send((
                        index,
                        Trial {
                            status: "Caricamento".into(),
                            ..default()
                        },
                    ));
                    settings.model = model.into();
                    let result = (|| {
                        let engine = engine.as_ref().map_err(|e| e.to_string())?;
                        engine.start(&settings).map_err(|e| e.to_string())?;
                        engine.mutation(mutation).map_err(|e| e.to_string())?;
                        engine.track_two_laps().map_err(|e| e.to_string())?;
                        let start = Instant::now();
                        let mut row = Trial {
                            status: "In prova".into(),
                            ..default()
                        };
                        let step = if settings.population >= 40 { 3 } else { 12 };
                        loop {
                            if stop.load(Ordering::Relaxed) {
                                row.status = "Interrotto".into();
                                break;
                            }
                            if minutes > 0
                                && start.elapsed() >= Duration::from_secs(u64::from(minutes) * 60)
                            {
                                row.status = "Limite raggiunto".into();
                                break;
                            }
                            let frame = engine.advance(step).map_err(|e| e.to_string())?;
                            row.elapsed += f64::from(step) / 60.0;
                            row.seconds = start.elapsed().as_secs_f64();
                            row.laps = row
                                .laps
                                .max(frame.cars.iter().map(|c| c.laps).max().unwrap_or(0));
                            if let Some(time) = frame.two_laps {
                                row.laps = 2;
                                row.lap_time = Some(time);
                                row.status = "Due giri completati".into();
                                break;
                            }
                            let _ = tx.send((index, row.clone()));
                        }
                        Ok::<_, String>(row)
                    })();
                    let _ = tx.send((
                        index,
                        result.unwrap_or_else(|e| Trial {
                            status: format!("Errore: {e}"),
                            ..default()
                        }),
                    ));
                }
            });
        if let Err(err) = spawned {
            self.running = false;
            self.rows[0].status = err.to_string();
        }
    }
}

pub fn read(mut state: ResMut<Comparison>, mut session: ResMut<Session>) {
    let mut updates = Vec::new();
    let mut closed = false;
    if let Some(rx) = state.rx.lock().unwrap().as_ref() {
        loop {
            match rx.try_recv() {
                Ok(row) => updates.push(row),
                Err(mpsc::TryRecvError::Disconnected) => {
                    closed = true;
                    break;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }
    }
    for (i, row) in updates {
        state.rows[i] = row;
    }
    if closed {
        *state.rx.get_mut().unwrap() = None;
        state.running = false;
        session.message = "Confronto terminato".into();
    }
}
