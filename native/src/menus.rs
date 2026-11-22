use crate::{
    dashboard::{DashboardFont, Ink, Surface, button, text},
    engine::{Driver, VehicleAction},
    window::{Action, CIRCUITS, CameraMode, MODELS, Session},
};
use bevy::{
    input::mouse::AccumulatedMouseScroll,
    prelude::*,
    ui::{FocusPolicy, RelativeCursorPosition},
    window::PrimaryWindow,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Menu {
    Circuit,
    Driver,
    Camera,
    Landmark,
    Agent,
    Gearbox,
    BrainPreset,
    BrainFilter,
    BrainColor,
    BrainQuality,
    File,
    View,
    Window,
    Help,
    History,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Panel {
    Compatibility,
    Advanced,
    View,
    Experiment,
    Sources,
    History,
    Telemetry,
    Models,
    Atlas,
}

impl Panel {
    pub fn mask(self) -> u16 {
        1 << (self as u16)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Compatibility => "Formato e compatibilità",
            Self::Advanced => "Controlli e regole avanzati",
            Self::View => "Vista, dimensioni e crediti",
            Self::Experiment => "Dettagli dell’esperimento e del circuito",
            Self::Sources => "Dati e limiti del modello",
            Self::History => "Andamento e confronto della popolazione",
            Self::Telemetry => "Telemetria, ricompense e meccanica",
            Self::Models => "Differenze V2 · V3 · V4 · V5",
            Self::Atlas => "Ricerca e qualità della vista",
        }
    }
}

const CIRCUIT_NAMES: [&str; 4] = ["Monza", "Monaco", "Le Mans", "Circuito laboratorio"];
const MODEL_NAMES: [&str; 4] = [
    "MaleCNS V2 compatto",
    "MaleCNS V3 storico",
    "MaleCNS V4 completo",
    "MaleCNS V5 esteso",
];

#[derive(Resource, Default)]
pub(crate) struct Overlay {
    open: Option<Menu>,
    entity: Option<Entity>,
}

#[derive(Component)]
pub(crate) struct ScrollArea;

#[derive(Component)]
pub(crate) struct Dismiss;

fn model_label(s: &Session) -> &str {
    match s.setup.driver {
        Driver::Off => "Test: cervello spento",
        Driver::Straight => "Test: sterzo zero",
        Driver::Connectome => MODELS
            .iter()
            .position(|&m| m == s.setup.model)
            .map_or("MaleCNS", |i| MODEL_NAMES[i]),
    }
}

impl Menu {
    pub fn current(self, s: &Session) -> String {
        match self {
            Self::Circuit => s.track.as_ref().map_or("Caricamento…", |t| &t.label).into(),
            Self::Driver => model_label(s).into(),
            Self::Camera => if s.camera == CameraMode::Map {
                s.last_scene.label()
            } else {
                s.camera.label()
            }
            .into(),
            Self::Landmark => s
                .landmark
                .and_then(|i| s.track.as_ref()?.landmarks.get(i))
                .map_or("Intero circuito", |p| p.label.as_str())
                .into(),
            Self::Agent => format!("Auto A-{:02}", s.selected_car() + 1),
            Self::Gearbox => if s
                .inspection
                .as_ref()
                .is_some_and(|d| d.car == s.selected_car() && d.gear_manual)
            {
                "Sequenziale manuale"
            } else {
                "Sequenziale automatico"
            }
            .into(),
            Self::BrainPreset => s.atlas_preset.label().into(),
            Self::BrainFilter => s.atlas_filter.label().into(),
            Self::BrainColor => if s.atlas_live {
                "Intensità dell’attività"
            } else {
                "Classe annotata"
            }
            .into(),
            Self::BrainQuality => format!("{} punti", s.atlas_quality),
            Self::File => "File".into(),
            Self::View => "Visualizza".into(),
            Self::Window => "Finestra".into(),
            Self::Help => "Aiuto".into(),
            Self::History => s.history_mode.label().into(),
        }
    }

    fn choices(self, s: &Session) -> Vec<(String, Action)> {
        match self {
            Self::Circuit => CIRCUIT_NAMES
                .iter()
                .take(CIRCUITS.len())
                .enumerate()
                .map(|(i, name)| ((*name).into(), Action::SetCircuit(i as u8)))
                .collect(),
            Self::Driver => MODEL_NAMES
                .iter()
                .enumerate()
                .map(|(i, name)| ((*name).into(), Action::SetModel(i as u8)))
                .chain([
                    (
                        "Test: cervello spento".into(),
                        Action::SetDriver(Driver::Off),
                    ),
                    (
                        "Test: sterzo zero".into(),
                        Action::SetDriver(Driver::Straight),
                    ),
                ])
                .collect(),
            Self::Camera => [
                CameraMode::Overview,
                CameraMode::Follow,
                CameraMode::Cockpit,
            ]
            .into_iter()
            .map(|choice| (choice.label().into(), Action::SetCamera(choice)))
            .collect(),
            Self::Landmark => std::iter::once(("Intero circuito".into(), Action::Landmark(None)))
                .chain(
                    s.track
                        .iter()
                        .flat_map(|t| t.landmarks.iter().enumerate())
                        .filter(|(_, p)| !p.scene_only || s.camera != CameraMode::Map)
                        .map(|(i, p)| (p.label.clone(), Action::Landmark(Some(i)))),
                )
                .collect(),
            Self::Agent => {
                std::iter::once(("Auto migliore (automatica)".into(), Action::Agent(None)))
                    .chain(
                        s.frame
                            .iter()
                            .flat_map(|f| f.cars.iter().enumerate())
                            .map(|(i, _)| (format!("Auto A-{:02}", i + 1), Action::Agent(Some(i)))),
                    )
                    .collect()
            }
            Self::Gearbox => [
                (
                    "Sequenziale automatico".into(),
                    Action::Vehicle(VehicleAction::GearMode(false)),
                ),
                (
                    "Sequenziale manuale".into(),
                    Action::Vehicle(VehicleAction::GearMode(true)),
                ),
            ]
            .into(),
            Self::BrainPreset => crate::atlas::Preset::ALL
                .into_iter()
                .map(|preset| (preset.label().into(), Action::AtlasPreset(preset)))
                .collect(),
            Self::BrainFilter => crate::atlas::Filter::ALL
                .into_iter()
                .map(|filter| (filter.label().into(), Action::AtlasFilter(filter)))
                .collect(),
            Self::BrainColor => vec![
                ("Classe annotata".into(), Action::AtlasColor(false)),
                ("Intensità dell’attività".into(), Action::AtlasColor(true)),
            ],
            Self::BrainQuality => [
                (6000, "Leggera"),
                (18000, "Bilanciata"),
                (24000, "Dettagliata"),
            ]
            .into_iter()
            .map(|(count, label)| {
                (
                    format!("{label} · {count} punti"),
                    Action::AtlasQuality(count),
                )
            })
            .collect(),
            Self::File => [
                ("Salva file…".into(), Action::Save),
                ("Carica file…".into(), Action::Load),
                ("Esporta confronto…".into(), Action::ExportComparison),
                ("Esci".into(), Action::Quit),
            ]
            .into(),
            Self::View => [
                (
                    "Sessione".into(),
                    Action::Page(crate::window::Page::Session),
                ),
                (
                    "Confronto modelli".into(),
                    Action::Page(crate::window::Page::Compare),
                ),
                (
                    "Cervello 3D".into(),
                    Action::Page(crate::window::Page::Brain),
                ),
                (
                    "Affiancati".into(),
                    Action::Page(crate::window::Page::Split),
                ),
                ("Cambia tema".into(), Action::Theme),
            ]
            .into(),
            Self::Window => [
                ("Schermo intero · F11".into(), Action::Fullscreen),
                ("Ingrandisci interfaccia".into(), Action::InterfaceZoom(1)),
                ("Riduci interfaccia".into(), Action::InterfaceZoom(-1)),
                ("Ripristina scala".into(), Action::InterfaceZoom(0)),
            ]
            .into(),
            Self::Help => [
                (
                    "Dati e limiti del modello".into(),
                    Action::TogglePanel(Panel::Sources),
                ),
                (
                    "Formato salvataggi".into(),
                    Action::TogglePanel(Panel::Compatibility),
                ),
                ("Vista e crediti".into(), Action::TogglePanel(Panel::View)),
            ]
            .into(),
            Self::History => crate::history::Metric::ALL
                .into_iter()
                .map(|metric| (metric.label().into(), Action::HistoryMetric(metric)))
                .collect(),
        }
    }
}

pub fn render(
    mut commands: Commands,
    s: Res<Session>,
    mut state: ResMut<Overlay>,
    font: Res<DashboardFont>,
    scale: Res<UiScale>,
    window: Query<&Window, With<PrimaryWindow>>,
    triggers: Query<(&Action, &ComputedNode, &UiGlobalTransform)>,
) {
    if state.open == s.menu {
        return;
    }
    if let Some(entity) = state.entity.take() {
        commands.entity(entity).despawn();
    }
    state.open = None;
    let (Some(menu), Ok(window)) = (s.menu, window.single()) else {
        return;
    };
    let Some((_, node, at)) = triggers
        .iter()
        .find(|(a, n, _)| **a == Action::Menu(menu) && n.size().min_element() > 1.)
    else {
        return;
    };
    let choices = menu.choices(&s);
    if choices.is_empty() {
        return;
    }
    let physical = window.scale_factor() * scale.0;
    let screen = Vec2::new(window.width(), window.height()) / scale.0;
    let size = node.size() / physical;
    let at = at.translation / physical;
    let width = size
        .x
        .max(if menu == Menu::Landmark { 310.0 } else { 240.0 })
        .min(screen.x - 12.0);
    let height = (choices.len() as f32 * 35.0 + 10.0).min(322.0);
    let below = at.y + size.y / 2.0 + 4.0;
    let top = if screen.y - below >= height {
        below
    } else {
        (at.y - size.y / 2.0 - height - 4.0).max(6.0)
    };
    let left = (at.x - size.x / 2.0).clamp(6.0, screen.x - width - 6.0);
    let root = commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: px(0),
                left: px(0),
                width: percent(100),
                height: percent(100),
                ..default()
            },
            GlobalZIndex(150),
        ))
        .with_children(|p| {
            p.spawn((
                Node {
                    position_type: PositionType::Absolute,
                    width: percent(100),
                    height: percent(100),
                    ..default()
                },
                Interaction::None,
                FocusPolicy::Block,
                Dismiss,
                Action::CloseMenu,
            ));
            p.spawn((
                Node {
                    position_type: PositionType::Absolute,
                    left: px(left),
                    top: px(top),
                    width: px(width),
                    max_height: px(height),
                    flex_direction: FlexDirection::Column,
                    overflow: Overflow::scroll_y(),
                    padding: UiRect::all(px(4)),
                    border: UiRect::all(px(1)),
                    border_radius: BorderRadius::all(px(4)),
                    ..default()
                },
                RelativeCursorPosition::default(),
                ScrollArea,
                PopupScroll,
                FocusPolicy::Block,
                Surface::Panel,
                BackgroundColor(Color::WHITE),
                BorderColor::all(Color::srgb(0.74, 0.80, 0.88)),
            ))
            .with_children(|p| {
                for (label, action) in choices {
                    button(p, &font.0, action, &label, 0., 0.);
                }
            });
        })
        .id();
    state.entity = Some(root);
    state.open = Some(menu);
}

pub fn scroll(
    delta: Res<AccumulatedMouseScroll>,
    s: Res<Session>,
    mut query: Query<
        (
            &RelativeCursorPosition,
            &mut ScrollPosition,
            Has<PopupScroll>,
        ),
        With<ScrollArea>,
    >,
) {
    if delta.delta.y == 0. {
        return;
    }
    let pixels = match delta.unit {
        bevy::input::mouse::MouseScrollUnit::Line => delta.delta.y * 38.,
        bevy::input::mouse::MouseScrollUnit::Pixel => delta.delta.y,
    };
    for (cursor, mut scroll, popup) in &mut query {
        if cursor.cursor_over() && (popup || s.menu.is_none()) {
            scroll.0.y = (scroll.0.y - pixels).max(0.);
        }
    }
}

#[derive(Component)]
pub(crate) struct PopupScroll;

pub(crate) fn disclosure(
    parent: &mut ChildSpawnerCommands,
    font: &Handle<Font>,
    panel: Panel,
    build: impl FnOnce(&mut ChildSpawnerCommands),
) {
    button(
        parent,
        font,
        Action::TogglePanel(panel),
        panel.label(),
        0.,
        0.,
    );
    parent
        .spawn((
            Disclosure(panel),
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                row_gap: px(7),
                padding: UiRect::axes(px(8), px(6)),
                flex_shrink: 0.,
                ..default()
            },
        ))
        .with_children(build);
}

#[derive(Component)]
pub(crate) struct Disclosure(Panel);

pub(crate) fn refresh(s: Res<Session>, mut details: Query<(&Disclosure, &mut Node)>) {
    for (section, mut node) in &mut details {
        let display = if s.panels & section.0.mask() != 0 {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != display {
            node.display = display;
        }
    }
}

pub(crate) fn hint(parent: &mut ChildSpawnerCommands, font: &Handle<Font>, value: &str) {
    text(parent, font, value, 11., Ink::Muted, None);
}
