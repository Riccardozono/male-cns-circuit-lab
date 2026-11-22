use crate::{
    dashboard::AtlasCanvas,
    window::{Page, Session},
};
use bevy::{
    asset::RenderAssetUsages,
    camera::{
        ScalingMode,
        visibility::{NoFrustumCulling, RenderLayers},
    },
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    mesh::PrimitiveTopology,
    prelude::*,
    window::PrimaryWindow,
};
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Preset {
    #[default]
    Orbit,
    Xy,
    Yz,
    Xz,
}

impl Preset {
    pub const ALL: [Self; 4] = [Self::Orbit, Self::Xy, Self::Yz, Self::Xz];
    pub fn label(self) -> &'static str {
        match self {
            Self::Orbit => "Prospettiva 3D",
            Self::Xy => "Piano XY",
            Self::Yz => "Piano YZ",
            Self::Xz => "Piano XZ",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Filter {
    #[default]
    All,
    Active,
    Input,
    Motor,
    Descending,
}

impl Filter {
    pub const ALL: [Self; 5] = [
        Self::All,
        Self::Active,
        Self::Input,
        Self::Motor,
        Self::Descending,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::All => "Intero atlante",
            Self::Active => "Attività non nulla",
            Self::Input => "Ingressi sensoriali",
            Self::Motor => "Lettura motoria appresa",
            Self::Descending => "Discendenti annotati",
        }
    }

    fn matches(self, neuron: &Neuron, activity: Option<&Activity>) -> bool {
        match self {
            Self::All => true,
            Self::Active => activity.is_some_and(|a| a.value(neuron.index).abs() > 0.002),
            Self::Input => neuron.flags & 1 != 0,
            Self::Motor => neuron.flags & 2 != 0,
            Self::Descending => neuron.flags & 4 != 0,
        }
    }
}

pub struct Neuron {
    pub index: usize,
    pub body: u64,
    pub position: Vec3,
    pub class: usize,
    pub side: i8,
    pub flags: u8,
    pub coordinates: [i32; 3],
}

pub struct Points {
    pub nodes: Vec<Neuron>,
    pub classes: Vec<String>,
}

impl Points {
    pub fn from_rows(rows: &[f64], classes: Vec<String>) -> Self {
        let nodes = rows
            .chunks_exact(11)
            .map(|t| Neuron {
                index: t[0] as usize,
                body: t[1] as u64,
                position: Vec3::new(t[2] as f32, t[3] as f32, t[4] as f32) * 1.1,
                class: t[5] as usize,
                side: t[6] as i8,
                flags: t[7] as u8,
                coordinates: [t[8] as i32, t[9] as i32, t[10] as i32],
            })
            .collect();
        Self { nodes, classes }
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn get(&self, index: usize) -> Option<&Neuron> {
        let position = self.nodes.binary_search_by_key(&index, |n| n.index).ok()?;
        self.nodes.get(position)
    }

    pub fn by_body(&self, body: u64) -> Option<usize> {
        self.nodes.iter().find(|n| n.body == body).map(|n| n.index)
    }
}

#[derive(Deserialize)]
pub struct Edge {
    source: usize,
    target: usize,
    contribution: f32,
}

pub struct Activity {
    pub car: usize,
    pub values: Vec<f32>,
    pub edges: Vec<Edge>,
}

impl Activity {
    pub fn value(&self, i: usize) -> f32 {
        self.values.get(i).copied().unwrap_or_default()
    }
}

#[derive(Component)]
pub(crate) struct BrainCamera;
#[derive(Component)]
pub(crate) struct Cloud;
#[derive(Component)]
pub(crate) struct Connections;

#[derive(Resource)]
pub(crate) struct View {
    revision: u64,
    yaw: f32,
    pitch: f32,
    zoom: f32,
    pan: Vec3,
    dragging: f32,
    center_revision: u64,
    filter: Filter,
    quality: usize,
    selection: Option<usize>,
    activity: Option<usize>,
    color_by_activity: bool,
    drawn: Vec<usize>,
    mesh: Handle<Mesh>,
    edges: Handle<Mesh>,
}

fn empty(topology: PrimitiveTopology) -> Mesh {
    Mesh::new(topology, RenderAssetUsages::default())
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, Vec::<[f32; 3]>::new())
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, Vec::<[f32; 4]>::new())
}

pub fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let background = materials.add(StandardMaterial {
        base_color: Color::srgb_u8(12, 18, 26),
        cull_mode: None,
        unlit: true,
        ..default()
    });
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(20.0).mesh().uv(16, 8))),
        MeshMaterial3d(background),
        RenderLayers::layer(2),
    ));
    let mesh = meshes.add(empty(PrimitiveTopology::TriangleList));
    let edges = meshes.add(empty(PrimitiveTopology::LineList));
    let style = materials.add(StandardMaterial {
        unlit: true,
        cull_mode: None,
        ..default()
    });
    commands.spawn((
        Cloud,
        Mesh3d(mesh.clone()),
        MeshMaterial3d(style.clone()),
        RenderLayers::layer(2),
        NoFrustumCulling,
    ));
    commands.spawn((
        Connections,
        Mesh3d(edges.clone()),
        MeshMaterial3d(style.clone()),
        RenderLayers::layer(2),
        NoFrustumCulling,
    ));
    commands.insert_resource(View {
        revision: 0,
        yaw: 0.35,
        pitch: 0.15,
        zoom: 1.0,
        pan: Vec3::ZERO,
        dragging: 0.,
        center_revision: 0,
        filter: Filter::All,
        quality: 0,
        selection: None,
        activity: None,
        color_by_activity: false,
        drawn: Vec::new(),
        mesh,
        edges,
    });
    commands.spawn((
        BrainCamera,
        Camera3d::default(),
        Camera {
            order: 2,
            is_active: false,
            clear_color: Color::srgb_u8(11, 17, 25).into(),
            ..default()
        },
        Transform::from_xyz(0.4, 0.15, 2.8).looking_at(Vec3::ZERO, Vec3::Y),
        RenderLayers::layer(2),
    ));
}

fn color(n: &Neuron, sample: Option<&Activity>, show_activity: bool, selected: bool) -> [f32; 4] {
    if selected {
        return [1.0, 0.83, 0.32, 1.0];
    }
    if show_activity && let Some(data) = sample {
        let value = data.value(n.index);
        let brightness = (value.abs() * 14.0).sqrt().clamp(0., 1.);
        let signal = if value >= 0. {
            Vec3::new(0.16, 0.94, 0.77)
        } else {
            Vec3::new(1.0, 0.22, 0.43)
        };
        return Vec3::new(0.08, 0.14, 0.20)
            .lerp(signal, brightness)
            .extend(1.)
            .to_array();
    }
    if n.flags & 1 != 0 {
        [0.94, 0.74, 0.41, 1.]
    } else if n.flags & 6 != 0 {
        [1., 0.52, 0.39, 1.]
    } else if n.flags & 8 != 0 {
        [0.65, 0.71, 1., 1.]
    } else {
        [0.29, 0.40, 0.46, 1.]
    }
}

fn build_points(s: &Session, points: &Points, view: &mut View, meshes: &mut Assets<Mesh>) {
    let eligible: Vec<_> = points
        .nodes
        .iter()
        .filter(|n| s.atlas_filter.matches(n, s.activity.as_ref()))
        .collect();
    let count = eligible.len().min(s.atlas_quality);
    let mut drawn: Vec<_> = (0..count)
        .map(|j| eligible[j * eligible.len() / count])
        .collect();
    if let Some(node) = s.atlas_selected.and_then(|i| points.get(i))
        && !drawn.iter().any(|n| n.index == node.index)
    {
        drawn.push(node);
    }
    view.drawn = drawn.iter().map(|n| n.index).collect();
    let mut xyz = Vec::with_capacity(drawn.len() * 12);
    let mut colors = Vec::with_capacity(xyz.capacity());
    let offsets = [Vec3::X, Vec3::Y, Vec3::Z];
    for node in drawn {
        let selected = s.atlas_selected == Some(node.index);
        let size = if selected {
            0.022
        } else if node.flags == 0 {
            0.005
        } else {
            0.008
        };
        let color = color(node, s.activity.as_ref(), s.atlas_live, selected);
        for indices in [[0, 1, 2], [0, 2, 1]] {
            for sign in [1.0, -1.0] {
                for i in indices {
                    xyz.push((node.position + offsets[i] * size * sign).to_array());
                    colors.push(color);
                }
            }
        }
    }
    if let Some(mesh) = meshes.get_mut(&view.mesh) {
        mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0., 1., 0.]; xyz.len()]);
        mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, xyz);
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    }
}

fn build_edges(s: &Session, points: &Points, view: &mut View, meshes: &mut Assets<Mesh>) {
    let mut lines = Vec::new();
    let mut colors = Vec::new();
    if let Some(sample) = s.activity.as_ref() {
        for edge in sample.edges.iter().take(usize::from(s.atlas_density)) {
            let (Some(a), Some(b)) = (points.get(edge.source), points.get(edge.target)) else {
                continue;
            };
            if !s.atlas_filter.matches(a, Some(sample))
                || !s.atlas_filter.matches(b, Some(sample))
                || s.atlas_selected
                    .is_some_and(|i| i != edge.source && i != edge.target)
            {
                continue;
            }
            let tint = if edge.contribution < 0. {
                [0.53, 0.20, 0.26, 1.]
            } else {
                [0.16, 0.47, 0.40, 1.]
            };
            lines.extend([a.position.to_array(), b.position.to_array()]);
            colors.extend([tint, tint]);
        }
    }
    if let Some(mesh) = meshes.get_mut(&view.edges) {
        mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0., 1., 0.]; lines.len()]);
        mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, lines);
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    }
}

pub fn keyboard(keys: Res<ButtonInput<KeyCode>>, mut s: ResMut<Session>) {
    if !s.atlas_typing || !matches!(s.page, Page::Brain | Page::Split) {
        return;
    }
    for key in keys.get_just_pressed() {
        match key {
            KeyCode::Backspace => {
                s.atlas_query.pop();
            }
            KeyCode::Enter | KeyCode::NumpadEnter => {
                s.find_neuron();
            }
            KeyCode::Escape => {
                s.atlas_typing = false;
            }
            _ => {
                if let Some(digit) =
                    crate::window::digit_key(*key).filter(|_| s.atlas_query.len() < 16)
                {
                    s.atlas_query.push(digit);
                }
            }
        }
    }
}

pub fn update(
    mut s: ResMut<Session>,
    mut view: ResMut<View>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut camera: Query<
        (&Camera, &GlobalTransform, &mut Transform, &mut Projection),
        With<BrainCamera>,
    >,
    canvas: Query<(&ComputedNode, &UiGlobalTransform), With<AtlasCanvas>>,
    window: Query<&Window, With<PrimaryWindow>>,
    mouse: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    if !matches!(s.page, Page::Brain | Page::Split) {
        return;
    }
    let Some(points) = &s.points else { return };
    if view.center_revision != s.atlas_center || view.revision != s.revision {
        view.center_revision = s.atlas_center;
        view.yaw = 0.35;
        view.pitch = 0.15;
        view.zoom = 1.0;
        view.pan = Vec3::ZERO;
    }
    let revision = s.activity.as_ref().map(|a| a.values.as_ptr() as usize);
    let changed = view.revision != s.revision
        || view.filter != s.atlas_filter
        || view.selection != s.atlas_selected
        || view.quality != s.atlas_quality
        || view.color_by_activity != s.atlas_live;
    if changed || (view.activity != revision && (s.atlas_live || s.atlas_filter == Filter::Active))
    {
        build_points(&s, points, &mut view, &mut meshes);
    }
    if changed || view.activity != revision {
        build_edges(&s, points, &mut view, &mut meshes);
    }
    view.revision = s.revision;
    view.activity = revision;
    view.filter = s.atlas_filter;
    view.selection = s.atlas_selected;
    view.quality = s.atlas_quality;
    view.color_by_activity = s.atlas_live;
    let Ok((camera, global, mut transform, mut projection)) = camera.single_mut() else {
        return;
    };
    let mut picked = None;
    let mut moved = false;
    if let (Ok((node, at)), Ok(window)) = (canvas.single(), window.single())
        && let Some(cursor) = window.physical_cursor_position()
        && (cursor - at.translation)
            .abs()
            .cmple(node.size() / 2.0)
            .all()
        && s.menu.is_none()
    {
        if mouse.just_pressed(MouseButton::Left) {
            view.dragging = 0.;
        }
        if mouse.pressed(MouseButton::Left) {
            view.dragging += motion.delta.length();
            if view.dragging > 4. && motion.delta != Vec2::ZERO {
                if keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight) {
                    view.pan += (*transform.left() * motion.delta.x
                        + *transform.up() * motion.delta.y)
                        * 0.003;
                } else {
                    if s.atlas_preset != Preset::Orbit {
                        moved = true;
                    }
                    view.yaw -= motion.delta.x * 0.007;
                    view.pitch = (view.pitch + motion.delta.y * 0.007).clamp(-1.4, 1.4);
                }
            }
        }
        if mouse.just_released(MouseButton::Left)
            && view.dragging < 4.0
            && let Some(cursor) = window.cursor_position()
        {
            picked = Some(
                view.drawn
                    .iter()
                    .filter_map(|&i| {
                        let n = points.get(i)?;
                        let at = camera.world_to_viewport(global, n.position).ok()?;
                        let distance = at.distance_squared(cursor);
                        (distance < 13.0 * 13.0).then_some((distance, i))
                    })
                    .min_by(|a, b| a.0.total_cmp(&b.0))
                    .map(|(_, i)| i),
            );
        }
        view.zoom = (view.zoom * (scroll.delta.y * 0.12).exp()).clamp(0.3, 5.0);
    }
    let zoom = (view.zoom * s.atlas_zoom).clamp(0.3, 5.0);
    let pivot = s
        .atlas_focus
        .and_then(|i| points.get(i))
        .map_or(Vec3::ZERO, |n| n.position)
        + view.pan;
    let preset = if moved { Preset::Orbit } else { s.atlas_preset };
    let perspective = preset == Preset::Orbit;
    let (offset, up) = match preset {
        Preset::Orbit => (
            Quat::from_euler(EulerRot::YXZ, view.yaw, view.pitch, 0.) * Vec3::Z * (2.6 / zoom),
            Vec3::Y,
        ),
        Preset::Xy => (Vec3::Z * 3., Vec3::Y),
        Preset::Yz => (Vec3::X * 3., Vec3::Y),
        Preset::Xz => (Vec3::Y * 3., Vec3::NEG_Z),
    };
    *transform = Transform::from_translation(pivot + offset).looking_at(pivot, up);
    if perspective {
        if !matches!(&*projection, Projection::Perspective(_)) {
            *projection = Projection::Perspective(PerspectiveProjection::default());
        }
    } else {
        let viewport_height = 2.5 / zoom;
        if !matches!(&*projection, Projection::Orthographic(value) if
            matches!(value.scaling_mode, ScalingMode::FixedVertical{viewport_height: h} if h == viewport_height))
        {
            *projection = Projection::Orthographic(OrthographicProjection {
                scaling_mode: ScalingMode::FixedVertical { viewport_height },
                ..OrthographicProjection::default_3d()
            });
        }
    }
    if moved {
        s.atlas_preset = Preset::Orbit;
    }
    if let Some(index) = picked {
        s.atlas_selected = index;
        s.atlas_typing = false;
    }
}
