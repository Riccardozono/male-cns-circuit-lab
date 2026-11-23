use crate::{
    atlas::{Activity, Filter, Points},
    decoder::{Bundle, Coefficients},
    engine::{Driver, Engine, Frame, Inspection, Setup, Track, TrialHit, TrialProgress},
    profile::V3Profile,
    window::{Page, Session},
};
use bevy::prelude::*;
use serde_json::{Value, json};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

pub const MODELS: [&str; 4] = ["v2", "v3", "v4", "v5"];

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Status {
    #[default]
    Pending,
    Loading,
    Running,
    Completed,
    Failed,
    Limit,
    Stopped,
    Error,
    NotRun,
}

impl Status {
    fn id(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Loading => "loading",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Limit => "limit",
            Self::Stopped => "stopped",
            Self::Error => "error",
            Self::NotRun => "not-run",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Pending => "In attesa",
            Self::Loading => "Caricamento",
            Self::Running => "In prova",
            Self::Completed => "Generazione completata",
            Self::Failed => "Due giri non completati",
            Self::Limit => "Limite raggiunto",
            Self::Stopped => "Interrotto",
            Self::Error => "Errore",
            Self::NotRun => "Non eseguito",
        }
    }
}

#[derive(Clone, Default)]
pub struct Trial {
    pub status: Status,
    pub seconds: f64,
    pub elapsed: f64,
    pub laps: u32,
    pub lap_time: Option<f64>,
    pub progress: Option<TrialProgress>,
    pub backend: String,
    error: Option<String>,
    decoder_hash: Option<String>,
    training: Option<Value>,
}

impl Trial {
    fn report(&self, model: &str) -> Value {
        if self.status == Status::NotRun || self.status == Status::Pending {
            return json!({ "modelId":model, "status":self.status.id() });
        }
        let stats = self.progress.as_ref();
        let mut data = json!({
            "modelId":model, "status":self.status.id(), "wallSeconds":self.seconds,
            "simSeconds":self.elapsed, "generations":stats.map_or(0, |s|s.generations),
            "currentGeneration":stats.map_or(1, |s|s.current_generation), "maxLaps":self.laps,
            "bestProgressMeters":stats.map_or(0., |s|s.best_progress_meters),
            "hit":stats.and_then(|s|s.hit.as_ref()),
            "generationSimSeconds":stats.and_then(|s|s.generation_sim_seconds),
            "backend":self.backend, "error":self.error
        });
        if let Some(hash) = &self.decoder_hash {
            data["decoderSha256"] = json!(hash);
        }
        if let Some(training) = &self.training {
            data["rewardTraining"] = training.clone();
        }
        data
    }
}

enum Update {
    Row(usize, Trial),
    Began(String),
    Ended(String),
    Refined(Coefficients),
    PrepareView(Setup, Track, Frame, Points),
    View(Frame, Option<Activity>, Option<Inspection>),
}

#[derive(Clone, Copy, Default)]
struct ViewRequest {
    show: bool,
    brain: bool,
    selected: Option<usize>,
    filter: Filter,
    density: u16,
    neuron: Option<usize>,
    frozen: bool,
}

struct NormalView {
    setup: Setup,
    profile: V3Profile,
    mutation: f64,
    track: Option<Track>,
    scene: Option<crate::scenery::Layout>,
    frame: Option<Frame>,
    points: Option<Points>,
    activity: Option<Activity>,
    inspection: Option<Inspection>,
    selected: Option<usize>,
    neuron: Option<usize>,
    focus: Option<usize>,
    landmark: Option<usize>,
}

impl NormalView {
    fn take(session: &mut Session) -> Self {
        Self {
            setup: session.setup.clone(),
            profile: session.profile,
            mutation: session.mutation,
            track: session.track.take(),
            scene: session.decoration.take(),
            frame: session.frame.take(),
            points: session.points.take(),
            activity: session.activity.take(),
            inspection: session.inspection.take(),
            selected: session.selected.take(),
            neuron: session.atlas_selected.take(),
            focus: session.atlas_focus.take(),
            landmark: session.landmark.take(),
        }
    }

    fn restore(self, session: &mut Session) {
        session.setup = self.setup;
        session.profile = self.profile;
        session.mutation = self.mutation;
        session.track = self.track;
        session.decoration = self.scene;
        session.frame = self.frame;
        session.points = self.points;
        session.activity = self.activity;
        session.inspection = self.inspection;
        session.selected = self.selected;
        session.atlas_selected = self.neuron;
        session.atlas_focus = self.focus;
        session.landmark = self.landmark;
        session.revision += 1;
    }
}

struct Display<'a> {
    tx: &'a mpsc::Sender<Update>,
    request: &'a Mutex<ViewRequest>,
}

impl Display<'_> {
    fn start(
        &self,
        engine: &Engine,
        setup: Setup,
        track: Track,
        mut frame: Frame,
    ) -> crate::engine::Result<()> {
        frame.worker_count = 1;
        let atlas = engine.atlas()?;
        let _ = self
            .tx
            .send(Update::PrepareView(setup, track, frame, atlas));
        Ok(())
    }

    fn sample(&self, engine: &Engine, mut frame: Frame) {
        let request = *self.request.lock().expect("Vista confronto");
        if !request.show {
            return;
        }
        let id = request
            .selected
            .filter(|i| *i < frame.cars.len())
            .unwrap_or(frame.leader);
        let _ = engine.ray_selection(request.selected);
        let samples = if request.brain && !request.frozen {
            engine
                .atlas_activity(id, request.filter, request.density, request.neuron)
                .ok()
        } else {
            None
        };
        let inspection = engine.inspect(id).ok();
        frame.worker_count = 1;
        let _ = self.tx.send(Update::View(frame, samples, inspection));
    }
}

#[derive(Resource, Default)]
pub struct Comparison {
    pub running: bool,
    pub rows: [Trial; 4],
    pub circuit: String,
    pub population: u32,
    pub limit: u32,
    pub single: bool,
    pub refine: bool,
    pub refinement: Option<Coefficients>,
    started: Option<String>,
    finished: Option<String>,
    options: Option<Setup>,
    restore_running: bool,
    normal: Option<NormalView>,
    pending: Option<(Setup, Track, Frame, Points)>,
    looking: Arc<Mutex<ViewRequest>>,
    rx: Mutex<Option<mpsc::Receiver<Update>>>,
    cancel: Arc<AtomicBool>,
}

impl Comparison {
    pub fn stop(&mut self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn start(&mut self, mut settings: Setup, minutes: u32, restore_running: bool) {
        let (tx, rx) = mpsc::channel();
        settings.seed = 7717;
        settings.driver = Driver::Connectome;
        self.circuit = settings.circuit.clone();
        self.population = settings.population;
        self.limit = minutes;
        self.single = false;
        self.refine = false;
        self.options = Some(settings.clone());
        self.started = None;
        self.finished = None;
        self.restore_running = restore_running;
        self.rows = std::array::from_fn(|_| Trial::default());
        self.running = true;
        self.cancel = Arc::new(AtomicBool::new(false));
        let stop = self.cancel.clone();
        let looking = self.looking.clone();
        *self.rx.get_mut().expect("Coda confronto") = Some(rx);
        let spawned = thread::Builder::new()
            .name("confronto-male-cns".into())
            .stack_size(8 * 1024 * 1024)
            .spawn(move || {
                let engine = Engine::new_gpu();
                if let Ok(engine) = &engine {
                    if let Ok(date) = engine.iso_now() {
                        let _ = tx.send(Update::Began(date));
                    }
                }
                for (index, model) in MODELS.into_iter().enumerate() {
                    if stop.load(Ordering::Relaxed) {
                        let _ = tx.send(Update::Row(
                            index,
                            Trial {
                                status: Status::NotRun,
                                ..default()
                            },
                        ));
                        continue;
                    }
                    let _ = tx.send(Update::Row(
                        index,
                        Trial {
                            status: Status::Loading,
                            ..default()
                        },
                    ));
                    settings.model = model.into();
                    let result = engine
                        .as_ref()
                        .map_err(|e| e.to_string())
                        .and_then(|engine| {
                            run_trial(
                                engine,
                                &settings,
                                minutes,
                                &stop,
                                Display {
                                    tx: &tx,
                                    request: &looking,
                                },
                                |row| {
                                    let _ = tx.send(Update::Row(index, row));
                                },
                            )
                            .map_err(|e| e.to_string())
                        });
                    let _ = tx.send(Update::Row(
                        index,
                        result.unwrap_or_else(|error| Trial {
                            status: Status::Error,
                            error: Some(error),
                            ..default()
                        }),
                    ));
                }
                if let Ok(engine) = engine {
                    if let Ok(date) = engine.iso_now() {
                        let _ = tx.send(Update::Ended(date));
                    }
                }
            });
        if let Err(error) = spawned {
            self.running = false;
            self.rows[0] = Trial {
                status: Status::Error,
                error: Some(error.to_string()),
                ..default()
            };
        }
    }

    pub fn start_decoder(
        &mut self,
        bundle: Bundle,
        minutes: u32,
        refine: bool,
        restore_running: bool,
    ) {
        let (sender, receiver) = mpsc::channel();
        self.circuit = bundle.circuit.clone();
        self.population = if refine { 4 } else { 1 };
        self.options = Some(Setup {
            model: "v3".into(),
            circuit: bundle.circuit.clone(),
            population: self.population,
            mutation: 0.,
            speed: 30.,
            ..default()
        });
        self.limit = minutes;
        self.rows = std::array::from_fn(|_| Trial::default());
        self.started = None;
        self.finished = None;
        self.single = true;
        self.refine = refine;
        self.refinement = None;
        self.restore_running = restore_running;
        self.running = true;
        self.cancel = Arc::new(AtomicBool::new(false));
        let cancel = self.cancel.clone();
        let looking = self.looking.clone();
        let setup = self.options.clone().expect("Impostazioni decoder");
        *self.rx.get_mut().expect("Coda confronto") = Some(receiver);
        let job = thread::Builder::new()
            .name("V3 addestrato".into())
            .stack_size(8 * 1024 * 1024)
            .spawn(move || {
                let _ = sender.send(Update::Row(
                    1,
                    Trial {
                        status: Status::Loading,
                        ..default()
                    },
                ));
                let result = Engine::new().and_then(|engine| {
                    let _ = sender.send(Update::Began(engine.iso_now()?));
                    let (row, winner) = run_decoder(
                        &engine,
                        &bundle,
                        minutes,
                        refine,
                        &cancel,
                        &setup,
                        Display {
                            tx: &sender,
                            request: &looking,
                        },
                        |row| {
                            let _ = sender.send(Update::Row(1, row));
                        },
                    )?;
                    if let Some(values) = winner {
                        let _ = sender.send(Update::Refined(values));
                    }
                    let _ = sender.send(Update::Ended(engine.iso_now()?));
                    Ok(row)
                });
                let _ = sender.send(Update::Row(
                    1,
                    result.unwrap_or_else(|error| Trial {
                        status: Status::Error,
                        error: Some(error.to_string()),
                        ..default()
                    }),
                ));
            });
        if let Err(error) = job {
            self.running = false;
            self.rows[1] = Trial {
                status: Status::Error,
                error: Some(error.to_string()),
                ..default()
            };
        }
    }

    pub fn report(&self) -> Option<Value> {
        let setup = self.options.as_ref()?;
        let mut settings = json!({"circuitId":setup.circuit,"population":setup.population,"mutation":setup.mutation,
                "speedMultiplier":setup.speed,"limitSeconds":self.limit*60,"seed":7717,"workerCount":1});
        let (execution, goal, cases) = if self.single {
            settings["trialProfile"] = json!("v3-imitation");
            if self.refine {
                settings["refineActuators"] = json!(true);
            }
            let (execution, goal) = if self.refine {
                (
                    "pretrained-v3-reward-refinement",
                    "Affinamento per ricompense di tre coefficienti dei comandi.",
                )
            } else {
                (
                    "pretrained-v3-trial",
                    "Una vettura completa due giri misurati del circuito del decoder.",
                )
            };
            (execution, goal, vec![self.rows[1].report("v3")])
        } else {
            (
                "sequential-cold-start",
                "One real non-diagnostic agent completes two ordered laps, then its generation ends naturally. Failed generations do not meet the goal.",
                self.rows
                    .iter()
                    .zip(MODELS)
                    .map(|(row, model)| row.report(model))
                    .collect(),
            )
        };
        Some(json!({
            "schema":1,"appVersion":"5.7.1","startedAt":self.started,"finishedAt":self.finished,
            "settings":settings,"execution":execution,"goal":goal,
            "timing":"Wall clock excludes graph loading; simSeconds counts every fixed physical tick, including failed generations. Zero limitSeconds means no wall-time limit.",
            "cases":cases,
        }))
    }
}

fn run_trial(
    engine: &Engine,
    settings: &Setup,
    minutes: u32,
    stop: &AtomicBool,
    display: Display<'_>,
    publish: impl FnMut(Trial),
) -> crate::engine::Result<Trial> {
    let (track, frame) = engine.start(settings)?;
    display.start(engine, settings.clone(), track, frame)?;
    drive_trial(
        engine,
        settings.population,
        settings.speed,
        f64::from(minutes) * 60.,
        stop,
        &display,
        publish,
    )
}

fn drive_trial(
    engine: &Engine,
    population: u32,
    speed: f64,
    limit_s: f64,
    stop: &AtomicBool,
    display: &Display<'_>,
    mut publish: impl FnMut(Trial),
) -> crate::engine::Result<Trial> {
    engine.track_two_laps()?;
    let start = Instant::now();
    let mut row = Trial {
        status: Status::Running,
        progress: engine.trial_progress(),
        ..default()
    };
    let mut last = Instant::now();
    loop {
        row.seconds = start.elapsed().as_secs_f64();
        if stop.load(Ordering::Relaxed) {
            row.status = Status::Stopped;
            break;
        }
        if limit_s > 0. && row.seconds >= limit_s {
            row.status = Status::Limit;
            break;
        }
        let desired = (row.seconds * speed * 60.).floor() as u32;
        let dispatched = row.progress.as_ref().map_or(0, |p| p.ticks);
        let remaining = desired.saturating_sub(dispatched);
        if remaining == 0 {
            thread::sleep(Duration::from_millis(3));
            continue;
        }
        let batch = if population >= 40 { 3 } else { 12 };
        let frame = engine.advance_with_clock(remaining.min(batch), row.seconds, limit_s)?;
        row.backend = if frame.gpu.state == "active" {
            "wgpu + CPU".into()
        } else {
            "CPU".into()
        };
        let Some(stats) = frame.trial.clone() else {
            return Err("Metriche del confronto assenti".into());
        };
        row.elapsed = f64::from(stats.ticks) / 60.;
        row.laps = stats.max_laps;
        row.lap_time = stats.hit.as_ref().map(|h| h.two_lap_sim_seconds);
        let complete = stats.done;
        let expired = stats.limit_reached;
        row.progress = Some(stats);
        if expired {
            row.seconds = start.elapsed().as_secs_f64();
            row.status = Status::Limit;
            break;
        }
        if complete {
            row.seconds = start.elapsed().as_secs_f64();
            if row.lap_time.is_some() {
                row.status = Status::Completed;
            } else {
                row.status = Status::Failed;
                row.error = engine
                    .actor_results()?
                    .first()
                    .map(|car| car.reason.clone())
                    .or_else(|| Some("Due giri non completati.".into()));
            }
            break;
        }
        if frame.stopped {
            row.status = Status::Failed;
            if let Some(stats) = row.progress.as_mut() {
                stats.generation_sim_seconds = Some(frame.elapsed);
            }
            row.error = Some("Due giri non completati.".into());
            break;
        }
        if last.elapsed().as_millis() >= 100 {
            display.sample(engine, frame);
            publish(row.clone());
            last = Instant::now();
        }
    }
    if matches!(row.status, Status::Stopped | Status::Limit)
        && let Some(progress) = &mut row.progress
    {
        progress.done = true;
        progress.limit_reached = row.status == Status::Limit;
    }
    Ok(row)
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateResult {
    pub(crate) agent_id: usize,
    safe: bool,
    laps: u32,
    reason: String,
    progress_meters: f64,
    fitness: f64,
    lap_times: Vec<f64>,
    #[serde(skip_serializing)]
    pub(crate) done_at: Option<f64>,
}

impl CandidateResult {
    fn total_time(&self) -> Option<f64> {
        (self.safe
            && self.laps == 2
            && self.reason == "limite 2 giri"
            && self.lap_times.len() == 2
            && self.lap_times.iter().all(|t| t.is_finite() && *t > 0.)
            && self.fitness.is_finite())
        .then(|| self.lap_times.iter().sum())
    }
}

fn population(elite: Coefficients, generation: u32) -> [Coefficients; 4] {
    let mut rng = crate::random::Random::new(f64::from(40719 + generation));
    std::array::from_fn(|index| {
        if index == 0 {
            return elite;
        }
        Coefficients {
            steering_scale: (elite.steering_scale + 0.018 * (rng.draw() * 2. - 1.))
                .clamp(0.94, 1.06),
            pedal_scale: (elite.pedal_scale + 0.035 * (rng.draw() * 2. - 1.)).clamp(0.9, 1.18),
            acceleration_bias: (elite.acceleration_bias
                + if index == 1 {
                    0.012
                } else {
                    0.018 * (rng.draw() * 2. - 1.)
                })
            .clamp(0., 0.075),
        }
    })
}

fn refinement_report(baseline: Option<&Value>, rounds: &[Value]) -> Value {
    let selected = rounds.last().and_then(|last| {
        let index = last["selected"].as_u64()? as usize;
        last["candidates"]
            .as_array()?
            .iter()
            .find(|car| car["agentId"].as_u64() == Some(index as u64))
    });
    let improvement = baseline
        .and_then(|car| car["twoLapSimSeconds"].as_f64())
        .zip(selected.and_then(|car| car["twoLapSimSeconds"].as_f64()))
        .map(|(a, b)| a - b);
    json!({"targetUpdates":2,"baseline":baseline,"rounds":rounds,"selected":selected,"improvementSeconds":improvement})
}

fn keep_completed_refinement(
    row: &mut Trial,
    previous: &Trial,
    baseline: Option<&Value>,
    rounds: &[Value],
) {
    if let Some(progress) = &mut row.progress {
        if let Some(prior) = &previous.progress {
            progress.max_laps = progress.max_laps.max(prior.max_laps);
            progress.best_progress_meters = progress
                .best_progress_meters
                .max(prior.best_progress_meters);
            progress.hit = prior.hit.clone();
        } else {
            progress.hit = None;
        }
        progress.generations = rounds.len() as u32;
        progress.generation_sim_seconds = None;
        row.laps = progress.max_laps;
        row.lap_time = progress.hit.as_ref().map(|hit| hit.two_lap_sim_seconds);
    }
    row.training = Some(refinement_report(baseline, rounds));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stopped_round_keeps_the_completed_reference_round() {
        let mut saved = crate::trial::Tracker::new(1).progress;
        saved.max_laps = 2;
        saved.best_progress_meters = 6674.;
        saved.hit = Some(TrialHit {
            generation: 1,
            agent_id: 1,
            lap_times: [395., 397.],
            two_lap_sim_seconds: 792.,
            wall_to_two_laps_seconds: 29.,
        });
        let previous = Trial {
            progress: Some(saved),
            ..default()
        };
        let active = crate::trial::Tracker::new(2).progress;
        let mut stopped = Trial {
            status: Status::Limit,
            progress: Some(active),
            ..default()
        };
        let baseline = json!({"agentId":0,"completed":true,"twoLapSimSeconds":794.});
        let rounds = vec![json!({"selected":1,"candidates":[baseline.clone(),
            {"agentId":1,"completed":true,"twoLapSimSeconds":792.}]})];
        keep_completed_refinement(&mut stopped, &previous, Some(&baseline), &rounds);
        let stats = stopped.progress.unwrap();
        assert!(stopped.status == Status::Limit);
        assert_eq!(stats.generations, 1);
        assert_eq!(stats.current_generation, 2);
        assert_eq!(stats.ticks, 0);
        assert_eq!(stats.hit.unwrap().generation, 1);
        assert_eq!(stopped.lap_time, Some(792.));
        let training = stopped.training.unwrap();
        assert_eq!(training["rounds"].as_array().unwrap().len(), 1);
        assert_eq!(training["improvementSeconds"].as_f64(), Some(2.));
    }
}

fn run_decoder(
    engine: &Engine,
    bundle: &Bundle,
    minutes: u32,
    refine: bool,
    stop: &AtomicBool,
    setup: &Setup,
    display: Display<'_>,
    mut publish: impl FnMut(Trial),
) -> crate::engine::Result<(Trial, Option<Coefficients>)> {
    if !refine {
        engine.actor_start(bundle, &[], 1, None)?;
        display.start(engine, setup.clone(), engine.track()?, engine.snapshot()?)?;
        let mut row = drive_trial(
            engine,
            1,
            30.,
            f64::from(minutes) * 60.,
            stop,
            &display,
            |mut row| {
                row.decoder_hash = Some(bundle.hash.clone());
                publish(row);
            },
        )?;
        row.decoder_hash = Some(bundle.hash.clone());
        if row.status == Status::Failed {
            row.error = engine
                .actor_results()?
                .first()
                .map(|car| car.reason.clone());
        }
        return Ok((row, None));
    }

    let mut elite = bundle.initial;
    let mut elapsed = 0.;
    let mut wall = 0.;
    let mut best_progress = 0.;
    let mut max_laps = 0;
    let mut previous = None;
    let mut baseline: Option<Value> = None;
    let mut rounds = Vec::new();
    let limit = f64::from(minutes) * 60.;
    let mut result = Trial::default();
    let mut refined = None;
    for generation in 1..=2 {
        let settings = population(elite, generation);
        engine.actor_start(bundle, &settings, generation, previous)?;
        if generation == 1 {
            display.start(engine, setup.clone(), engine.track()?, engine.snapshot()?)?;
        }
        let remaining = if limit == 0. {
            0.
        } else {
            (limit - wall).max(0.001)
        };
        let mut row = drive_trial(engine, 4, 30., remaining, stop, &display, |mut active| {
            active.elapsed += elapsed;
            active.seconds += wall;
            active.decoder_hash = Some(bundle.hash.clone());
            keep_completed_refinement(&mut active, &result, baseline.as_ref(), &rounds);
            publish(active);
        })?;
        let prior_wall = wall;
        elapsed += row.elapsed;
        wall += row.seconds;
        row.elapsed = elapsed;
        row.seconds = wall;
        row.decoder_hash = Some(bundle.hash.clone());
        if matches!(row.status, Status::Stopped | Status::Limit) {
            keep_completed_refinement(&mut row, &result, baseline.as_ref(), &rounds);
            result = row;
            break;
        }
        let candidates = engine.actor_results()?;
        let view: Vec<_> = candidates
            .iter()
            .map(|c| {
                let mut data = json!(c);
                data["parameters"] = json!(settings[c.agent_id]);
                data["completed"] = json!(c.total_time().is_some());
                data["twoLapSimSeconds"] = json!(c.total_time());
                data
            })
            .collect();
        let winner = candidates
            .iter()
            .filter_map(|c| Some((c, c.total_time()?)))
            .min_by(|(a, at), (b, bt)| {
                b.fitness
                    .total_cmp(&a.fitness)
                    .then(at.total_cmp(bt))
                    .then(a.agent_id.cmp(&b.agent_id))
            });
        let selected = winner.as_ref().map(|(c, _)| c.agent_id);
        if generation == 1 {
            baseline = view.first().cloned();
        }
        if let Some((car, time)) = winner {
            elite = settings[car.agent_id];
            previous = car.lap_times.iter().copied().min_by(f64::total_cmp);
            row.lap_time = Some(time);
            let stats = row.progress.as_mut().expect("Metriche episodio V3");
            stats.hit = Some(TrialHit {
                generation: u64::from(generation),
                agent_id: car.agent_id,
                lap_times: [car.lap_times[0], car.lap_times[1]],
                two_lap_sim_seconds: time,
                wall_to_two_laps_seconds: car.done_at.unwrap_or_default() + prior_wall,
            });
        } else {
            row.lap_time = None;
            if let Some(stats) = row.progress.as_mut() {
                stats.hit = None;
            }
        }
        let stats = row.progress.as_mut().expect("Metriche episodio V3");
        best_progress = f64::max(best_progress, stats.best_progress_meters);
        max_laps = u32::max(max_laps, stats.max_laps);
        stats.best_progress_meters = best_progress;
        stats.max_laps = max_laps;
        stats.generations = generation;
        row.laps = max_laps;
        rounds.push(
            json!({"generation":generation,"simSeconds":stats.generation_sim_seconds,
            "candidates":view,"selected":selected}),
        );
        if generation == 2 {
            row.training = Some(refinement_report(baseline.as_ref(), &rounds));
            row.status = if selected.is_some() {
                Status::Completed
            } else {
                Status::Failed
            };
            row.error = selected
                .is_none()
                .then(|| "Nessun affinamento ha concluso due giri in sicurezza.".into());
            refined = selected.map(|_| elite);
        }
        result = row;
    }
    Ok((result, refined))
}

pub fn read(mut state: ResMut<Comparison>, mut session: ResMut<Session>) {
    let mut updates = Vec::new();
    let mut closed = false;
    if let Some(rx) = state.rx.lock().expect("Coda confronto").as_ref() {
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
    if state.running {
        *state.looking.lock().expect("Vista confronto") = ViewRequest {
            show: session.page != Page::Compare,
            brain: matches!(session.page, Page::Brain | Page::Split),
            selected: session.selected,
            filter: session.atlas_filter,
            density: session.atlas_density,
            neuron: session.atlas_selected,
            frozen: session.atlas_frozen,
        };
    }
    for update in updates {
        match update {
            Update::Row(i, row) => state.rows[i] = row,
            Update::Began(date) => state.started = Some(date),
            Update::Ended(date) => state.finished = Some(date),
            Update::Refined(values) => state.refinement = Some(values),
            Update::PrepareView(setup, track, frame, atlas) => {
                state.pending = Some((setup, track, frame, atlas))
            }
            Update::View(frame, activity, data) => {
                if let Some(prepared) = &mut state.pending {
                    prepared.2 = frame;
                } else if state.normal.is_some() {
                    session.frame = Some(frame);
                    if let Some(activity) = activity {
                        session.activity = Some(activity);
                    }
                    if let Some(data) = data {
                        session.inspection = Some(data);
                    }
                }
            }
        }
    }
    if !closed
        && !session.request
        && !session.busy
        && let Some((setup, mut track, frame, atlas)) = state.pending.take()
    {
        if state.normal.is_none() {
            state.normal = Some(NormalView::take(&mut session));
        }
        session.decoration = crate::scenery::layout(&setup.circuit).ok();
        if let Some(decoration) = &mut session.decoration {
            track.landmarks.append(&mut decoration.landmarks);
        }
        session.mutation = setup.mutation;
        session.setup = setup;
        session.profile = if state.single {
            V3Profile::Wide
        } else {
            V3Profile::Standard
        };
        session.track = Some(track);
        session.frame = Some(frame);
        session.points = Some(atlas);
        session.activity = None;
        session.inspection = None;
        session.selected = None;
        session.atlas_selected = None;
        session.atlas_focus = None;
        session.landmark = None;
        session.revision += 1;
    }
    if closed {
        *state.rx.get_mut().expect("Coda confronto") = None;
        state.running = false;
        state.pending = None;
        if let Some(normal) = state.normal.take() {
            normal.restore(&mut session);
        }
        session.running = state.restore_running;
        session.message = "Confronto terminato".into();
    }
}
