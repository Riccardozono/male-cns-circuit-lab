use crate::{
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
const SPEEDS: [f64; 8] = [0.5, 1.0, 2.0, 5.0, 10.0, 15.0, 20.0, 30.0];

pub fn run(smoke: Option<PathBuf>) -> AppExit {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "MAL-E CNS Circuit Lab · Rust nativo".into(),
            resolution: (1320, 800).into(),
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
    let setup = Setup::default();
    let worker = start_worker(setup.clone());
    app.insert_resource(worker)
        .insert_resource(Session { setup, ..default() })
        .insert_resource(ClearColor(Color::srgb(0.64, 0.76, 0.85)))
        .add_systems(Startup, (scene::setup, build_ui))
        .add_systems(
            Update,
            (read_worker, controls, advance, scene::update, ui_text).chain(),
        );
    if let Some(path) = smoke {
        app.insert_resource(scene::Smoke::new(path))
            .add_systems(Update, scene::verify_window.after(scene::update));
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
    fn label(self) -> &'static str {
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
    pub frame: Option<Frame>,
    pub running: bool,
    pub busy: bool,
    pub request: bool,
    pub revision: u64,
    pub camera: CameraMode,
    pub selected: Option<usize>,
    pub rays: bool,
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
    Save(f64),
    Load,
}

enum Update {
    Ready(Setup, Track, Frame),
    Frame(Frame),
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
                    Request::Start(setup) => engine
                        .start(&setup)
                        .map(|(track, frame)| Update::Ready(setup, track, frame)),
                    Request::Tick(ticks) => engine.advance(ticks).map(Update::Frame),
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
    Ok(Update::Ready(setup, track, frame))
}

fn read_worker(worker: Res<Worker>, mut session: ResMut<Session>) {
    let responses = worker.rx.lock().expect("Coda della simulazione");
    while let Ok(message) = responses.try_recv() {
        session.busy = false;
        session.request = false;
        match message {
            Update::Ready(setup, track, frame) => {
                session.setup = setup;
                session.track = Some(track);
                session.frame = Some(frame);
                session.running = false;
                session.selected = None;
                session.ticks_due = 0.0;
                session.revision += 1;
                session.message.clear();
            }
            Update::Frame(frame) => session.frame = Some(frame),
            Update::Info(info) => session.message = info,
            Update::Error(error) => {
                session.running = false;
                session.message = error;
            }
        }
    }
}

fn advance(time: Res<Time>, worker: Res<Worker>, mut session: ResMut<Session>) {
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

#[derive(Component, Copy, Clone)]
enum Action {
    Run,
    Circuit,
    Model,
    Population,
    Speed,
    Camera,
    Select,
    Rays,
    Save,
    Load,
    Reset,
}

#[derive(Component)]
struct Label(Action);

#[derive(Component)]
struct Telemetry;

const BUTTON: Color = Color::srgb(0.10, 0.18, 0.25);
const WHITE: Color = Color::srgb(0.88, 0.94, 0.98);

fn build_ui(mut commands: Commands, mut fonts: ResMut<Assets<Font>>) {
    let font = fonts.add(
        Font::try_from_bytes(
            include_bytes!("../../outputs/assets/fonts/Sintony-Bold.ttf").to_vec(),
        )
        .expect("Font di interfaccia integrato"),
    );
    let text_font = |font_size| TextFont {
        font: font.clone().into(),
        font_size,
        ..default()
    };
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(18),
                top: px(18),
                width: px(288),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(px(16)),
                row_gap: px(7),
                ..default()
            },
            BackgroundColor(Color::srgba(0.025, 0.061, 0.101, 0.96)),
        ))
        .with_children(|panel| {
            panel.spawn((Text::new("MAL-E CNS"), text_font(24.0), TextColor(WHITE)));
            panel.spawn((
                Text::new("Circuit Lab · Anteprima nativa"),
                text_font(13.0),
                TextColor(Color::srgb(0.51, 0.73, 0.80)),
            ));
            for (action, text) in [
                (Action::Run, "Avvia · Spazio"),
                (Action::Circuit, "Circuito"),
                (Action::Model, "Controller"),
                (Action::Population, "Auto"),
                (Action::Speed, "Velocità"),
                (Action::Camera, "Camera"),
                (Action::Select, "Selezione auto"),
                (Action::Rays, "Sensori"),
                (Action::Save, "Salva progressi"),
                (Action::Load, "Carica progressi"),
                (Action::Reset, "Nuova sessione"),
            ] {
                panel
                    .spawn((
                        Button,
                        action,
                        Node {
                            min_height: px(30),
                            align_items: AlignItems::Center,
                            padding: UiRect::horizontal(px(10)),
                            ..default()
                        },
                        BackgroundColor(BUTTON),
                    ))
                    .with_children(|button| {
                        button.spawn((
                            Text::new(text),
                            text_font(14.0),
                            TextColor(WHITE),
                            Label(action),
                        ));
                    });
            }
            panel.spawn((
                Text::new("Caricamento del connettoma…"),
                text_font(14.0),
                TextColor(WHITE),
                Telemetry,
            ));
        });
}

fn next<T: PartialEq + Copy, const N: usize>(choices: [T; N], current: T) -> T {
    choices
        .iter()
        .position(|choice| *choice == current)
        .map_or(choices[0], |index| choices[(index + 1) % N])
}

fn controls(
    keys: Res<ButtonInput<KeyCode>>,
    mut buttons: Query<(&Interaction, &Action, &mut BackgroundColor), Changed<Interaction>>,
    worker: Res<Worker>,
    mut session: ResMut<Session>,
) {
    let mut actions = Vec::new();
    for (interaction, action, mut color) in &mut buttons {
        color.0 = if *interaction == Interaction::None {
            BUTTON
        } else {
            Color::srgb(0.14, 0.32, 0.40)
        };
        if *interaction == Interaction::Pressed {
            actions.push(*action);
        }
    }
    for (key, action) in [
        (KeyCode::Space, Action::Run),
        (KeyCode::KeyC, Action::Camera),
        (KeyCode::Tab, Action::Select),
        (KeyCode::KeyR, Action::Rays),
    ] {
        if keys.just_pressed(key) {
            actions.push(action);
        }
    }
    for action in actions {
        if session.busy || session.track.is_none() {
            return;
        }
        let mut setup = session.setup.clone();
        let request = match action {
            Action::Run => {
                session.running = !session.running;
                session.ticks_due = 0.0;
                continue;
            }
            Action::Camera => {
                session.camera = next(
                    [
                        CameraMode::Overview,
                        CameraMode::Follow,
                        CameraMode::Cockpit,
                        CameraMode::Map,
                    ],
                    session.camera,
                );
                continue;
            }
            Action::Select => {
                let count = session.frame.as_ref().map_or(0, |f| f.cars.len());
                session.selected = match session.selected {
                    None if count > 0 => Some(0),
                    Some(i) if i + 1 < count => Some(i + 1),
                    _ => None,
                };
                continue;
            }
            Action::Rays => {
                session.rays = !session.rays;
                continue;
            }
            Action::Speed => {
                session.setup.speed = next(SPEEDS, setup.speed);
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
        };
        session.running = false;
        session.busy = worker.tx.send(request).is_ok();
        session.message = "Operazione in corso…".into();
    }
}

fn ui_text(
    session: Res<Session>,
    mut labels: Query<(&Label, &mut Text), Without<Telemetry>>,
    mut telemetry: Query<&mut Text, With<Telemetry>>,
) {
    if !session.is_changed() {
        return;
    }
    for (label, mut text) in &mut labels {
        let line = match label.0 {
            Action::Run => if session.running {
                "Pausa · Spazio"
            } else {
                "Avvia · Spazio"
            }
            .into(),
            Action::Circuit => format!(
                "Circuito   {}",
                session
                    .track
                    .as_ref()
                    .map_or("…", |track| track.label.as_str())
            ),
            Action::Model => format!("MaleCNS   {} · CPU", session.setup.model.to_uppercase()),
            Action::Population => format!("Popolazione   {}", session.setup.population),
            Action::Speed => format!("Velocità richiesta   {}×", session.setup.speed),
            Action::Camera => format!("Camera   {} · C", session.camera.label()),
            Action::Select => match session.selected {
                Some(i) => format!("Auto   A-{:02} · Tab", i + 1),
                None => "Auto   migliore · Tab".into(),
            },
            Action::Rays => format!(
                "Raggi del leader   {} · R",
                if session.rays { "sì" } else { "no" }
            ),
            _ => continue,
        };
        if text.0 != line {
            text.0 = line;
        }
    }
    let line = if let Some(frame) = &session.frame {
        let i = session.selected_car();
        let car = &frame.cars[i];
        format!(
            "GEN {:02}  ·  {:05.1} s  ·  {}/{} attive\nA-{:02}  ·  {:5.1} km/h  ·  M{}\n{:4.0} rpm  ·  giri {}/2  ·  {:.0} m\nGas {:.2}  ·  freno {:.2}\n{} neuroni · {} connessioni\n{}",
            frame.generation,
            frame.elapsed,
            frame.cars.iter().filter(|c| c.alive).count(),
            frame.cars.len(),
            i + 1,
            car.speed * 3.6,
            car.gear,
            car.rpm,
            car.laps,
            car.progress,
            car.outputs[1],
            car.outputs[2],
            frame.neurons,
            frame.edges,
            session.message,
        )
    } else if session.message.is_empty() {
        "Caricamento del connettoma…".into()
    } else {
        session.message.clone()
    };
    for mut text in &mut telemetry {
        if text.0 != line {
            text.0 = line.clone();
        }
    }
}
