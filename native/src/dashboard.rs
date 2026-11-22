use crate::{
    atlas::BrainCamera,
    comparison::Comparison,
    engine::VehicleAction,
    menus::{self, Menu, Panel, ScrollArea},
    scene::CameraRig,
    window::{Action, CameraMode, Page, Session},
};
use bevy::{
    camera::Viewport,
    ecs::system::SystemParam,
    prelude::*,
    ui::{IsDefaultUiCamera, RelativeCursorPosition},
    window::PrimaryWindow,
};

const NAVY: Color = Color::srgb_u8(22, 43, 73);
const WHITE: Color = Color::srgb_u8(255, 255, 255);
const RED: Color = Color::srgb_u8(205, 33, 40);
#[derive(Resource)]
pub(crate) struct DashboardFont(pub Handle<Font>);

const TEAL: Color = Color::srgb_u8(6, 129, 137);

#[derive(Clone, Copy, Component)]
pub(crate) enum Surface {
    Panel,
    Header,
    Strip,
    Dark,
}
#[derive(Clone, Copy, Component)]
pub(crate) enum Ink {
    Normal,
    Muted,
    FixedWhite,
}
#[derive(Component)]
pub(crate) struct TrackCanvas;
#[derive(Component)]
pub(crate) struct AtlasCanvas;
#[derive(Component)]
pub(crate) enum Section {
    Stage,
    Track,
    Atlas,
    Summary,
    Comparison,
    SystemMenu,
    Decoder,
    Refined,
}
#[derive(Component)]
pub(crate) enum Field {
    Action(Action),
    Model,
    Track,
    Hud,
    Running,
    Generation,
    Laps,
    Lap,
    Time,
    Active,
    Rate,
    Past,
    Speed,
    Rpm,
    Gear,
    Pedal(usize),
    Mechanics,
    History(usize, usize),
    Empty,
    Dataset,
    ComparisonSettings,
    ComparisonInput,
    Trial(usize, usize),
    Points,
    Message,
    Setting(Meter),
    Inspection(Reading),
    CircuitDimensions,
    CircuitSource,
    CircuitDetails,
    Neuron,
    ChartSummary,
}
#[derive(Clone, Copy)]
pub(crate) enum Reading {
    State,
    Road,
    Tyres,
    Power,
    WheelLoads,
    Rewards,
    Ledger,
    Forces,
    Sensor(usize),
    Visual(usize),
}

#[derive(Component, Clone, Copy)]
pub(crate) enum Meter {
    Pedal(usize),
    Mutation,
    Speed,
    Population,
    AtlasDensity,
}

fn panel() -> Node {
    Node {
        flex_direction: FlexDirection::Column,
        border: UiRect::all(px(1)),
        border_radius: BorderRadius::all(px(6)),
        ..default()
    }
}
fn column() -> Node {
    Node {
        flex_direction: FlexDirection::Column,
        ..default()
    }
}
fn row() -> Node {
    Node {
        align_items: AlignItems::Center,
        ..default()
    }
}
pub(crate) fn text(
    parent: &mut ChildSpawnerCommands,
    font: &Handle<Font>,
    content: &str,
    size: f32,
    ink: Ink,
    field: Option<Field>,
) {
    let mut entity = parent.spawn((
        Text::new(content),
        TextFont {
            font: font.clone().into(),
            font_size: size,
            ..default()
        },
        TextColor(NAVY),
        ink,
    ));
    if let Some(field) = field {
        entity.insert(field);
    }
}
pub(crate) fn button(
    parent: &mut ChildSpawnerCommands,
    font: &Handle<Font>,
    action: Action,
    label: &str,
    min: f32,
    grow: f32,
) {
    parent
        .spawn((
            Button,
            action,
            Node {
                min_width: px(min),
                min_height: px(34),
                flex_shrink: 0.,
                flex_grow: grow,
                align_items: AlignItems::Center,
                justify_content: if matches!(action, Action::Menu(_)) {
                    JustifyContent::SpaceBetween
                } else {
                    JustifyContent::Center
                },
                padding: UiRect::horizontal(px(11)),
                border: UiRect::all(px(1)),
                border_radius: BorderRadius::all(px(4)),
                ..default()
            },
            BackgroundColor(WHITE),
            BorderColor::all(NAVY),
        ))
        .with_children(|p| {
            text(
                p,
                font,
                label,
                13.,
                Ink::Normal,
                Some(Field::Action(action)),
            );
            if matches!(action, Action::Menu(_)) {
                p.spawn((
                    Node {
                        width: px(6),
                        height: px(6),
                        margin: UiRect {
                            left: px(9),
                            ..default()
                        },
                        border: UiRect {
                            right: px(1.5),
                            bottom: px(1.5),
                            ..default()
                        },
                        ..default()
                    },
                    UiTransform::from_rotation(Rot2::radians(std::f32::consts::FRAC_PI_4)),
                    BorderColor::all(Color::srgb(0.35, 0.47, 0.62)),
                ));
            }
        });
}
fn select(parent: &mut ChildSpawnerCommands, font: &Handle<Font>, menu: Menu, title: &str) {
    parent
        .spawn(Node {
            row_gap: px(6),
            ..column()
        })
        .with_children(|p| {
            text(p, font, title, 13., Ink::Normal, None);
            button(p, font, Action::Menu(menu), "…", 0., 1.);
        });
}
fn meter(parent: &mut ChildSpawnerCommands, kind: Meter, color: Color) {
    parent
        .spawn((
            Node {
                height: px(7),
                flex_grow: 1.,
                border_radius: BorderRadius::all(px(5)),
                ..row()
            },
            BackgroundColor(Color::srgb_u8(215, 223, 234)),
        ))
        .with_children(|p| {
            p.spawn((
                kind,
                Node {
                    width: percent(0),
                    height: percent(100),
                    border_radius: BorderRadius::all(px(5)),
                    ..default()
                },
                BackgroundColor(color),
            ));
        });
}
#[derive(Component)]
struct Slider(Meter);

#[derive(SystemParam)]
pub(crate) struct SliderInput<'w, 's> {
    mouse: Res<'w, ButtonInput<MouseButton>>,
    windows: Query<'w, 's, &'static Window, With<PrimaryWindow>>,
    sliders: Query<
        'w,
        's,
        (
            &'static Slider,
            &'static Interaction,
            &'static ComputedNode,
            &'static UiGlobalTransform,
        ),
    >,
}

impl SliderInput<'_, '_> {
    pub fn action(&self, pending_population: &mut Option<Action>) -> Option<Action> {
        if self.mouse.just_released(MouseButton::Left) {
            return pending_population.take();
        }
        let cursor = self.windows.single().ok()?.physical_cursor_position()?;
        let action = self
            .sliders
            .iter()
            .find_map(|(slider, interaction, node, transform)| {
                if *interaction != Interaction::Pressed || node.size().x <= 1.0 {
                    return None;
                }
                let fraction =
                    (0.5 + (cursor.x - transform.translation.x) / node.size().x).clamp(0.0, 1.0);
                match slider.0 {
                    Meter::Speed => Some(Action::SetSpeed((1.0 + fraction * 59.0).round() as u8)),
                    Meter::Mutation => Some(Action::SetMutation((fraction * 35.0).round() as u8)),
                    Meter::Population => {
                        Some(Action::SetPopulation((4.0 + fraction * 96.0).round() as u8))
                    }
                    Meter::AtlasDensity => {
                        Some(Action::AtlasDensity((fraction * 30.0).round() as u16 * 20))
                    }
                    Meter::Pedal(_) => None,
                }
            });
        if matches!(action, Some(Action::SetPopulation(_))) {
            *pending_population = action;
            None
        } else {
            action
        }
    }
}

fn slider(parent: &mut ChildSpawnerCommands, font: &Handle<Font>, name: &str, kind: Meter) {
    parent
        .spawn(Node {
            row_gap: px(5),
            ..column()
        })
        .with_children(|p| {
            text(p, font, name, 13., Ink::Normal, None);
            p.spawn(Node {
                column_gap: px(8),
                align_items: AlignItems::Center,
                ..row()
            })
            .with_children(|p| {
                p.spawn(Node {
                    min_width: px(58),
                    ..row()
                })
                .with_children(|p| {
                    text(p, font, "", 13., Ink::Normal, Some(Field::Setting(kind)));
                });
                p.spawn((
                    Button,
                    Slider(kind),
                    Node {
                        flex_grow: 1.,
                        height: px(25),
                        ..row()
                    },
                ))
                .with_children(|p| meter(p, kind, RED));
            });
        });
}

fn table_row<const N: usize>(
    parent: &mut ChildSpawnerCommands,
    font: &Handle<Font>,
    widths: [f32; N],
    labels: [&str; N],
    field: impl Fn(usize) -> Option<Field>,
) {
    let mut row = parent.spawn(Node {
        padding: UiRect::all(px(8)),
        min_height: px(28),
        ..row()
    });
    if field(0).is_none() {
        row.insert((Surface::Strip, BackgroundColor(WHITE)));
    }
    row.with_children(|p| {
        for (i, width) in widths.into_iter().enumerate() {
            p.spawn(Node {
                width: percent(width),
                flex_shrink: 0.,
                ..default()
            })
            .with_children(|p| text(p, font, labels[i], 12., Ink::Normal, field(i)));
        }
    });
}

fn status_cell(parent: &mut ChildSpawnerCommands, font: &Handle<Font>, name: &str, field: Field) {
    parent
        .spawn(Node {
            flex_grow: 1.,
            min_width: px(0),
            row_gap: px(3),
            ..column()
        })
        .with_children(|p| {
            text(p, font, name, 11., Ink::Muted, None);
            text(p, font, "—", 17., Ink::Normal, Some(field));
        });
}

pub fn build(mut commands: Commands, mut fonts: ResMut<Assets<Font>>, assets: Res<AssetServer>) {
    let font = fonts.add(
        Font::try_from_bytes(
            include_bytes!("../../outputs/assets/fonts/Sintony-Bold.ttf").to_vec(),
        )
        .expect("Font integrato"),
    );
    commands.insert_resource(DashboardFont(font.clone()));
    let image = assets.load("embedded://porsche-top.png");
    commands.spawn((
        Camera2d,
        Camera {
            order: 4,
            clear_color: ClearColorConfig::None,
            ..default()
        },
        IsDefaultUiCamera,
    ));
    commands.spawn((
        Camera2d,
        Camera {
            order: -1,
            ..default()
        },
    ));
    commands.spawn(Node{width:percent(100),height:percent(100),..column()}).with_children(|root|{
        root.spawn((Node{height:px(52),flex_shrink:0.,justify_content:JustifyContent::SpaceBetween,padding:UiRect::horizontal(px(24)),..row()},
            Surface::Header,BackgroundColor(WHITE))).with_children(|p|{
            p.spawn(Node{column_gap:px(14),..row()}).with_children(|p|{
                text(p,&font,"MAL-E CNS",20.,Ink::Normal,None);
                text(p,&font,"Circuit Lab 5.7.1",12.,Ink::Muted,None);
            });
            p.spawn(Node{column_gap:px(2),..row()}).with_children(|p|{
                for (page,name) in [(Page::Session,"Sessione"),(Page::Compare,"Confronto modelli"),(Page::Brain,"Cervello 3D"),(Page::Split,"Affiancati")]{
                    button(p,&font,Action::Page(page),name,82.,0.);
                }
            });
            p.spawn(Node{column_gap:px(12),..row()}).with_children(|p|{
                button(p,&font,Action::Theme,"Scuro",70.,0.);
                p.spawn((Node{width:px(8),height:px(8),border_radius:BorderRadius::all(px(8)),..default()},
                    BackgroundColor(Color::srgb_u8(20,181,103))));
                text(p,&font,"Locale · offline",12.,Ink::Normal,None);
                text(p,&font,"",12.,Ink::Muted,Some(Field::Model));
            });
        });
        root.spawn((Section::SystemMenu, Node{display:Display::None, height:px(40),flex_shrink:0.,
            padding:UiRect::horizontal(px(16)),column_gap:px(5),..row()}, Surface::Header,BackgroundColor(WHITE))).with_children(|p|{
            for menu in [Menu::File,Menu::View,Menu::Window,Menu::Help] {
                button(p,&font,Action::Menu(menu),"",68.,0.);
            }
        });
        root.spawn(Node{flex_grow:1.,min_height:px(0),align_items:AlignItems::Stretch,padding:UiRect::all(px(14)),column_gap:px(12),..row()}).with_children(|body|{
            body.spawn((Node{width:px(274),flex_shrink:0.,row_gap:px(12),padding:UiRect::all(px(16)),overflow:Overflow::scroll_y(),..panel()},
                RelativeCursorPosition::default(),ScrollPosition::default(),ScrollArea,Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                text(p,&font,"Configurazione sessione",16.,Ink::Normal,None);
                select(p,&font,Menu::Circuit,"Circuito");
                select(p,&font,Menu::Driver,"Modello / prove di verifica");
                select(p,&font,Menu::Camera,"Camera del circuito");
                slider(p,&font,"Popolazione (auto)",Meter::Population);
                text(p,&font,"Fino a 100 auto per generazione",11.,Ink::Muted,None);
                slider(p,&font,"Mutazione base",Meter::Mutation);
                slider(p,&font,"Velocità simulazione",Meter::Speed);
                p.spawn(Node{column_gap:px(7),..row()}).with_children(|p|{
                    button(p,&font,Action::Run,"Avvia",128.,1.);button(p,&font,Action::Reset,"Reset",62.,0.);
                });
                p.spawn(Node{column_gap:px(5),..row()}).with_children(|p|{
                    button(p,&font,Action::Save,"Salva file…",0.,1.);button(p,&font,Action::Load,"Carica file…",0.,1.);
                });
                menus::disclosure(p, &font, Panel::Compatibility, |p| {
                    menus::hint(p, &font, ".malecns-save · compatibilità di versione e checksum verificati. Una sessione viene caricata in pausa.");
                });
                text(p,&font,"Nessun file salvato in questa sessione.",11.,Ink::Muted,Some(Field::Message));
                menus::disclosure(p, &font, Panel::Advanced, |p| {
                    button(p,&font,Action::Evolve,"Evolvi ora",0.,0.);
                    menus::hint(p,&font,"Massimo due giri validi per auto. Progresso e giri premiano. Urti, stallo e giri lenti penalizzano.");
                });
                menus::disclosure(p, &font, Panel::View, |p| {
                    button(p,&font,Action::Rays,"Sensori pista",0.,0.);
                    button(p,&font,Action::Details,"Dettagli",0.,0.);
                    button(p,&font,Action::Boundaries,"Bordi fisici",0.,0.);
                    text(p,&font,"",11.,Ink::Muted,Some(Field::CircuitDimensions));
                    menus::hint(p,&font,"Porsche · MattDoesBlender · CC BY-NC-SA 4.0. Alberi · 00amza · CC BY 4.0.");
                });
                menus::disclosure(p, &font, Panel::Experiment, |p| {
                    text(p,&font,"",11.,Ink::Muted,Some(Field::CircuitDetails));
                    text(p,&font,"",11.,Ink::Muted,Some(Field::CircuitSource));
                });
                menus::disclosure(p, &font, Panel::Sources, |p| {
                    text(p,&font,"",11.,Ink::Muted,Some(Field::Dataset));
                    menus::hint(p,&font,"MaleCNS:v1.0 · coordinate somatiche offline. Dinamica artificiale a tassi normalizzati.");
                });
                menus::disclosure(p, &font, Panel::Models, |p| {
                    menus::hint(p,&font,"V2 · 1.121 neuroni. V3 · 7.721 neuroni. V4 e V5 · 166.700 neuroni.");
                    menus::hint(p,&font,"V5 · 32.768 slot per passo. Encoder, guadagni e lettura motoria evolvono durante l’apprendimento.");
                });
            });
            body.spawn(Node{flex_grow:1.,min_width:px(0),row_gap:px(12),..column()}).with_children(|main|{
                main.spawn((Section::Stage,Node{flex_grow:1.,min_height:px(210),align_items:AlignItems::Stretch,column_gap:px(12),..row()})).with_children(|stage|{
                    stage.spawn((Section::Track,Node{flex_grow:1.,flex_basis:px(0),min_width:px(0),..panel()},BorderColor::all(NAVY))).with_children(|p|{
                        p.spawn((Node{height:px(46),flex_shrink:0.,justify_content:JustifyContent::SpaceBetween,padding:UiRect::horizontal(px(16)),..row()},Surface::Dark,BackgroundColor(NAVY))).with_children(|p|{
                            text(p,&font,"Circuito · simulazione",17.,Ink::FixedWhite,Some(Field::Track));
                            p.spawn(Node{column_gap:px(4),..row()}).with_children(|p|{
                                button(p,&font,Action::Map,"Mappa 2D",96.,0.);button(p,&font,Action::Scene,"Vista 3D",96.,0.);
                            });
                        });
                        p.spawn((TrackCanvas,Node{flex_grow:1.,width:percent(100),overflow:Overflow::clip(),..default()})).with_children(|p|{
                            p.spawn((Node{position_type:PositionType::Absolute,left:px(14),top:px(14),padding:UiRect::all(px(10)),..default()},Surface::Dark,BackgroundColor(NAVY))).with_children(|p|text(p,&font,"",13.,Ink::FixedWhite,Some(Field::Hud)));
                            p.spawn((Node{position_type:PositionType::Absolute,right:px(14),top:px(14),padding:UiRect::all(px(10)),..default()},Surface::Dark,BackgroundColor(NAVY))).with_children(|p|text(p,&font,"",13.,Ink::FixedWhite,Some(Field::Running)));
                            p.spawn((Node{position_type:PositionType::Absolute,left:px(14),bottom:px(14),padding:UiRect::all(px(8)),column_gap:px(6),..row()},
                                Surface::Panel,BackgroundColor(WHITE))).with_children(|p|{
                                text(p,&font,"Inquadra",12.,Ink::Muted,None);
                                button(p,&font,Action::Menu(Menu::Landmark),"Intero circuito",144.,0.);
                                button(p,&font,Action::ZoomOut,"−",30.,0.);button(p,&font,Action::ZoomIn,"+",30.,0.);
                                button(p,&font,Action::Center,"Centra",75.,0.);
                            });
                        });
                    });
                    stage.spawn((Section::Atlas,Node{flex_grow:1.,flex_basis:px(0),min_width:px(0),..panel()},BorderColor::all(NAVY))).with_children(|p|{
                        p.spawn((Node{height:px(46),flex_shrink:0.,padding:UiRect::horizontal(px(16)),..row()},Surface::Dark,BackgroundColor(NAVY))).with_children(|p|{
                            text(p,&font,"Atlante del cervello",17.,Ink::FixedWhite,None);
                        });
                        p.spawn((Node{padding:UiRect::all(px(9)),row_gap:px(6),..column()},Surface::Panel,BackgroundColor(WHITE))).with_children(|p|{
                            p.spawn(Node{column_gap:px(9),align_items:AlignItems::Stretch,..row()}).with_children(|p|{
                                select(p,&font,Menu::BrainPreset,"Vista");
                                select(p,&font,Menu::BrainFilter,"Neuroni");
                                select(p,&font,Menu::BrainColor,"Colore");
                            });
                            p.spawn(Node{column_gap:px(6),..row()}).with_children(|p|{
                                button(p,&font,Action::AtlasCenter,"Centra vista",0.,0.);
                                button(p,&font,Action::AtlasFreeze,"Congela attività",0.,0.);
                                button(p,&font,Action::AtlasZoom(false),"−",34.,0.);
                                button(p,&font,Action::AtlasZoom(true),"+",34.,0.);
                            });
                        });
                        p.spawn((AtlasCanvas,Node{flex_grow:1.,min_height:px(120),width:percent(100),..default()}));
                        p.spawn((Node{padding:UiRect::all(px(12)),row_gap:px(5),..column()},Surface::Panel,BackgroundColor(WHITE))).with_children(|p|{
                            text(p,&font,"Trascina per ruotare · rotella per zoom · clic per selezionare",11.,Ink::Muted,None);
                            text(p,&font,"",11.,Ink::Normal,Some(Field::Points));
                            p.spawn(Node{column_gap:px(7),..row()}).with_children(|p|{
                                text(p,&font,"Nessun neurone selezionato",12.,Ink::Normal,Some(Field::Neuron));
                                button(p,&font,Action::AtlasFocus,"Inquadra",0.,0.);
                            });
                            menus::disclosure(p,&font,Panel::Atlas,|p|{
                                p.spawn(Node{column_gap:px(6),..row()}).with_children(|p|{
                                    button(p,&font,Action::AtlasEnter,"Body ID del neurone",138.,1.);
                                    button(p,&font,Action::AtlasFind,"Trova",0.,0.);
                                });
                                p.spawn(Node{column_gap:px(6),..row()}).with_children(|p|{
                                    button(p,&font,Action::Menu(Menu::BrainQuality),"Dettaglio visivo",0.,0.);
                                });
                                slider(p,&font,"Connessioni mostrate",Meter::AtlasDensity);
                            });
                        });
                    });
                });
                main.spawn((Section::Summary,Node{height:px(324),flex_shrink:0.,column_gap:px(12),align_items:AlignItems::Stretch,..row()})).with_children(|p|{
                    p.spawn((Node{width:percent(22),padding:UiRect::all(px(14)),row_gap:px(13),..panel()},Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                        text(p,&font,"Stato simulazione",15.,Ink::Normal,None);
                        for fields in [[("Generazione",Field::Generation),("Giri validi max",Field::Laps)],[("Miglior giro",Field::Lap),("Tempo simulato",Field::Time)],[("Auto attive",Field::Active),("Velocità effettiva",Field::Rate)]] {
                            p.spawn(Node{column_gap:px(8),..row()}).with_children(|p|{
                                for (name,field) in fields{status_cell(p,&font,name,field);}
                            });
                        }
                        text(p,&font,"",12.,Ink::Muted,Some(Field::Past));
                    });
                    p.spawn((Node{flex_grow:1.,min_width:px(0),padding:UiRect::all(px(14)),row_gap:px(5),overflow:Overflow::scroll_y(),..panel()},
                        RelativeCursorPosition::default(),ScrollPosition::default(),ScrollArea,Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                        text(p,&font,"Risultati generazioni",15.,Ink::Normal,None);
                        let widths = [13., 39., 15., 33.];
                        table_row(p,&font,widths,["Gen.","Progresso sicuro","Giri","Miglior giro"], |_| None);
                        text(p,&font,"Nessuna generazione completata.",13.,Ink::Muted,Some(Field::Empty));
                        for i in 0..4{table_row(p,&font,widths,["";4], |j| Some(Field::History(i,j)));}
                        menus::disclosure(p,&font,Panel::History,|p|{
                            button(p,&font,Action::Menu(Menu::History),"Andamento",0.,0.);
                            crate::history::mount(p,&font);
                        });
                    });
                    p.spawn((Node{width:percent(40),padding:UiRect::all(px(14)),row_gap:px(9),overflow:Overflow::scroll_y(),..panel()},
                        RelativeCursorPosition::default(),ScrollPosition::default(),ScrollArea,
                        Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                        p.spawn(Node{column_gap:px(7),..row()}).with_children(|p|{
                            button(p,&font,Action::Menu(Menu::Agent),"Auto selezionata",100.,1.);
                            button(p,&font,Action::Previous,"‹",28.,0.);button(p,&font,Action::Select,"›",28.,0.);
                        });
                        p.spawn(Node{column_gap:px(7),justify_content:JustifyContent::SpaceBetween,..row()}).with_children(|p|{
                            button(p,&font,Action::Agent(None),"Auto: migliore",100.,0.);
                            button(p,&font,Action::Closeup,"Vedi da vicino",92.,0.);
                        });
                        p.spawn(Node{column_gap:px(15),..row()}).with_children(|p|{
                            p.spawn((ImageNode::new(image.clone()),Node{width:px(135),height:px(75),flex_shrink:0.,..default()}));
                            p.spawn(Node{flex_grow:1.,min_width:px(0),row_gap:px(7),..column()}).with_children(|p|{
                                text(p,&font,"Porsche 911 GT3 R (992)",14.,Ink::Normal,None);
                                p.spawn(Node{column_gap:px(6),..row()}).with_children(|p|{
                                    status_cell(p,&font,"Marcia",Field::Gear);status_cell(p,&font,"Giri motore",Field::Rpm);status_cell(p,&font,"Velocità",Field::Speed);
                                });
                            });
                        });
                        text(p,&font,"Comandi alle ruote",13.,Ink::Normal,None);
                        for (i, label) in ["Sterzo","Gas","Freno"].into_iter().enumerate(){
                            p.spawn(Node{column_gap:px(9),..row()}).with_children(|p|{
                                p.spawn(Node{width:px(55),..default()}).with_children(|p|text(p,&font,label,11.,Ink::Muted,None));
                                meter(p,Meter::Pedal(i),if i==1 {TEAL}else{RED});
                                text(p,&font,"0.00",11.,Ink::Muted,Some(Field::Pedal(i)));
                            });
                        }
                        text(p,&font,"",11.,Ink::Muted,Some(Field::Mechanics));
                        menus::disclosure(p,&font,Panel::Telemetry,|p|{
                            for kind in [Reading::State,Reading::Road,Reading::Tyres,Reading::Power,Reading::WheelLoads,Reading::Forces] {
                                text(p,&font,"",11.,Ink::Muted,Some(Field::Inspection(kind)));
                            }
                            button(p,&font,Action::Menu(Menu::Gearbox),"Cambio sequenziale",0.,0.);
                            p.spawn(Node{column_gap:px(6),..row()}).with_children(|p|{
                                button(p,&font,Action::Vehicle(VehicleAction::Shift(-1)),"Scala",58.,0.);
                                button(p,&font,Action::Vehicle(VehicleAction::Shift(1)),"Sali",58.,0.);
                                button(p,&font,Action::Vehicle(VehicleAction::ToggleAbs),"ABS",55.,0.);
                                button(p,&font,Action::Vehicle(VehicleAction::ToggleTc),"TC",55.,0.);
                            });
                            menus::hint(p,&font,"Gli interventi manuali escludono l’episodio dalla selezione e dall’apprendimento.");
                            for kind in [Reading::Rewards,Reading::Ledger] {
                                text(p,&font,"",11.,Ink::Normal,Some(Field::Inspection(kind)));
                            }
                            for i in 0..17 { text(p,&font,"",11.,Ink::Normal,Some(Field::Inspection(Reading::Sensor(i)))); }
                            for i in 0..3 { text(p,&font,"",11.,Ink::Normal,Some(Field::Inspection(Reading::Visual(i)))); }
                        });
                    });
                });
                main.spawn((Section::Comparison,Node{flex_grow:1.,padding:UiRect::all(px(18)),row_gap:px(14),..panel()},
                    Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                    text(p,&font,"Confronto modelli",21.,Ink::Normal,None);
                    text(p,&font,"V2, V3, V4 e V5, da zero sullo stesso circuito. Il test cerca due giri completati.",13.,Ink::Muted,None);
                    text(p,&font,"",13.,Ink::Normal,Some(Field::ComparisonSettings));
                    p.spawn(Node{column_gap:px(8),..row()}).with_children(|p|{
                        text(p,&font,"Minuti reali per modello",12.,Ink::Normal,None);
                        button(p,&font,Action::LimitEnter,"10",74.,0.);
                        button(p,&font,Action::LimitDown,"−",32.,0.);
                        button(p,&font,Action::LimitUp,"+",32.,0.);
                        text(p,&font,"0 = senza limite",11.,Ink::Muted,None);
                    });
                    text(p,&font,"",11.,Ink::Muted,Some(Field::ComparisonInput));
                    p.spawn(Node{column_gap:px(8),..row()}).with_children(|p|{
                        button(p,&font,Action::Compare,"Avvia V2 · V3 · V4 · V5",190.,0.);
                        button(p,&font,Action::StopComparison,"Interrompi test",115.,0.);
                        button(p,&font,Action::ExportComparison,"Esporta JSON…",112.,0.);
                    });
                    p.spawn(Node{column_gap:px(8),..row()}).with_children(|p|{
                        button(p,&font,Action::OpenDecoder,"Carica decoder V3…",0.,0.);
                        p.spawn((Section::Decoder,Node{column_gap:px(8),..row()})).with_children(|p|{
                            button(p,&font,Action::TestDecoder(false),"Prova V3 addestrato",0.,0.);
                            button(p,&font,Action::TestDecoder(true),"Affina V3 con ricompense",0.,0.);
                        });
                        p.spawn((Section::Refined,Node{..row()})).with_children(|p|{
                            button(p,&font,Action::SaveRefinement,"Salva decoder affinato…",0.,0.);
                        });
                    });
                    let widths = [10., 24., 9., 13., 15., 15., 14.];
                    table_row(p,&font,widths,["Modello","Stato","Giri","Generazioni","Tempo reale","Tempo simulato","Due giri"], |_| None);
                    for i in 0..4{table_row(p,&font,widths,["";7], |j| Some(Field::Trial(i,j)));}
                });
            });
        });
        root.spawn((Node{height:px(26),flex_shrink:0.,padding:UiRect::horizontal(px(16)),justify_content:JustifyContent::SpaceBetween,..row()},Surface::Header,BackgroundColor(WHITE))).with_children(|p|{
            text(p,&font,"MAL-E CNS  /  MODELLO SPERIMENTALE  /  LOCALE",10.,Ink::Muted,None);
            text(p,&font,"",10.,Ink::Muted,Some(Field::Dataset));
        });
    });
}

fn button_label(action: Action, s: &Session) -> Option<String> {
    let label = match action {
        Action::Run => if s.running {
            "Ⅱ  Pausa"
        } else {
            "▶  Riprendi"
        }
        .into(),
        Action::Menu(menu) => menu.current(s),
        Action::Rays => if s.rays {
            "Nascondi sensori"
        } else {
            "Mostra sensori"
        }
        .into(),
        Action::Details => format!("Dettagli: {}", if s.details { "sì" } else { "no" }),
        Action::Boundaries => if s.boundaries {
            "Nascondi bordi fisici"
        } else {
            "Mostra bordi fisici"
        }
        .into(),
        Action::Agent(None) => if s.selected.is_none() {
            "Auto: migliore"
        } else {
            "Segui la migliore"
        }
        .into(),
        Action::Vehicle(VehicleAction::ToggleAbs) => format!(
            "ABS {}",
            if s.frame
                .as_ref()
                .is_some_and(|f| f.cars[s.selected_car()].abs)
            {
                "sì"
            } else {
                "no"
            }
        ),
        Action::Vehicle(VehicleAction::ToggleTc) => format!(
            "TC {}",
            if s.frame
                .as_ref()
                .is_some_and(|f| f.cars[s.selected_car()].tc)
            {
                "sì"
            } else {
                "no"
            }
        ),
        Action::Theme => if s.dark { "Chiaro" } else { "Scuro" }.into(),
        Action::LimitEnter => s
            .comparison_limit_edit
            .as_ref()
            .map_or_else(|| s.comparison_limit.to_string(), |edit| format!("{edit}|")),
        Action::TestDecoder(false) => format!(
            "Prova V3 addestrato · {}",
            s.decoder
                .as_ref()
                .map_or("—", |bundle| match bundle.circuit.as_str() {
                    "monza" => "Monza",
                    "monaco" => "Monaco",
                    _ => "Le Mans",
                })
        ),
        Action::AtlasEnter => {
            if s.atlas_query.is_empty() {
                if s.atlas_typing {
                    "Digita il Body ID…"
                } else {
                    "Body ID del neurone"
                }
                .into()
            } else {
                format!("{}{}", s.atlas_query, if s.atlas_typing { "|" } else { "" })
            }
        }
        Action::AtlasFreeze => if s.atlas_frozen {
            "Riprendi attività"
        } else {
            "Congela attività"
        }
        .into(),
        _ => return None,
    };
    Some(label)
}

fn lap_text(value: Option<f64>) -> String {
    value.map_or("—".into(), |v| {
        format!("{:02}:{:06.3}", (v / 60.) as u32, v % 60.)
    })
}

pub fn refresh(
    s: Res<Session>,
    comparison: Res<Comparison>,
    mut clear: ResMut<ClearColor>,
    mut surfaces: Query<
        (&Surface, &mut BackgroundColor, Option<&mut BorderColor>),
        Without<Button>,
    >,
    mut buttons: Query<
        (
            &Action,
            &Interaction,
            &mut BackgroundColor,
            &mut BorderColor,
        ),
        With<Button>,
    >,
    mut text_query: Query<(&Ink, Option<&Field>, &mut Text, &mut TextColor)>,
    mut sections: Query<(&Section, &mut Node), Without<Meter>>,
    mut meters: Query<(&Meter, &mut Node), Without<Section>>,
) {
    let panel = if s.dark {
        Color::srgb_u8(24, 34, 49)
    } else {
        WHITE
    };
    let ink = if s.dark {
        Color::srgb_u8(224, 235, 248)
    } else {
        NAVY
    };
    let muted = if s.dark {
        Color::srgb_u8(155, 177, 202)
    } else {
        Color::srgb_u8(72, 94, 122)
    };
    let line = if s.dark {
        Color::srgb_u8(55, 72, 94)
    } else {
        Color::srgb_u8(217, 227, 240)
    };
    let soft = if s.dark {
        Color::srgb_u8(37, 51, 69)
    } else {
        Color::srgb_u8(235, 240, 247)
    };
    clear.0 = if s.dark {
        Color::srgb_u8(15, 22, 33)
    } else {
        Color::srgb_u8(247, 249, 251)
    };
    for (surface, mut bg, border) in &mut surfaces {
        let target = match surface {
            Surface::Panel | Surface::Header => panel,
            Surface::Dark => NAVY,
            Surface::Strip => soft,
        };
        if bg.0 != target {
            bg.0 = target;
        }
        if let Some(mut border) = border {
            let c = BorderColor::all(line);
            if *border != c {
                *border = c;
            }
        }
    }
    for (action, interaction, mut bg, mut border) in &mut buttons {
        let color = match action {
            _ if !action.enabled(&s, &comparison) => soft,
            Action::Page(page) if *page == s.page => RED,
            Action::Run | Action::Compare => RED,
            Action::Scene if s.camera != CameraMode::Map => NAVY,
            Action::Map if s.camera == CameraMode::Map => NAVY,
            _ if *interaction != Interaction::None => soft,
            _ if matches!(action, Action::Page(_) | Action::Scene | Action::Map) => soft,
            _ => panel,
        };
        if bg.0 != color {
            bg.0 = color;
        }
        let c = BorderColor::all(line);
        if *border != c {
            *border = c;
        }
    }
    for (section, mut node) in &mut sections {
        let visible = match section {
            Section::Comparison => s.page == Page::Compare,
            Section::SystemMenu => s.system_menu,
            Section::Decoder => s.decoder.is_some(),
            Section::Refined => comparison.refinement.is_some(),
            Section::Atlas => matches!(s.page, Page::Brain | Page::Split),
            Section::Track => matches!(s.page, Page::Session | Page::Split),
            Section::Stage => s.page != Page::Compare,
            Section::Summary => matches!(s.page, Page::Session | Page::Split),
        };
        let d = if visible {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != d {
            node.display = d;
        }
    }
    let frame = s.frame.as_ref();
    let car = frame.and_then(|f| f.cars.get(s.selected_car()));
    for (kind, mut node) in &mut meters {
        let v = match kind {
            Meter::Pedal(i) => car.map_or(0., |c| c.outputs[*i].abs()),
            Meter::Speed => ((s.setup.speed - 0.5) / 29.5).max(0.),
            Meter::Mutation => s.mutation / 0.35,
            Meter::Population => f64::from(s.setup.population.saturating_sub(4)) / 96.0,
            Meter::AtlasDensity => f64::from(s.atlas_density) / 600.0,
        };
        let width = percent(v as f32 * 100.);
        if node.width != width {
            node.width = width;
        }
    }
    for (kind, field, mut text, mut color) in &mut text_query {
        let on = field.is_some_and(|f| match *f {
            Field::Action(Action::Run | Action::Compare) => true,
            Field::Action(Action::Page(page)) => page == s.page,
            Field::Action(Action::Map) => s.camera == CameraMode::Map,
            Field::Action(Action::Scene) => s.camera != CameraMode::Map,
            _ => false,
        });
        let disabled = field.is_some_and(|f| {
            matches!(*f,
            Field::Action(action) if !action.enabled(&s, &comparison))
        });
        let c = if disabled {
            muted
        } else if on || matches!(kind, Ink::FixedWhite) {
            WHITE
        } else if matches!(kind, Ink::Muted) {
            muted
        } else {
            ink
        };
        if color.0 != c {
            color.0 = c;
        }
        let Some(field) = field else { continue };
        let val = match *field {
            Field::Action(action) => button_label(action, &s),
            Field::Model => {
                frame.map(|f| format!("{} · {} neuroni", s.setup.model.to_uppercase(), f.neurons))
            }
            Field::Track => s
                .track
                .as_ref()
                .map(|t| format!("{} · simulazione", t.label)),
            Field::Hud => car.map(|c| {
                format!(
                    "A-{:02}   ·   {:.1} km/h   ·   marcia {}   ·   {}/2 giri",
                    s.selected_car() + 1,
                    c.speed * 3.6,
                    c.gear,
                    c.laps
                )
            }),
            Field::Running => Some(
                if s.busy || frame.is_none() {
                    "CARICAMENTO"
                } else if comparison.running {
                    "IN PROVA"
                } else if s.running {
                    "IN CORSO"
                } else {
                    "IN PAUSA"
                }
                .into(),
            ),
            Field::Generation => frame.map(|f| format!("{:02}", f.generation)),
            Field::Laps => {
                frame.map(|f| format!("{} / 2", f.cars.iter().map(|c| c.laps).max().unwrap_or(0)))
            }
            Field::Lap => frame.map(|f| {
                lap_text(
                    f.cars
                        .iter()
                        .filter_map(|c| c.best_lap)
                        .chain(f.history.iter().filter_map(|g| g.best_lap_time))
                        .min_by(f64::total_cmp),
                )
            }),
            Field::Time => {
                frame.map(|f| format!("{:02}:{:04.1}", (f.elapsed / 60.) as u32, f.elapsed % 60.))
            }
            Field::Active => frame.map(|f| {
                format!(
                    "{} / {}",
                    f.cars.iter().filter(|c| c.alive).count(),
                    f.cars.len()
                )
            }),
            Field::Rate => Some(format!("{:.2}×", if s.running { s.effective } else { 0. })),
            Field::Past => frame.map(|f| {
                f.history
                    .last()
                    .map_or("Progresso sicuro ultima gen.   —".into(), |g| {
                        format!(
                            "Progresso sicuro ultima gen.   {:.0} m",
                            g.best_safe_progress
                        )
                    })
            }),
            Field::Speed => car.map(|c| format!("{:.1} km/h", c.speed * 3.6)),
            Field::Rpm => car.map(|c| format!("{:.0} rpm", c.rpm)),
            Field::Gear => car.map(|c| c.gear.to_string()),
            Field::Pedal(i) => car.map(|c| format!("{:+.2}", c.outputs[i])),
            Field::Mechanics => car.map(|c| {
                format!(
                    "ABS {}   ·   TC {}   ·   G long. {:+.2}   ·   G lat. {:+.2}",
                    if c.abs { "attivo" } else { "spento" },
                    if c.tc { "attivo" } else { "spento" },
                    c.longitudinal_g,
                    c.lateral_g
                )
            }),
            Field::Empty => Some(if frame.is_some_and(|f| !f.history.is_empty()) {
                String::new()
            } else {
                "Nessuna generazione completata.".into()
            }),
            Field::History(i, column) => Some(
                frame
                    .and_then(|f| f.history.iter().rev().nth(i))
                    .map_or_else(String::new, |g| match column {
                        0 => format!("{:02}", g.generation),
                        1 => format!("{:.1} m", g.best_safe_progress),
                        2 => format!("{} / 2", g.max_laps),
                        _ => lap_text(g.best_lap_time),
                    }),
            ),
            Field::ChartSummary => Some(
                frame
                    .and_then(|f| f.history.first().zip(f.history.last()))
                    .map_or_else(
                        || "Il grafico appare dopo la prima generazione.".into(),
                        |(first, last)| {
                            format!(
                                "Generazioni {}–{} · {} senza nuovo progresso",
                                first.generation, last.generation, last.stagnation
                            )
                        },
                    ),
            ),
            Field::Dataset => frame.map(|f| {
                let backend = match f.gpu.state.as_str() {
                    "active" => {
                        format!("GPU + CPU ({})", f.gpu.adapter.as_deref().unwrap_or("wgpu"))
                    }
                    "waiting" => "GPU neurale in avvio".into(),
                    "fallback" => "CPU · fallback GPU".into(),
                    _ => "CPU".into(),
                };
                format!(
                    "male-cns:v1.0 · {} neuroni · {} connessioni · {} worker · {}",
                    f.neurons, f.edges, f.worker_count, backend
                )
            }),
            Field::ComparisonSettings => Some(format!(
                "{} · {} auto · {}",
                if comparison.running {
                    comparison.circuit.as_str()
                } else {
                    s.track.as_ref().map_or("—", |t| t.label.as_str())
                },
                if comparison.running {
                    comparison.population
                } else {
                    s.setup.population
                },
                if s.comparison_limit == 0 {
                    "nessun limite".into()
                } else {
                    format!(
                        "{} min reali per modello",
                        if comparison.running {
                            comparison.limit
                        } else {
                            s.comparison_limit
                        }
                    )
                }
            )),
            Field::ComparisonInput => Some(if s.comparison_limit_edit.is_some() {
                if s.message.starts_with("Inserisci un numero") {
                    s.message.clone()
                } else {
                    "Invio conferma · Esc annulla".into()
                }
            } else {
                String::new()
            }),
            Field::Trial(i, column) => {
                let t = &comparison.rows[i];
                Some(match column {
                    0 => format!("V{}", i + 2),
                    1 => t.status.label().into(),
                    2 => format!("{} / 2", t.laps),
                    3 => t
                        .progress
                        .as_ref()
                        .map_or("—".into(), |state| state.generations.to_string()),
                    4 => format!("{:.1} s", t.seconds),
                    5 => format!("{:.1} s", t.elapsed),
                    _ => lap_text(t.lap_time),
                })
            }
            Field::Message => Some(if s.message.is_empty() {
                "Nessun file salvato in questa sessione.".into()
            } else {
                s.message.clone()
            }),
            Field::CircuitDimensions => s.track.as_ref().map(|t| {
                format!(
                    "{:.0} m · carreggiata {:.1}–{:.1} m",
                    t.length, t.width_min, t.width_max
                )
            }),
            Field::CircuitSource => s.track.as_ref().map(|t| t.source.clone()),
            Field::CircuitDetails => s.track.as_ref().map(|t| t.description.clone()),
            Field::Inspection(kind) => car.and_then(|car| {
                let d = s
                    .inspection
                    .as_ref()
                    .filter(|d| d.car == s.selected_car())?;
                Some(match kind {
                    Reading::State => format!(
                        "{} · {} giri · ultimo {}",
                        if d.diagnostic {
                            "Diagnostica"
                        } else {
                            &d.reason
                        },
                        car.laps,
                        lap_text(d.last_lap)
                    ),
                    Reading::Road => format!(
                        "Quota {:.1} m · pendenza {:+.1}% · {:.2} g normali · larghezza {:.1} m",
                        car.elevation, d.road_grade_percent, d.normal_g, d.width
                    ),
                    Reading::Tyres => format!(
                        "Gomme {:.0} °C · usura {:.1}% · {:.2} bar · freni {:.0} °C",
                        d.tyre_c,
                        d.tyre_wear * 100.,
                        d.pressure_bar,
                        d.brake_c
                    ),
                    Reading::Power => format!(
                        "{:.0} kW · {:.1} L · deportanza {:.0} N",
                        d.engine_power_kw, d.fuel_l, d.downforce_n
                    ),
                    Reading::WheelLoads => format!(
                        "Carichi ruote · AS {:.0} N · AD {:.0} N · PS {:.0} N · PD {:.0} N",
                        d.loads[0], d.loads[1], d.loads[2], d.loads[3]
                    ),
                    Reading::Rewards => format!(
                        "Ricompense +{:.0} · penalità −{:.0} · selezione {:.0} pt",
                        d.reward, d.penalty, car.fitness
                    ),
                    Reading::Ledger => d
                        .ledger
                        .iter()
                        .filter(|(_, v)| v.abs() > 0.01)
                        .map(|(k, v)| format!("{k} {v:+.1}"))
                        .collect::<Vec<_>>()
                        .join(" · "),
                    Reading::Forces => format!(
                        "G totale {:.2} · deriva {:+.1}° · {}",
                        d.total_g,
                        d.slip_deg,
                        if d.shift_remaining > 0. {
                            "cambiata in corso"
                        } else if d.gear_manual {
                            "cambio manuale"
                        } else {
                            "cambio automatico"
                        }
                    ),
                    Reading::Sensor(i) => format!(
                        "{}   {:+.2}",
                        [
                            "SPEED",
                            "G LONG",
                            "G LAT",
                            "G TOTAL",
                            "SLIP",
                            "YAW",
                            "LOAD",
                            "ROAD BAL",
                            "ROAD TURN",
                            "FRONT CLEAR",
                            "ROAD WIDTH",
                            "RPM",
                            "GEAR",
                            "SLIP R",
                            "SLIP F",
                            "TYRE °C",
                            "BRAKE °C"
                        ][i],
                        d.physics[i]
                    ),
                    Reading::Visual(i) => format!(
                        "Visuale {}   {:.2}",
                        ["sinistra", "centro", "destra"][i],
                        d.visual[i]
                    ),
                })
            }),
            Field::Setting(Meter::Speed) => Some(format!("{:.1}×", s.setup.speed)),
            Field::Setting(Meter::Mutation) => Some(format!("{:.0}%", s.mutation * 100.)),
            Field::Setting(Meter::Population) => Some(s.setup.population.to_string()),
            Field::Setting(Meter::AtlasDensity) => Some(s.atlas_density.to_string()),
            Field::Setting(Meter::Pedal(_)) => None,
            Field::Points => s.points.as_ref().map(|p| {
                let mode = s
                    .activity
                    .as_ref()
                    .map(|sample| {
                        format!(
                            "A-{:02} · attività {} · {} contributi",
                            sample.car + 1,
                            if s.atlas_frozen { "congelata" } else { "live" },
                            sample.edges.len()
                        )
                    })
                    .unwrap_or_else(|| "In attesa del campione neurale".into());
                format!("{} coordinate MaleCNS · {}", p.len(), mode)
            }),
            Field::Neuron => Some(
                s.points
                    .as_ref()
                    .and_then(|p| {
                        let n = p.get(s.atlas_selected?)?;
                        let class = p
                            .classes
                            .get(n.class)
                            .map(String::as_str)
                            .unwrap_or("sconosciuta");
                        let side = match n.side {
                            -1 => "S",
                            1 => "D",
                            _ => "—",
                        };
                        let [x, y, z] = n.coordinates;
                        let activity = s.activity.as_ref().map_or(0., |a| a.value(n.index));
                        Some(format!(
                            "{} · {} · lato {} · {:.4} · {} / {} / {}",
                            n.body, class, side, activity, x, y, z
                        ))
                    })
                    .unwrap_or_else(|| {
                        if s.atlas_notice.is_empty() {
                            "Nessun neurone selezionato".into()
                        } else {
                            s.atlas_notice.clone()
                        }
                    }),
            ),
        };
        if let Some(val) = val {
            if text.0 != val {
                text.0 = val;
            }
        }
    }
}

pub fn viewports(
    s: Res<Session>,
    window: Query<&Window, With<PrimaryWindow>>,
    track: Query<(&ComputedNode, &UiGlobalTransform), With<TrackCanvas>>,
    atlas: Query<(&ComputedNode, &UiGlobalTransform), With<AtlasCanvas>>,
    mut cameras: Query<
        (&mut Camera, Has<CameraRig>, Has<BrainCamera>),
        Or<(With<CameraRig>, With<BrainCamera>)>,
    >,
) {
    let Ok(window) = window.single() else { return };
    for (mut camera, is_track, is_brain) in &mut cameras {
        let frame = if is_track && matches!(s.page, Page::Session | Page::Split) {
            track.single().ok()
        } else if is_brain && matches!(s.page, Page::Brain | Page::Split) {
            atlas.single().ok()
        } else {
            None
        };
        if let Some((node, transform)) = frame.filter(|(n, _)| n.size().min_element() > 1.) {
            let pos = (transform.translation - node.size() / 2.)
                .round()
                .max(Vec2::ZERO)
                .as_uvec2();
            let end = (transform.translation + node.size() / 2.)
                .round()
                .as_uvec2()
                .min(UVec2::new(
                    window.physical_width(),
                    window.physical_height(),
                ));
            if end.x > pos.x && end.y > pos.y {
                camera.viewport = Some(Viewport {
                    physical_position: pos,
                    physical_size: end - pos,
                    ..default()
                });
                camera.is_active = true;
                continue;
            }
        }
        camera.is_active = false;
    }
}
