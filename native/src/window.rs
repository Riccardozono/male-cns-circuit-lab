use crate::{
    atlas, comparison, dashboard,
    decoder::{Bundle, Coefficients},
    engine::{Driver, Frame, Inspection, Setup, Track, VehicleAction},
    menus::{Menu, Panel},
    pool::Pool,
    preferences::{Preferences, Stored},
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

pub(crate) const CIRCUITS: [&str; 4] = ["monza", "monaco", "le-mans", "lab"];
pub(crate) const MODELS: [&str; 4] = ["v2", "v3", "v4", "v5"];

pub fn run(smoke: Option<PathBuf>) -> AppExit {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "MAL-E CNS Circuit Lab · Rust nativo".into(),
            resolution: (1540, 980).into(),
            resize_constraints: bevy::window::WindowResizeConstraints {
                min_width: 1080.0,
                min_height: 720.0,
                ..default()
            },
            ..default()
        }),
        ..default()
    }));
    app.add_plugins(MaterialPlugin::<crate::scenery::TrackMaterial>::default());
    let registry = app.world().resource::<EmbeddedAssetRegistry>();
    registry.insert_asset(
        PathBuf::from("track_surface.wgsl"),
        Path::new("track_surface.wgsl"),
        include_bytes!("track_surface.wgsl").as_slice(),
    );
    registry.insert_asset(
        PathBuf::from("porsche.glb"),
        Path::new("porsche.glb"),
        include_bytes!("../../outputs/assets/porsche-992-gt3-r-lod.glb").as_slice(),
    );
    for (key, file) in crate::scene::DECOR_ASSETS {
        let name = PathBuf::from(format!("{key}.glb"));
        registry.insert_asset(name.clone(), &name, file);
    }
    registry.insert_asset(
        PathBuf::from("porsche-top.png"),
        Path::new("porsche-top.png"),
        include_bytes!("../../outputs/assets/porsche-992-gt3r-top-v1.png").as_slice(),
    );
    let prefs = Preferences::load();
    let is_smoke = smoke.is_some();
    let setup = if is_smoke {
        Setup::default()
    } else {
        prefs.setup()
    };
    let worker = start_worker(setup.clone(), smoke.is_some());
    app.insert_resource(worker)
        .insert_resource(Stored::new(prefs.clone(), !is_smoke))
        .insert_resource(Session {
            setup,
            mutation: 0.32,
            camera: if is_smoke {
                CameraMode::Follow
            } else {
                CameraMode::Overview
            },
            last_scene: if is_smoke {
                CameraMode::Follow
            } else {
                CameraMode::Overview
            },
            dark: !is_smoke && prefs.dark,
            zoom: 1.0,
            comparison_limit: 10,
            details: true,
            rays: true,
            atlas_quality: 18_000,
            atlas_zoom: 1.,
            atlas_density: 220,
            ..default()
        })
        .insert_resource(ClearColor(Color::srgb(0.64, 0.76, 0.85)))
        .init_resource::<comparison::Comparison>()
        .init_resource::<crate::menus::Overlay>()
        .add_systems(
            Startup,
            (
                scene::setup,
                dashboard::build,
                atlas::setup,
                crate::sky::prepare,
            ),
        )
        .add_systems(
            Update,
            (
                read_worker,
                controls,
                comparison::read,
                atlas::keyboard,
                advance,
                sample_atlas,
                sample_inspection,
                scene::setup_fleet,
                scene::view_input,
                scene::decorate,
                scene::update,
                crate::sky::camera,
                atlas::update,
                dashboard::refresh,
                crate::menus::refresh,
                dashboard::viewports,
                crate::menus::render,
                crate::menus::scroll,
                crate::preferences::store,
                crate::history::refresh,
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
    pub activity: Option<atlas::Activity>,
    pub atlas_preset: atlas::Preset,
    pub atlas_filter: atlas::Filter,
    pub atlas_quality: usize,
    pub atlas_density: u16,
    pub atlas_zoom: f32,
    pub atlas_query: String,
    pub atlas_typing: bool,
    pub atlas_selected: Option<usize>,
    pub atlas_focus: Option<usize>,
    pub atlas_notice: String,
    pub atlas_live: bool,
    pub atlas_frozen: bool,
    pub atlas_center: u64,
    activity_pending: bool,
    last_activity: Option<std::time::Instant>,
    pub frame: Option<Frame>,
    pub decoration: Option<crate::scenery::Layout>,
    pub running: bool,
    pub busy: bool,
    pub request: bool,
    pub revision: u64,
    pub camera: CameraMode,
    pub selected: Option<usize>,
    pub rays: bool,
    pub details: bool,
    pub boundaries: bool,
    pub menu: Option<Menu>,
    pub panels: u16,
    pub system_menu: bool,
    pub history_mode: crate::history::Metric,
    pub landmark: Option<usize>,
    pub camera_reset: u64,
    pub last_scene: CameraMode,
    pub inspection: Option<Inspection>,
    inspection_pending: bool,
    last_inspection: Option<std::time::Instant>,
    ray_selection: Option<usize>,
    pub page: Page,
    pub dark: bool,
    pub zoom: f32,
    pub mutation: f64,
    pub effective: f64,
    pub comparison_limit: u32,
    pub comparison_limit_edit: Option<String>,
    select_limit_on_input: bool,
    pub decoder: Option<Bundle>,
    pub smoke_action: Vec<Action>,
    sample: Option<(std::time::Instant, u64)>,
    total_ticks: u64,
    pub message: String,
    ticks_due: f64,
}

impl Session {
    pub fn find_neuron(&mut self) {
        self.atlas_typing = false;
        if let Ok(body) = self.atlas_query.parse() {
            self.atlas_selected = self.points.as_ref().and_then(|p| p.by_body(body));
            self.atlas_notice = if self.atlas_selected.is_some() {
                String::new()
            } else {
                format!("Body ID {body} senza coordinate in questo modello")
            };
        } else {
            self.atlas_notice = "Inserisci il Body ID del neurone".into();
        }
    }

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
    SampleActivity(usize, atlas::Filter, u16, Option<usize>),
    Inspect(usize),
    RaySelection(Option<usize>),
    Vehicle(usize, VehicleAction),
    Mutation(f64),
    Evolve,
    Save(f64),
    Load,
    ExportComparison(serde_json::Value),
    OpenDecoder,
    SaveRefinement(Bundle, Coefficients),
}

enum Update {
    Ready(Setup, Track, Frame, crate::atlas::Points, bool),
    Frame(Frame, u32),
    Activity(Option<atlas::Activity>),
    Inspection(Option<Inspection>),
    RaySelection(Option<Frame>),
    Vehicle(Frame, Inspection),
    Info(String),
    DialogError(String),
    Decoder(Bundle),
    Error(String),
}

#[derive(Resource)]
struct Worker {
    tx: Sender<Request>,
    rx: std::sync::Mutex<Receiver<Update>>,
}

fn start_worker(setup: Setup, smoke: bool) -> Worker {
    let (tx, requests) = mpsc::channel();
    let (responses, rx) = mpsc::channel();
    thread::Builder::new()
        .name("simulazione-male-cns".into())
        .stack_size(8 * 1024 * 1024)
        .spawn(move || {
            let mut engine = match Pool::new(smoke) {
                Ok(engine) => engine,
                Err(error) => {
                    let _ = responses.send(Update::Error(error.to_string()));
                    return;
                }
            };
            let mut next = Some(Request::Start(setup));
            while let Some(request) = next.take().or_else(|| requests.recv().ok()) {
                let result = match request {
                    Request::Start(setup) => engine.start(&setup).map(|(track, frame, atlas)| {
                        Update::Ready(setup, track, frame, atlas, true)
                    }),
                    Request::Tick(ticks) => engine.advance(ticks).map(|f| Update::Frame(f, ticks)),
                    Request::SampleActivity(car, filter, density, focus) => Ok(Update::Activity(
                        engine
                            .primary
                            .atlas_activity(car, filter, density, focus)
                            .ok(),
                    )),
                    Request::Inspect(car) => {
                        Ok(Update::Inspection(engine.primary.inspect(car).ok()))
                    }
                    Request::RaySelection(id) => Ok(Update::RaySelection(
                        engine
                            .primary
                            .ray_selection(id)
                            .and_then(|()| engine.primary.snapshot())
                            .map(|frame| engine.view(frame))
                            .ok(),
                    )),
                    Request::Vehicle(car, action) => {
                        engine.primary.vehicle(car, action).and_then(|frame| {
                            Ok(Update::Vehicle(
                                engine.view(frame),
                                engine.primary.inspect(car)?,
                            ))
                        })
                    }
                    Request::Mutation(value) => {
                        engine.mutation(value).map(|_| Update::Info(String::new()))
                    }
                    Request::Evolve => engine.evolve().map(|f| Update::Frame(f, 0)),
                    Request::Save(speed) => Ok(save_dialog(&engine, speed)
                        .unwrap_or_else(|e| Update::DialogError(e.to_string()))),
                    Request::Load => Ok(load_dialog(&mut engine)
                        .unwrap_or_else(|e| Update::DialogError(e.to_string()))),
                    Request::ExportComparison(report) => Ok(export_report(report)
                        .unwrap_or_else(|e| Update::DialogError(e.to_string()))),
                    Request::OpenDecoder => {
                        Ok(open_decoder().unwrap_or_else(|e| Update::DialogError(e.to_string())))
                    }
                    Request::SaveRefinement(bundle, parameters) => {
                        Ok(save_refinement(&bundle, parameters)
                            .unwrap_or_else(|e| Update::DialogError(e.to_string())))
                    }
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

fn save_dialog(engine: &Pool, speed: f64) -> crate::engine::Result<Update> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Progressi MAL-E", &["malecns-save"])
        .set_file_name("Circuit-Lab-5.7.1.malecns-save")
        .save_file()
    else {
        return Ok(Update::Info("Salvataggio annullato".into()));
    };
    let text = engine.save(speed)?;
    write_atomically(&path, &text)?;
    Ok(Update::Info("Progressi salvati".into()))
}

pub(crate) fn write_atomically(path: &Path, text: &str) -> std::io::Result<()> {
    write_bytes(path, text.as_bytes())
}

fn write_bytes(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    let result = file.write_all(bytes).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|_| fs::rename(&temporary, path)) {
        let _ = fs::remove_file(temporary);
        return Err(error);
    }
    Ok(())
}

fn export_report(report: serde_json::Value) -> crate::engine::Result<Update> {
    let Some(mut path) = rfd::FileDialog::new()
        .add_filter("Rapporto JSON", &["json"])
        .set_file_name("Circuit-Lab-5.7.1-confronto.json")
        .save_file()
    else {
        return Ok(Update::Info(
            "Esportazione annullata. Risultati conservati.".into(),
        ));
    };
    if path.extension().is_none() {
        path.set_extension("json");
    }
    write_atomically(&path, &serde_json::to_string_pretty(&report)?)?;
    Ok(Update::Info(
        "Rapporto salvato. Risultati conservati.".into(),
    ))
}

fn load_dialog(engine: &mut Pool) -> crate::engine::Result<Update> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Progressi MAL-E", &["malecns-save"])
        .pick_file()
    else {
        return Ok(Update::Info("Caricamento annullato".into()));
    };
    let mut text = String::new();
    fs::File::open(path)?
        .take(crate::save_file::MAX_BYTES as u64 + 1)
        .read_to_string(&mut text)?;
    let saved = engine.primary.decode_pool(&text)?;
    let description = format!(
        "{} · {} · {} worker. Le auto ripartiranno in pausa all’inizio della generazione salvata.",
        saved.model_id.to_uppercase(),
        saved.circuit_id,
        saved.count()
    );
    let confirm = rfd::MessageDialog::new()
        .set_title("Caricare e sostituire la prova?")
        .set_description(description)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();
    if confirm != rfd::MessageDialogResult::Yes {
        return Ok(Update::Info("Caricamento annullato".into()));
    }
    let (setup, track, frame, atlas) = engine.load_checked(saved)?;
    Ok(Update::Ready(setup, track, frame, atlas, false))
}

fn open_decoder() -> crate::engine::Result<Update> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Carica decoder V3")
        .add_filter("Decoder V3 compresso", &["gz"])
        .pick_file()
    else {
        return Ok(Update::Info("Caricamento decoder annullato".into()));
    };
    Ok(Update::Decoder(Bundle::load(&path)?))
}

fn save_refinement(bundle: &Bundle, parameters: Coefficients) -> crate::engine::Result<Update> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Decoder V3 compresso", &["gz"])
        .set_file_name(format!("V3-{}-affinato.json.gz", bundle.circuit))
        .save_file()
    else {
        return Ok(Update::Info("Salvataggio decoder annullato".into()));
    };
    write_bytes(&path, &bundle.encode(parameters)?)?;
    Ok(Update::Info("Decoder affinato salvato".into()))
}

fn read_worker(
    worker: Res<Worker>,
    mut session: ResMut<Session>,
    mut comparison: ResMut<comparison::Comparison>,
) {
    let responses = worker.rx.lock().expect("Coda della simulazione");
    while let Ok(message) = responses.try_recv() {
        if let Update::Activity(values) = message {
            session.activity_pending = false;
            if !session.atlas_frozen {
                session.activity = values;
            }
            continue;
        }
        let message = match message {
            Update::Inspection(data) => {
                session.inspection_pending = false;
                session.inspection = data;
                continue;
            }
            Update::RaySelection(frame) => {
                if let Some(frame) = frame {
                    session.frame = Some(frame);
                }
                continue;
            }
            message => message,
        };
        if matches!(message, Update::Frame(_, ticks) if ticks > 0) {
            session.request = false;
        } else {
            session.busy = false;
        }
        match message {
            Update::Ready(setup, mut track, frame, points, allow_run) => {
                let first = session.track.is_none();
                session.points = Some(points);
                session.activity = None;
                session.atlas_selected = None;
                session.atlas_focus = None;
                session.atlas_typing = false;
                session.atlas_notice.clear();
                session.inspection = None;
                session.last_inspection = None;
                session.ray_selection = None;
                session.landmark = None;
                session.camera_reset += 1;
                session.last_activity = None;
                session.effective = 0.0;
                session.total_ticks = 0;
                session.sample = None;
                session.mutation = setup.mutation;
                session.decoration = match crate::scenery::layout(&setup.circuit) {
                    Ok(mut layout) => {
                        track.landmarks.append(&mut layout.landmarks);
                        Some(layout)
                    }
                    Err(error) => {
                        warn!("Dettagli del circuito non caricati: {error}");
                        None
                    }
                };
                session.setup = setup;
                session.track = Some(track);
                session.frame = Some(frame);
                session.running = allow_run && (first || session.running);
                session.selected = None;
                session.ticks_due = 0.0;
                session.revision += 1;
                session.message.clear();
            }
            Update::Vehicle(frame, data) => {
                session.frame = Some(frame);
                session.inspection = Some(data);
                session.message.clear();
            }
            Update::Frame(frame, ticks) => {
                if frame.stopped {
                    session.running = false;
                    session.message = "Prova conclusa".into();
                }
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
            Update::Info(info) | Update::DialogError(info) => session.message = info,
            Update::Decoder(bundle) => {
                session.message = format!("Decoder V3 caricato · {}", bundle.name);
                session.decoder = Some(bundle);
                comparison.refinement = None;
            }
            Update::Error(error) => {
                session.running = false;
                session.request = false;
                session.message = error;
            }
            Update::Activity(_) | Update::Inspection(_) | Update::RaySelection(_) => {
                unreachable!()
            }
        }
    }
}

fn advance(
    time: Res<Time<Real>>,
    comparison: Res<comparison::Comparison>,
    worker: Res<Worker>,
    mut session: ResMut<Session>,
) {
    if comparison.running || !session.running || session.busy || session.frame.is_none() {
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

fn sample_atlas(
    worker: Res<Worker>,
    comparison: Res<comparison::Comparison>,
    mut session: ResMut<Session>,
) {
    if comparison.running
        || !matches!(session.page, Page::Brain | Page::Split)
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
        .send(Request::SampleActivity(
            session.selected_car(),
            session.atlas_filter,
            session.atlas_density,
            session.atlas_selected,
        ))
        .is_ok();
    session.last_activity = Some(std::time::Instant::now());
}

fn sample_inspection(
    worker: Res<Worker>,
    comparison: Res<comparison::Comparison>,
    mut session: ResMut<Session>,
) {
    if comparison.running || session.frame.is_none() || session.busy {
        return;
    }
    if session.ray_selection != session.selected {
        if worker
            .tx
            .send(Request::RaySelection(session.selected))
            .is_ok()
        {
            session.ray_selection = session.selected;
        }
    }
    if session.inspection_pending
        || !matches!(session.page, Page::Session | Page::Split)
        || session
            .last_inspection
            .is_some_and(|time| time.elapsed().as_millis() < 200)
    {
        return;
    }
    session.inspection_pending = worker
        .tx
        .send(Request::Inspect(session.selected_car()))
        .is_ok();
    session.last_inspection = Some(std::time::Instant::now());
}

#[derive(Component, Copy, Clone, PartialEq, Eq)]
pub enum Action {
    Run,
    Menu(Menu),
    CloseMenu,
    ToggleSystemMenu,
    Fullscreen,
    InterfaceZoom(i8),
    Quit,
    HistoryMetric(crate::history::Metric),
    TogglePanel(Panel),
    SetCircuit(u8),
    SetModel(u8),
    SetDriver(Driver),
    SetPopulation(u8),
    SetSpeed(u8),
    SetMutation(u8),
    Camera,
    SetCamera(CameraMode),
    Landmark(Option<usize>),
    Agent(Option<usize>),
    Closeup,
    Vehicle(VehicleAction),
    Details,
    Boundaries,
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
    AtlasColor(bool),
    AtlasFreeze,
    AtlasCenter,
    AtlasPreset(atlas::Preset),
    AtlasFilter(atlas::Filter),
    AtlasQuality(usize),
    AtlasDensity(u16),
    AtlasZoom(bool),
    AtlasEnter,
    AtlasFind,
    AtlasFocus,
    Compare,
    StopComparison,
    ExportComparison,
    OpenDecoder,
    TestDecoder(bool),
    SaveRefinement,
    LimitDown,
    LimitUp,
    LimitEnter,
}

impl Action {
    pub fn enabled(self, session: &Session, trial: &comparison::Comparison) -> bool {
        match self {
            Self::Evolve | Self::Save => {
                session.setup.driver == Driver::Connectome && !trial.running
            }
            Self::Compare
            | Self::OpenDecoder
            | Self::TestDecoder(_)
            | Self::LimitEnter
            | Self::LimitUp
            | Self::LimitDown => !trial.running,
            Self::StopComparison => trial.running,
            _ => true,
        }
    }
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
    mut key_events: MessageReader<bevy::input::keyboard::KeyboardInput>,
    buttons: Query<(&Interaction, &Action), Changed<Interaction>>,
    worker: Res<Worker>,
    mut session: ResMut<Session>,
    mut compare: ResMut<comparison::Comparison>,
    mut input: ParamSet<(
        crate::dashboard::SliderInput,
        Query<&mut Window, With<bevy::window::PrimaryWindow>>,
    )>,

    mut pending_population: Local<Option<Action>>,
    mut ui_scale: ResMut<UiScale>,
    mut exit: MessageWriter<AppExit>,
) {
    let editing = session.comparison_limit_edit.is_some() || session.atlas_typing;
    for event in key_events.read() {
        if event.state != bevy::input::ButtonState::Pressed
            || session.comparison_limit_edit.is_none()
        {
            continue;
        }
        match event.key_code {
            KeyCode::Escape => session.comparison_limit_edit = None,
            KeyCode::Enter | KeyCode::NumpadEnter => {
                if let Err(error) = commit_limit(&mut session) {
                    session.message = error.into();
                }
            }
            key => {
                let digit = digit_key(key);
                let backspace = key == KeyCode::Backspace;
                if digit.is_none() && !backspace {
                    continue;
                }
                let replace = std::mem::take(&mut session.select_limit_on_input);
                let edit = session.comparison_limit_edit.as_mut().unwrap();
                if replace {
                    edit.clear();
                }
                if backspace {
                    edit.pop();
                }
                if let Some(digit) = digit.filter(|_| edit.len() < 4) {
                    edit.push(digit);
                }
            }
        }
    }
    let actions = buttons
        .iter()
        .filter_map(|(i, a)| (*i == Interaction::Pressed).then_some(*a))
        .chain(
            [
                (KeyCode::Space, Action::Run),
                (KeyCode::KeyC, Action::Camera),
                (KeyCode::Tab, Action::Select),
                (KeyCode::KeyR, Action::Rays),
                (KeyCode::AltLeft, Action::ToggleSystemMenu),
                (KeyCode::AltRight, Action::ToggleSystemMenu),
                (KeyCode::F11, Action::Fullscreen),
            ]
            .into_iter()
            .filter_map(|(key, a)| (!editing && keys.just_pressed(key)).then_some(a)),
        );
    let actions = actions.chain(input.p0().action(&mut pending_population));
    if keys.just_pressed(KeyCode::Escape) {
        if session.menu.is_some() {
            session.menu = None;
        } else if !session.atlas_typing && matches!(session.page, Page::Brain | Page::Split) {
            session.atlas_selected = None;
        }
    }
    let actions = actions.chain(std::mem::take(&mut session.smoke_action));
    for action in actions {
        if !action.enabled(&session, &compare) {
            continue;
        }
        match action {
            Action::Menu(menu) => {
                session.menu = if session.menu == Some(menu) {
                    None
                } else {
                    Some(menu)
                };
                continue;
            }
            Action::CloseMenu => {
                session.menu = None;
                continue;
            }
            _ => session.menu = None,
        }
        match action {
            Action::ToggleSystemMenu => {
                session.system_menu = !session.system_menu;
                continue;
            }
            Action::Fullscreen => {
                if let Ok(mut window) = input.p1().single_mut() {
                    use bevy::window::{MonitorSelection, WindowMode};
                    window.mode = if window.mode == WindowMode::Windowed {
                        WindowMode::BorderlessFullscreen(MonitorSelection::Current)
                    } else {
                        WindowMode::Windowed
                    };
                }
                continue;
            }
            Action::InterfaceZoom(direction) => {
                ui_scale.0 = if direction == 0 {
                    1.
                } else {
                    (ui_scale.0 + f32::from(direction) * 0.1).clamp(0.7, 1.5)
                };
                continue;
            }
            Action::Quit => {
                exit.write(AppExit::Success);
                continue;
            }
            Action::HistoryMetric(metric) => {
                session.history_mode = metric;
                continue;
            }
            Action::TogglePanel(panel) => {
                session.panels ^= panel.mask();
                continue;
            }
            Action::Theme => {
                session.dark = !session.dark;
                continue;
            }
            Action::Page(page) => {
                if page != Page::Compare {
                    session.comparison_limit_edit = None;
                }
                session.page = page;
                continue;
            }
            Action::StopComparison => {
                compare.stop();
                continue;
            }
            Action::AtlasColor(activity) => {
                session.atlas_live = activity;
                continue;
            }
            Action::AtlasFreeze => {
                session.atlas_frozen = !session.atlas_frozen;
                continue;
            }
            Action::AtlasCenter => {
                session.atlas_center += 1;
                session.atlas_focus = None;
                session.atlas_zoom = 1.;
                continue;
            }
            Action::AtlasPreset(preset) => {
                session.atlas_preset = preset;
                session.atlas_center += 1;
                continue;
            }
            Action::AtlasFilter(filter) => {
                session.atlas_filter = filter;
                session.last_activity = None;
                continue;
            }
            Action::AtlasQuality(quality) => {
                session.atlas_quality = quality;
                continue;
            }
            Action::AtlasDensity(density) => {
                session.atlas_density = density;
                continue;
            }
            Action::AtlasZoom(increase) => {
                session.atlas_zoom =
                    (session.atlas_zoom * if increase { 1.2 } else { 1. / 1.2 }).clamp(0.3, 5.);
                continue;
            }
            Action::AtlasEnter => {
                session.atlas_typing = true;
                continue;
            }
            Action::AtlasFind => {
                session.find_neuron();
                continue;
            }
            Action::AtlasFocus => {
                if let Some(index) = session.atlas_selected {
                    session.atlas_focus = Some(index);
                    session.atlas_zoom = 2.0;
                    session.atlas_center += 1;
                }
                continue;
            }
            _ => {}
        }
        if session.track.is_none() {
            continue;
        }
        if compare.running
            && matches!(
                action,
                Action::Run
                    | Action::SetCircuit(_)
                    | Action::SetModel(_)
                    | Action::SetPopulation(_)
                    | Action::SetDriver(_)
                    | Action::SetSpeed(_)
                    | Action::SetMutation(_)
                    | Action::Reset
                    | Action::Evolve
                    | Action::Save
                    | Action::Load
                    | Action::Vehicle(_)
                    | Action::OpenDecoder
                    | Action::SaveRefinement
                    | Action::ExportComparison
            )
        {
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
            Action::Camera | Action::SetCamera(_) => {
                session.camera = if let Action::SetCamera(camera) = action {
                    camera
                } else {
                    next(
                        [
                            CameraMode::Overview,
                            CameraMode::Follow,
                            CameraMode::Cockpit,
                        ],
                        session.camera,
                    )
                };
                session.last_scene = session.camera;
                session.landmark = None;
                session.zoom = 1.0;
                session.camera_reset += 1;
                continue;
            }
            Action::Map | Action::Scene => {
                if action == Action::Map && session.camera != CameraMode::Map {
                    session.last_scene = session.camera;
                    session.camera = CameraMode::Map;
                } else if action == Action::Scene && session.camera == CameraMode::Map {
                    session.camera = session.last_scene;
                }
                session.landmark = None;
                session.zoom = 1.0;
                session.camera_reset += 1;
                continue;
            }
            Action::Center | Action::Landmark(_) => {
                session.landmark = match action {
                    Action::Landmark(index) => index,
                    _ => None,
                };
                if session.camera != CameraMode::Map && session.camera != CameraMode::Cockpit
                    || session.landmark.is_some() && session.camera != CameraMode::Map
                {
                    session.camera = CameraMode::Overview;
                }
                session.zoom = 1.0;
                session.camera_reset += 1;
                continue;
            }
            Action::Closeup => {
                if !matches!(session.page, Page::Session | Page::Split) {
                    session.page = Page::Session;
                }
                session.camera = CameraMode::Follow;
                session.landmark = None;
                session.zoom = 1.65;
                session.camera_reset += 1;
                continue;
            }
            Action::Agent(id) => {
                session.selected = id.filter(|i| {
                    session
                        .frame
                        .as_ref()
                        .is_some_and(|frame| *i < frame.cars.len())
                });
                session.last_inspection = None;
                continue;
            }
            Action::Details => {
                session.details = !session.details;
                continue;
            }
            Action::Boundaries => {
                session.boundaries = !session.boundaries;
                continue;
            }
            Action::Vehicle(command) => Request::Vehicle(session.selected_car(), command),
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
                if count != 0 {
                    let current = session.selected_car();
                    let offset = if action == Action::Previous {
                        count - 1
                    } else {
                        1
                    };
                    session.selected = Some((current + offset) % count);
                }
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
            Action::LimitEnter => {
                if session.comparison_limit_edit.is_none() {
                    session.comparison_limit_edit = Some(session.comparison_limit.to_string());
                }
                session.select_limit_on_input = true;
                continue;
            }
            Action::LimitDown | Action::LimitUp => {
                if let Err(error) = commit_limit(&mut session) {
                    session.message = error.into();
                    continue;
                }
                session.comparison_limit = if action == Action::LimitUp {
                    (session.comparison_limit + 1).min(1440)
                } else {
                    session.comparison_limit.saturating_sub(1)
                };
                continue;
            }
            Action::Compare => {
                if !compare.running && !session.busy {
                    if let Err(error) = commit_limit(&mut session) {
                        session.message = error.into();
                        continue;
                    }
                    let before = session.running;
                    session.running = false;
                    compare.start(setup, session.comparison_limit, before);
                    if !compare.running {
                        session.running = before;
                    }
                }
                continue;
            }
            Action::SetCircuit(i) => {
                let Some(&circuit) = CIRCUITS.get(usize::from(i)) else {
                    continue;
                };
                if setup.circuit == circuit {
                    continue;
                }
                setup.circuit = circuit.into();
                Request::Start(setup)
            }
            Action::SetModel(i) => {
                let Some(&model) = MODELS.get(usize::from(i)) else {
                    continue;
                };
                if setup.model == model && setup.driver == Driver::Connectome {
                    continue;
                }
                setup.model = model.into();
                setup.driver = Driver::Connectome;
                Request::Start(setup)
            }
            Action::SetDriver(driver) => {
                setup.driver = driver;
                session.running = true;
                Request::Start(setup)
            }
            Action::SetPopulation(value) => {
                let value = u32::from(value.clamp(4, 100));
                if setup.population == value {
                    continue;
                }
                setup.population = value;
                Request::Start(setup)
            }
            Action::OpenDecoder => Request::OpenDecoder,
            Action::TestDecoder(refine) => {
                if let Err(error) = commit_limit(&mut session) {
                    session.message = error.into();
                    continue;
                }
                if !compare.running
                    && !session.busy
                    && let Some(bundle) = session.decoder.clone()
                {
                    let before = session.running;
                    session.running = false;
                    compare.start_decoder(bundle, session.comparison_limit, refine, before);
                    if !compare.running {
                        session.running = before;
                    }
                }
                continue;
            }
            Action::SaveRefinement => {
                let (Some(bundle), Some(coefficients)) =
                    (session.decoder.clone(), compare.refinement)
                else {
                    continue;
                };
                Request::SaveRefinement(bundle, coefficients)
            }
            Action::ExportComparison => {
                let Some(report) = compare.report() else {
                    continue;
                };
                Request::ExportComparison(report)
            }
            Action::Reset => Request::Start(setup),
            Action::Save => Request::Save(setup.speed),
            Action::Load => Request::Load,
            Action::Evolve => Request::Evolve,
            _ => continue,
        };
        if !session.busy && !compare.running {
            session.busy = worker.tx.send(request).is_ok();
            session.message = "Operazione in corso…".into();
        }
    }
}

fn commit_limit(session: &mut Session) -> std::result::Result<(), &'static str> {
    if let Some(edit) = &session.comparison_limit_edit {
        session.comparison_limit = edit
            .parse::<u32>()
            .ok()
            .filter(|value| *value <= 1440)
            .ok_or("Inserisci un numero intero tra 0 e 1440 minuti.")?;
        session.comparison_limit_edit = None;
        session.message.clear();
    }
    Ok(())
}

pub(crate) fn digit_key(key: KeyCode) -> Option<char> {
    Some(match key {
        KeyCode::Digit0 | KeyCode::Numpad0 => '0',
        KeyCode::Digit1 | KeyCode::Numpad1 => '1',
        KeyCode::Digit2 | KeyCode::Numpad2 => '2',
        KeyCode::Digit3 | KeyCode::Numpad3 => '3',
        KeyCode::Digit4 | KeyCode::Numpad4 => '4',
        KeyCode::Digit5 | KeyCode::Numpad5 => '5',
        KeyCode::Digit6 | KeyCode::Numpad6 => '6',
        KeyCode::Digit7 | KeyCode::Numpad7 => '7',
        KeyCode::Digit8 | KeyCode::Numpad8 => '8',
        KeyCode::Digit9 | KeyCode::Numpad9 => '9',
        _ => return None,
    })
}
