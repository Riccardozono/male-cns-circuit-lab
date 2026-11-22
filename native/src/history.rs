use crate::{
    dashboard::{Field, Ink, text},
    engine::Generation,
    window::Session,
};
use bevy::prelude::*;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Metric {
    #[default]
    SafeProgress,
    RawProgress,
    Fitness,
}

impl Metric {
    pub const ALL: [Self; 3] = [Self::SafeProgress, Self::RawProgress, Self::Fitness];
    pub fn label(self) -> &'static str {
        match self {
            Self::SafeProgress => "Progresso sicuro (m)",
            Self::RawProgress => "Massimo grezzo (m)",
            Self::Fitness => "Punteggio netto (pt)",
        }
    }

    fn values(self, row: &Generation) -> [f64; 2] {
        match self {
            Self::SafeProgress => [row.best_safe_progress, row.mean_safe_progress],
            Self::RawProgress => [row.best_progress, row.mean_progress],
            Self::Fitness => [row.best, row.mean],
        }
    }
}

#[derive(Component)]
pub(crate) struct Plot;

#[derive(Clone, Copy, PartialEq)]
pub(crate) struct Revision {
    size: Vec2,
    session: u64,
    generation: u32,
    metric: Metric,
    dark: bool,
}

pub fn mount(p: &mut ChildSpawnerCommands, font: &Handle<Font>) {
    text(p, font, "Migliore · media", 11., Ink::Muted, None);
    p.spawn((
        Plot,
        Node {
            width: percent(100),
            height: px(112),
            flex_shrink: 0.,
            overflow: Overflow::clip(),
            ..default()
        },
    ));
    text(p, font, "", 11., Ink::Muted, Some(Field::ChartSummary));
}

pub fn refresh(
    mut commands: Commands,
    s: Res<Session>,
    plots: Query<(Entity, &ComputedNode, Option<&Children>), With<Plot>>,
    mut previous: Local<Option<Revision>>,
    scale: Res<UiScale>,
    window: Query<&Window, With<bevy::window::PrimaryWindow>>,
) {
    let (Ok((plot, node, children)), Some(frame), Ok(window)) =
        (plots.single(), &s.frame, window.single())
    else {
        return;
    };
    let size = node.size() / (window.scale_factor() * scale.0);
    if size.min_element() <= 1. {
        return;
    }
    let stamp = Revision {
        size,
        session: s.revision,
        generation: frame.generation,
        metric: s.history_mode,
        dark: s.dark,
    };
    if previous.as_ref() == Some(&stamp) {
        return;
    }
    *previous = Some(stamp);
    if let Some(children) = children {
        for entity in children.iter() {
            commands.entity(entity).despawn();
        }
    }
    let values: Vec<_> = frame
        .history
        .iter()
        .map(|row| s.history_mode.values(row))
        .collect();
    if values.is_empty() {
        return;
    }
    let range = values
        .iter()
        .flatten()
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), &x| {
            (min.min(x), max.max(x))
        });
    let height = size.y - 14.;
    let x_span = size.x - 20.;
    let count = values.len();
    let series = |k: usize| {
        values.iter().enumerate().map(move |(j, row)| {
            let x = if count == 1 {
                size.x / 2.
            } else {
                10. + j as f32 * x_span / (count - 1) as f32
            };
            let y = if range.1 == range.0 {
                size.y / 2.
            } else {
                7. + height * ((range.1 - row[k]) / (range.1 - range.0)) as f32
            };
            Vec2::new(x, y)
        })
    };
    let colors = if s.dark {
        [Color::srgb(1., 0.35, 0.36), Color::srgb(0.53, 0.76, 0.90)]
    } else {
        [Color::srgb(0.76, 0.15, 0.20), Color::srgb(0.19, 0.40, 0.56)]
    };
    commands.entity(plot).with_children(|p| {
        for (index, tint) in colors.into_iter().enumerate() {
            let mut last: Option<Vec2> = None;
            for position in series(index) {
                if let Some(prior) = last {
                    let middle = (position + prior) * 0.5;
                    let vector = position - prior;
                    let length = vector.length();
                    p.spawn((
                        Node {
                            position_type: PositionType::Absolute,
                            left: px(middle.x - length * 0.5),
                            top: px(middle.y - 1.0),
                            width: px(length),
                            height: px(2.),
                            ..default()
                        },
                        UiTransform::from_rotation(Rot2::radians(vector.y.atan2(vector.x))),
                        BackgroundColor(tint),
                    ));
                }
                p.spawn((
                    Node {
                        position_type: PositionType::Absolute,
                        left: px(position.x - 2.),
                        top: px(position.y - 2.),
                        width: px(4.),
                        height: px(4.),
                        border_radius: BorderRadius::all(px(4.)),
                        ..default()
                    },
                    BackgroundColor(tint),
                ));
                last = Some(position);
            }
        }
    });
}
