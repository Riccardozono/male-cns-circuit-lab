use crate::{
    atlas::BrainCamera,
    comparison::Comparison,
    scene::CameraRig,
    window::{Action, CameraMode, Page, Session},
};
use bevy::{
    camera::Viewport, ecs::system::SystemParam, prelude::*, ui::IsDefaultUiCamera,
    window::PrimaryWindow,
};

const NAVY: Color = Color::srgb_u8(22, 43, 73);
const WHITE: Color = Color::srgb_u8(255, 255, 255);
const RED: Color = Color::srgb_u8(205, 33, 40);
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
    Car,
    Speed,
    Rpm,
    Gear,
    Pedal(usize),
    Mechanics,
    History(usize, usize),
    Empty,
    Dataset,
    ComparisonSettings,
    Trial(usize, usize),
    Points,
    Message,
    Setting(Meter),
}
#[derive(Component, Clone, Copy)]
pub(crate) enum Meter {
    Pedal(usize),
    Mutation,
    Speed,
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
fn text(
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
fn button(
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
                flex_grow: grow,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
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
        });
}
fn select(parent: &mut ChildSpawnerCommands, font: &Handle<Font>, action: Action, title: &str) {
    parent
        .spawn(Node {
            row_gap: px(6),
            ..column()
        })
        .with_children(|p| {
            text(p, font, title, 13., Ink::Normal, None);
            button(p, font, action, "…", 0., 1.);
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
    pub fn action(&self) -> Option<Action> {
        let cursor = self.windows.single().ok()?.physical_cursor_position()?;
        self.sliders
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
                    Meter::Pedal(_) => None,
                }
            })
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
        root.spawn(Node{flex_grow:1.,min_height:px(0),align_items:AlignItems::Stretch,padding:UiRect::all(px(14)),column_gap:px(12),..row()}).with_children(|body|{
            body.spawn((Node{width:px(274),flex_shrink:0.,row_gap:px(12),padding:UiRect::all(px(16)),overflow:Overflow::clip(),..panel()},
                Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                text(p,&font,"Configurazione sessione",16.,Ink::Normal,None);
                select(p,&font,Action::Circuit,"Circuito");
                select(p,&font,Action::Model,"Modello / prove di verifica");
                select(p,&font,Action::Camera,"Camera del circuito");
                select(p,&font,Action::Population,"Popolazione (auto)");
                text(p,&font,"Fino a 100 auto per generazione",11.,Ink::Muted,None);
                slider(p,&font,"Mutazione base",Meter::Mutation);
                slider(p,&font,"Velocità simulazione",Meter::Speed);
                p.spawn(Node{column_gap:px(7),..row()}).with_children(|p|{
                    button(p,&font,Action::Run,"Avvia",128.,1.);button(p,&font,Action::Reset,"Reset",62.,0.);
                });
                p.spawn(Node{column_gap:px(5),..row()}).with_children(|p|{
                    button(p,&font,Action::Save,"Salva file…",0.,1.);button(p,&font,Action::Load,"Carica file…",0.,1.);
                });
                p.spawn(Node{column_gap:px(5),..row()}).with_children(|p|{
                    button(p,&font,Action::Evolve,"Evolvi ora",0.,1.);
                    button(p,&font,Action::Rays,"Sensori pista",0.,1.);
                });
                text(p,&font,"",11.,Ink::Muted,Some(Field::Message));
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
                                button(p,&font,Action::ZoomOut,"−",30.,0.);button(p,&font,Action::ZoomIn,"+",30.,0.);
                                button(p,&font,Action::Center,"Centra",75.,0.);
                            });
                        });
                    });
                    stage.spawn((Section::Atlas,Node{flex_grow:1.,flex_basis:px(0),min_width:px(0),..panel()},BorderColor::all(NAVY))).with_children(|p|{
                        p.spawn((Node{height:px(46),flex_shrink:0.,padding:UiRect::horizontal(px(16)),..row()},Surface::Dark,BackgroundColor(NAVY))).with_children(|p|{
                            text(p,&font,"Atlante del cervello",17.,Ink::FixedWhite,None);
                        });
                        p.spawn((Node{padding:UiRect::all(px(9)),column_gap:px(6),..row()},Surface::Panel,BackgroundColor(WHITE))).with_children(|p|{
                            button(p,&font,Action::AtlasCenter,"Centra vista",0.,0.);
                            button(p,&font,Action::AtlasLive,"Attività",0.,0.);
                            button(p,&font,Action::AtlasFreeze,"Congela",0.,0.);
                        });
                        p.spawn((AtlasCanvas,Node{flex_grow:1.,width:percent(100),..default()}));
                        p.spawn((Node{padding:UiRect::all(px(12)),row_gap:px(5),..column()},Surface::Panel,BackgroundColor(WHITE))).with_children(|p|{
                            text(p,&font,"Trascina per ruotare · rotella per zoom",12.,Ink::Muted,None);
                            text(p,&font,"",12.,Ink::Normal,Some(Field::Points));
                        });
                    });
                });
                main.spawn((Section::Summary,Node{height:px(278),flex_shrink:0.,column_gap:px(12),align_items:AlignItems::Stretch,..row()})).with_children(|p|{
                    p.spawn((Node{width:percent(22),padding:UiRect::all(px(14)),row_gap:px(13),..panel()},Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                        text(p,&font,"Stato simulazione",15.,Ink::Normal,None);
                        for fields in [[("Generazione",Field::Generation),("Giri validi max",Field::Laps)],[("Miglior giro",Field::Lap),("Tempo simulato",Field::Time)],[("Auto attive",Field::Active),("Velocità effettiva",Field::Rate)]] {
                            p.spawn(Node{column_gap:px(8),..row()}).with_children(|p|{
                                for (name,field) in fields{status_cell(p,&font,name,field);}
                            });
                        }
                        text(p,&font,"",12.,Ink::Muted,Some(Field::Past));
                    });
                    p.spawn((Node{flex_grow:1.,min_width:px(0),padding:UiRect::all(px(14)),row_gap:px(9),..panel()},Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                        text(p,&font,"Risultati generazioni",15.,Ink::Normal,None);
                        let widths = [13., 39., 15., 33.];
                        table_row(p,&font,widths,["Gen.","Progresso sicuro","Giri","Miglior giro"], |_| None);
                        text(p,&font,"Nessuna generazione completata.",13.,Ink::Muted,Some(Field::Empty));
                        for i in 0..5{table_row(p,&font,widths,["";4], |j| Some(Field::History(i,j)));}
                    });
                    p.spawn((Node{width:percent(40),padding:UiRect::all(px(14)),row_gap:px(9),..panel()},Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                        p.spawn(Node{column_gap:px(7),..row()}).with_children(|p|{
                            text(p,&font,"Auto selezionata",14.,Ink::Normal,Some(Field::Car));
                            button(p,&font,Action::Previous,"‹",28.,0.);button(p,&font,Action::Select,"›",28.,0.);
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
                    });
                });
                main.spawn((Section::Comparison,Node{flex_grow:1.,padding:UiRect::all(px(18)),row_gap:px(14),..panel()},
                    Surface::Panel,BackgroundColor(WHITE),BorderColor::all(NAVY))).with_children(|p|{
                    text(p,&font,"Confronto modelli",21.,Ink::Normal,None);
                    text(p,&font,"V2, V3, V4 e V5, da zero sullo stesso circuito. Il test cerca due giri completati.",13.,Ink::Muted,None);
                    text(p,&font,"",13.,Ink::Normal,Some(Field::ComparisonSettings));
                    p.spawn(Node{column_gap:px(8),..row()}).with_children(|p|{
                        button(p,&font,Action::LimitDown,"− 1 min",75.,0.);
                        button(p,&font,Action::LimitUp,"+ 1 min",75.,0.);
                        button(p,&font,Action::Compare,"Avvia V2 · V3 · V4 · V5",190.,0.);
                        button(p,&font,Action::StopComparison,"Interrompi test",115.,0.);
                    });
                    let widths = [11., 28., 12., 16., 18., 15.];
                    table_row(p,&font,widths,["Modello","Stato","Giri","Tempo reale","Tempo simulato","Due giri"], |_| None);
                    for i in 0..4{table_row(p,&font,widths,["";6], |j| Some(Field::Trial(i,j)));}
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
        Action::Circuit => format!(
            "{}  ▾",
            s.track.as_ref().map_or("Caricamento", |t| t.label.as_str())
        ),
        Action::Model => format!("MaleCNS {}  ▾", s.setup.model.to_uppercase()),
        Action::Camera => format!("{}  ▾", s.camera.label()),
        Action::Population => format!("{}  ▾", s.setup.population),
        Action::Rays => format!("Sensori pista  {}", if s.rays { "Sì" } else { "No" }),
        Action::Theme => if s.dark { "Chiaro" } else { "Scuro" }.into(),
        Action::AtlasLive => if s.atlas_live {
            "Mostra classi"
        } else {
            "Mostra attività"
        }
        .into(),
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
        let c = if on || matches!(kind, Ink::FixedWhite) {
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
        let val =
            match *field {
                Field::Action(action) => button_label(action, &s),
                Field::Model => frame
                    .map(|f| format!("{} · {} neuroni", s.setup.model.to_uppercase(), f.neurons)),
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
                    } else if s.running {
                        "IN CORSO"
                    } else {
                        "IN PAUSA"
                    }
                    .into(),
                ),
                Field::Generation => frame.map(|f| format!("{:02}", f.generation)),
                Field::Laps => frame
                    .map(|f| format!("{} / 2", f.cars.iter().map(|c| c.laps).max().unwrap_or(0))),
                Field::Lap => frame.map(|f| {
                    lap_text(
                        f.cars
                            .iter()
                            .filter_map(|c| c.best_lap)
                            .chain(f.history.iter().filter_map(|g| g.best_lap_time))
                            .min_by(f64::total_cmp),
                    )
                }),
                Field::Time => frame
                    .map(|f| format!("{:02}:{:04.1}", (f.elapsed / 60.) as u32, f.elapsed % 60.)),
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
                Field::Car => car.map(|_| {
                    format!(
                        "Auto A-{:02} · {}",
                        s.selected_car() + 1,
                        if s.selected.is_none() {
                            "migliore"
                        } else {
                            "manuale"
                        }
                    )
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
                Field::Dataset => frame.map(|f| {
                    format!(
                        "male-cns:v1.0 · {} neuroni · {} connessioni · Rust / Bevy",
                        f.neurons, f.edges
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
                        format!("{} min reali per modello", s.comparison_limit)
                    }
                )),
                Field::Trial(i, column) => {
                    let t = &comparison.rows[i];
                    Some(match column {
                        0 => format!("V{}", i + 2),
                        1 if t.status.is_empty() => "In attesa".into(),
                        1 => t.status.clone(),
                        2 => format!("{} / 2", t.laps),
                        3 => format!("{:.1} s", t.seconds),
                        4 => format!("{:.1} s", t.elapsed),
                        _ => lap_text(t.lap_time),
                    })
                }
                Field::Message => Some(s.message.clone()),
                Field::Setting(Meter::Speed) => Some(format!("{:.1}×", s.setup.speed)),
                Field::Setting(Meter::Mutation) => Some(format!("{:.0}%", s.mutation * 100.)),
                Field::Setting(Meter::Pedal(_)) => None,
                Field::Points => s.points.as_ref().map(|p| {
                    let mode = if s.atlas_live {
                        s.activity
                            .as_ref()
                            .map(|(car, _)| {
                                format!(
                                    "A-{:02} · attività {}",
                                    car + 1,
                                    if s.atlas_frozen { "congelata" } else { "live" }
                                )
                            })
                            .unwrap_or_else(|| "In attesa del campione neurale".into())
                    } else {
                        "Colori per classe anatomica".into()
                    };
                    format!("{} coordinate MaleCNS · {}", p.len(), mode)
                }),
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
