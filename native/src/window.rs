use crate::{
    atlas, comparison, dashboard,
    engine::{Engine, Frame, Setup, Track},
    scene,
};
use bevy::{asset::io::embedded::EmbeddedAssetRegistry, prelude::*};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::mpsc::{self, Receiver, Sender},
    thread,
};

const CIRCUITS: [&str; 4] = ["monza", "monaco", "le-mans", "lab"];
const MODELS: [&str; 4] = ["v2", "v3", "v4", "v5"];
const POPULATIONS: [u32; 5] = [4, 16, 40, 64, 100];

pub fn run(smoke: Option<PathBuf>) -> AppExit {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "MAL-E CNS Circuit Lab · Rust nativo".into(),
            resolution: (1540, 980).into(),
            resize_constraints: bevy::window::WindowResizeConstraints {
                min_width: 1050.0,
                min_height: 760.0,
                ..default()
            },
            ..default()
        }),
        ..default()
    }));
    let registry = app.world().resource::<EmbeddedAssetRegistry>();
    registry.insert_asset(
        PathBuf::from("porsche.glb"),
        Path::new("porsche.glb"),
        include_bytes!("../../outputs/assets/porsche-992-gt3-r-lod.glb").as_slice(),
    );
    registry.insert_asset(
        PathBuf::from("trees.glb"),
        Path::new("trees.glb"),
        include_bytes!("../../outputs/assets/trees-supplied-v1.glb").as_slice(),
    );
    registry.insert_asset(
        PathBuf::from("porsche-top.png"),
        Path::new("porsche-top.png"),
        include_bytes!("../../outputs/assets/porsche-992-gt3r-top-v1.png").as_slice(),
    );
    let setup = Setup::default();
    let worker = start_worker(setup.clone());
    app.insert_resource(worker)
        .insert_resource(Session {
            setup,
            mutation: 0.32,
            camera: CameraMode::Follow,
            zoom: 1.0,
            comparison_limit: 10,
            atlas_live: true,
            ..default()
        })
        .insert_resource(ClearColor(Color::srgb(0.64, 0.76, 0.85)))
        .init_resource::<comparison::Comparison>()
        .add_systems(Startup, (scene::setup, dashboard::build, atlas::setup))
        .add_systems(
            Update,
            (
                read_worker,
                controls,
                comparison::read,
                advance,
                sample_atlas,
                scene::setup_fleet,
                scene::view_input,
                scene::update,
                atlas::update,
                dashboard::refresh,
                dashboard::viewports,
            )
                .chain(),
        );
    if let Some(path) = smoke {
        app.insert_resource(scene::Smoke::new(path))
            .add_systems(Update, scene::verify_window.after(dashboard::refresh));
    }
    app.run()
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum CameraMode {
    #[default]
    Overview,
    Follow,
    Cockpit,
    Map,
}

impl CameraMode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Overview => "Panoramica",
            Self::Follow => "Inseguimento",
            Self::Cockpit => "Prima persona",
            Self::Map => "Dall’alto",
        }
    }
}

#[derive(Resource, Default)]
pub struct Session {
    pub setup: Setup,
    pub track: Option<Track>,
    pub points: Option<crate::atlas::Points>,
    pub activity: Option<(usize, Vec<f32>)>,
    pub atlas_live: bool,
    pub atlas_frozen: bool,
    pub atlas_center: u64,
    activity_pending: bool,
    last_activity: Option<std::time::Instant>,
    pub frame: Option<Frame>,
    pub running: bool,
    pub busy: bool,
    pub request: bool,
    pub revision: u64,
    pub camera: CameraMode,
    pub selected: Option<usize>,
    pub rays: bool,
    pub page: Page,
    pub dark: bool,
    pub zoom: f32,
    pub mutation: f64,
    pub effective: f64,
    pub comparison_limit: u32,
    pub smoke_action: Vec<Action>,
    sample: Option<(std::time::Instant, u64)>,
    total_ticks: u64,
    pub message: String,
    ticks_due: f64,
}

impl Session {
    pub fn selected_car(&self) -> usize {
        let Some(frame) = &self.frame else { return 0 };
        self.selected
            .filter(|i| *i < frame.cars.len())
            .unwrap_or(frame.leader)
    }
}

enum Request {
    Start(Setup),
    Tick(u32),
    SampleActivity(usize),
    Mutation(f64),
    Evolve,
    Save(f64),
    Load,
}

enum Update {
    Ready(Setup, Track, Frame, crate::atlas::Points, bool),
    Frame(Frame, u32),
    Activity(usize, Option<Vec<f32>>),
    Info(String),
    Error(String),
}

#[derive(Resource)]
struct Worker {
    tx: Sender<Request>,
    rx: std::sync::Mutex<Receiver<Update>>,
}

fn start_worker(setup: Setup) -> Worker {
    let (tx, requests) = mpsc::channel();
    let (responses, rx) = mpsc::channel();
    thread::Builder::new()
        .name("simulazione-male-cns".into())
        .stack_size(8 * 1024 * 1024)
        .spawn(move || {
            let engine = match Engine::new() {
                Ok(engine) => engine,
                Err(error) => {
                    let _ = responses.send(Update::Error(error.to_string()));
                    return;
                }
            };
            let mut next = Some(Request::Start(setup));
            while let Some(request) = next.take().or_else(|| requests.recv().ok()) {
                let result = match request {
                    Request::Start(setup) => engine.start(&setup).and_then(|(track, frame)| {
                        Ok(Update::Ready(setup, track, frame, engine.atlas()?, true))
                    }),
                    Request::Tick(ticks) => engine.advance(ticks).map(|f| Update::Frame(f, ticks)),
                    Request::SampleActivity(car) => {
                        Ok(Update::Activity(car, engine.atlas_activity(car).ok()))
                    }
                    Request::Mutation(value) => {
                        engine.mutation(value).map(|_| Update::Info(String::new()))
                    }
                    Request::Evolve => engine.evolve().map(|f| Update::Frame(f, 0)),
                    Request::Save(speed) => save_dialog(&engine, speed),
                    Request::Load => load_dialog(&engine),
                };
                if responses
                    .send(result.unwrap_or_else(|error| Update::Error(error.to_string())))
                    .is_err()
                {
                    break;
                }
            }
        })
        .expect("Avvio del worker di simulazione");
    Worker {
        tx,
        rx: std::sync::Mutex::new(rx),
    }
}

fn save_dialog(engine: &Engine, speed: f64) -> crate::engine::Result<Update> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Progressi MAL-E", &["malecns-save"])
        .set_file_name("Circuit-Lab-5.7.1.malecns-save")
        .save_file()
    else {
        return Ok(Update::Info("Salvataggio annullato".into()));
    };
    let text = engine.save(speed)?;
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    let result = file
        .write_all(text.as_bytes())
        .and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|_| fs::rename(&temporary, &path)) {
        let _ = fs::remove_file(temporary);
        return Err(error.into());
    }
    Ok(Update::Info("Progressi salvati".into()))
}

fn load_dialog(engine: &Engine) -> crate::engine::Result<Update> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Progressi MAL-E", &["malecns-save"])
        .pick_file()
    else {
        return Ok(Update::Info("Caricamento annullato".into()));
    };
    let mut text = String::new();
    fs::File::open(path)?
        .take(16 * 1024 * 1024 + 1)
        .read_to_string(&mut text)?;
    let (setup, track, frame) = engine.load(&text)?;
    Ok(Update::Ready(setup, track, frame, engine.atlas()?, false))
}

fn read_worker(worker: Res<Worker>, mut session: ResMut<Session>) {
    let responses = worker.rx.lock().expect("Coda della simulazione");
    while let Ok(message) = responses.try_recv() {
        if let Update::Activity(car, values) = message {
            session.activity_pending = false;
            if !session.atlas_frozen {
                session.activity = values.map(|sample| (car, sample));
            }
            continue;
        }
        if matches!(message, Update::Frame(_, ticks) if ticks > 0) {
            session.request = false;
        } else {
            session.busy = false;
        }
        match message {
            Update::Ready(setup, track, frame, points, allow_run) => {
                let first = session.track.is_none();
                session.points = Some(points);
                session.activity = None;
                session.last_activity = None;
                session.effective = 0.0;
                session.total_ticks = 0;
                session.sample = None;
                session.mutation = setup.mutation;
                session.setup = setup;
                session.track = Some(track);
                session.frame = Some(frame);
                session.running = allow_run && (first || session.running);
                session.selected = None;
                session.ticks_due = 0.0;
                session.revision += 1;
                session.message.clear();
            }
            Update::Frame(frame, ticks) => {
                session.frame = Some(frame);
                session.total_ticks += u64::from(ticks);
                let now = std::time::Instant::now();
                if let Some((then, base)) = session.sample {
                    let dt = now.duration_since(then).as_secs_f64();
                    if dt >= 0.45 {
                        session.effective = (session.total_ticks - base) as f64 / (60.0 * dt);
                        session.sample = Some((now, session.total_ticks));
                    }
                } else {
                    session.sample = Some((now, session.total_ticks));
                }
            }
            Update::Info(info) => session.message = info,
            Update::Error(error) => {
                session.running = false;
                session.request = false;
                session.message = error;
            }
            Update::Activity(_, _) => unreachable!(),
        }
    }
}

fn advance(time: Res<Time<Real>>, worker: Res<Worker>, mut session: ResMut<Session>) {
    if !session.running || session.busy || session.frame.is_none() {
        return;
    }
    session.ticks_due =
        (session.ticks_due + time.delta_secs_f64() * 60.0 * session.setup.speed).min(60.0);
    if session.request || session.ticks_due < 1.0 {
        return;
    }
    let ticks = (session.ticks_due.floor() as u32).min(30);
    session.ticks_due -= f64::from(ticks);
    session.request = worker.tx.send(Request::Tick(ticks)).is_ok();
}

fn sample_atlas(worker: Res<Worker>, mut session: ResMut<Session>) {
    if !matches!(session.page, Page::Brain | Page::Split)
        || !session.atlas_live
        || session.atlas_frozen
        || session.activity_pending
        || session.busy
        || session.frame.is_none()
        || session
            .last_activity
            .is_some_and(|t| t.elapsed().as_millis() < 175)
    {
        return;
    }
    session.activity_pending = worker
        .tx
        .send(Request::SampleActivity(session.selected_car()))
        .is_ok();
    session.last_activity = Some(std::time::Instant::now());
}

#[derive(Component, Copy, Clone, PartialEq, Eq)]
pub enum Action {
    Run,
    Circuit,
    Model,
    Population,
    SetSpeed(u8),
    SetMutation(u8),
    Camera,
    Select,
    Previous,
    Rays,
    Save,
    Load,
    Reset,
    Evolve,
    Map,
    Scene,
    Center,
    ZoomIn,
    ZoomOut,
    Page(Page),
    Theme,
    AtlasLive,
    AtlasFreeze,
    AtlasCenter,
    Compare,
    StopComparison,
    LimitDown,
    LimitUp,
}

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum Page {
    #[default]
    Session,
    Compare,
    Brain,
    Split,
}

fn next<T: PartialEq + Copy, const N: usize>(choices: [T; N], current: T) -> T {
    choices
        .iter()
        .position(|choice| *choice == current)
        .map_or(choices[0], |index| choices[(index + 1) % N])
}

fn controls(
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Query<(&Interaction, &Action), Changed<Interaction>>,
    worker: Res<Worker>,
    mut session: ResMut<Session>,
    mut compare: ResMut<comparison::Comparison>,
    sliders: crate::dashboard::SliderInput,
) {
    let actions = buttons
        .iter()
        .filter_map(|(i, a)| (*i == Interaction::Pressed).then_some(*a))
        .chain(
            [
                (KeyCode::Space, Action::Run),
                (KeyCode::KeyC, Action::Camera),
                (KeyCode::Tab, Action::Select),
                (KeyCode::KeyR, Action::Rays),
            ]
            .into_iter()
            .filter_map(|(key, a)| keys.just_pressed(key).then_some(a)),
        );
    let actions = actions.chain(sliders.action());
    let actions = actions.chain(std::mem::take(&mut session.smoke_action));
    for action in actions {
        match action {
            Action::Theme => {
                session.dark = !session.dark;
                continue;
            }
            Action::Page(page) => {
                session.page = page;
                continue;
            }
            Action::StopComparison => {
                compare.stop();
                continue;
            }
            Action::AtlasLive => {
                session.atlas_live = !session.atlas_live;
                continue;
            }
            Action::AtlasFreeze => {
                session.atlas_frozen = !session.atlas_frozen;
                continue;
            }
            Action::AtlasCenter => {
                session.atlas_center += 1;
                continue;
            }
            _ => {}
        }
        if session.track.is_none() {
            continue;
        }
        let mut setup = session.setup.clone();
        setup.mutation = session.mutation;
        let request = match action {
            Action::Run => {
                if !session.busy && !compare.running {
                    session.running = !session.running;
                    session.ticks_due = 0.0;
                    session.sample = None;
                    session.effective = 0.0;
                }
                continue;
            }
            Action::Camera => {
                session.camera = next(
                    [
                        CameraMode::Overview,
                        CameraMode::Follow,
                        CameraMode::Cockpit,
                    ],
                    session.camera,
                );
                session.zoom = 1.0;
                continue;
            }
            Action::Map => {
                session.camera = CameraMode::Map;
                session.zoom = 1.0;
                continue;
            }
            Action::Scene => {
                session.camera = CameraMode::Follow;
                session.zoom = 1.0;
                continue;
            }
            Action::Center => {
                session.camera = CameraMode::Overview;
                session.zoom = 1.0;
                continue;
            }
            Action::ZoomIn | Action::ZoomOut => {
                session.zoom = (session.zoom
                    * if action == Action::ZoomIn {
                        1.23
                    } else {
                        1.0 / 1.23
                    })
                .clamp(0.5, 6.0);
                continue;
            }
            Action::Select | Action::Previous => {
                let count = session.frame.as_ref().map_or(0, |f| f.cars.len());
                session.selected = match (action, session.selected) {
                    (Action::Previous, None) if count > 0 => Some(count - 1),
                    (Action::Previous, Some(i)) if i > 0 => Some(i - 1),
                    (Action::Select, None) if count > 0 => Some(0),
                    (Action::Select, Some(i)) if i + 1 < count => Some(i + 1),
                    _ => None,
                };
                continue;
            }
            Action::Rays => {
                session.rays = !session.rays;
                continue;
            }
            Action::SetSpeed(value) => {
                session.setup.speed = f64::from(value.clamp(1, 60)) * 0.5;
                continue;
            }
            Action::SetMutation(value) => {
                if session.busy || compare.running {
                    continue;
                }
                let value = f64::from(value.min(35)) / 100.0;
                if session.mutation == value {
                    continue;
                }
                session.mutation = value;
                Request::Mutation(value)
            }
            Action::LimitDown | Action::LimitUp => {
                session.comparison_limit = if action == Action::LimitUp {
                    (session.comparison_limit + 1).min(60)
                } else {
                    session.comparison_limit.saturating_sub(1)
                };
                continue;
            }
            Action::Compare => {
                if !compare.running {
                    session.running = false;
                    compare.start(setup, session.mutation, session.comparison_limit);
                }
                continue;
            }
            Action::Circuit => {
                setup.circuit = next(CIRCUITS, setup.circuit.as_str()).into();
                Request::Start(setup)
            }
            Action::Model => {
                setup.model = next(MODELS, setup.model.as_str()).into();
                Request::Start(setup)
            }
            Action::Population => {
                setup.population = next(POPULATIONS, setup.population);
                Request::Start(setup)
            }
            Action::Reset => Request::Start(setup),
            Action::Save => Request::Save(setup.speed),
            Action::Load => Request::Load,
            Action::Evolve => Request::Evolve,
            _ => continue,
        };
        if !session.busy && !compare.running {
            if matches!(request, Request::Save(_) | Request::Load | Request::Evolve) {
                session.running = false;
            }
            session.busy = worker.tx.send(request).is_ok();
            session.message = "Operazione in corso…".into();
        }
    }
}
