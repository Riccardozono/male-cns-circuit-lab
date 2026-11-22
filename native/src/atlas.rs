use crate::{
    dashboard::AtlasCanvas,
    window::{Page, Session},
};
use bevy::{
    asset::RenderAssetUsages,
    camera::visibility::RenderLayers,
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    mesh::PrimitiveTopology,
    prelude::*,
    window::PrimaryWindow,
};

pub type Points = Vec<[f32; 4]>;

#[derive(Component)]
pub(crate) struct BrainCamera;
#[derive(Component)]
pub(crate) struct Cloud;
#[derive(Resource)]
pub(crate) struct View {
    revision: u64,
    yaw: f32,
    pitch: f32,
    zoom: f32,
    center_revision: u64,
    mesh: Option<Handle<Mesh>>,
    colors_from: Option<usize>,
}

pub fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(20.0).mesh().uv(16, 8))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb_u8(12, 18, 26),
            cull_mode: None,
            unlit: true,
            ..default()
        })),
        RenderLayers::layer(2),
    ));
    commands.insert_resource(View {
        revision: 0,
        yaw: 0.35,
        pitch: 0.15,
        zoom: 1.0,
        center_revision: 0,
        mesh: None,
        colors_from: None,
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
        RenderLayers::layer(2),
        Transform::from_xyz(0.4, 0.15, 2.8).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

fn point_colors(points: &Points, activity: Option<&[f32]>) -> Vec<[f32; 4]> {
    let palette = [
        [0.22, 0.40, 0.48, 1.0],
        [1.0, 0.35, 0.11, 1.0],
        [0.47, 0.56, 0.95, 1.0],
        [0.93, 0.68, 0.26, 1.0],
    ];
    points
        .iter()
        .enumerate()
        .flat_map(|(index, point)| {
            let color = if let Some(values) = activity {
                let value = values[index];
                let brightness = (value.abs() * 14.0).sqrt().clamp(0.0, 1.0);
                let target = if value >= 0.0 {
                    Vec3::new(0.16, 0.94, 0.77)
                } else {
                    Vec3::new(1.0, 0.22, 0.43)
                };
                Vec3::new(0.08, 0.14, 0.20)
                    .lerp(target, brightness)
                    .extend(1.0)
                    .to_array()
            } else {
                palette[(point[3] as usize).min(3)]
            };
            [color; 12]
        })
        .collect()
}

pub fn update(
    mut commands: Commands,
    session: Res<Session>,
    mut view: ResMut<View>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    clouds: Query<Entity, With<Cloud>>,
    mut camera: Query<&mut Transform, With<BrainCamera>>,
    canvas: Query<(&ComputedNode, &UiGlobalTransform), With<AtlasCanvas>>,
    window: Query<&Window, With<PrimaryWindow>>,
    mouse: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    if !matches!(session.page, Page::Brain | Page::Split) {
        return;
    }
    let Some(points) = &session.points else {
        return;
    };
    if view.center_revision != session.atlas_center {
        view.center_revision = session.atlas_center;
        view.yaw = 0.35;
        view.pitch = 0.15;
        view.zoom = 1.0;
    }
    let activity = session
        .activity
        .as_ref()
        .filter(|(_, values)| session.atlas_live && values.len() == points.len())
        .map(|(_, values)| values.as_slice());
    let colors_from = activity.map(|values| values.as_ptr() as usize);
    if view.revision != session.revision {
        for e in &clouds {
            commands.entity(e).despawn();
        }
        view.revision = session.revision;
        view.colors_from = colors_from;
        view.mesh = None;
        if !points.is_empty() {
            let to_vec = |p: &[f32; 4]| Vec3::new(p[0], -p[1], p[2]);
            let (mut low, mut high) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
            for p in points {
                let q = to_vec(p);
                low = low.min(q);
                high = high.max(q);
            }
            let center = (low + high) * 0.5;
            let size = (high - low).max_element().max(1.0);
            let mut xyz = Vec::with_capacity(points.len() * 12);
            let offsets = [Vec3::X, Vec3::Y, Vec3::Z];
            for p in points {
                let pos = (to_vec(p) - center) / size * 2.15;
                let radius = if p[3] == 0.0 { 0.0045 } else { 0.0065 };
                for v in [[0, 1, 2], [0, 2, 1]] {
                    for sign in [1.0, -1.0] {
                        for i in v {
                            xyz.push((pos + offsets[i] * radius * sign).to_array());
                        }
                    }
                }
            }
            let mut mesh = Mesh::new(
                PrimitiveTopology::TriangleList,
                RenderAssetUsages::default(),
            );
            mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0., 1., 0.]; xyz.len()]);
            mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, xyz);
            mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, point_colors(points, activity));
            let mesh = meshes.add(mesh);
            view.mesh = Some(mesh.clone());
            commands.spawn((
                Cloud,
                Mesh3d(mesh),
                MeshMaterial3d(materials.add(StandardMaterial {
                    unlit: true,
                    cull_mode: None,
                    ..default()
                })),
                RenderLayers::layer(2),
            ));
        }
    }
    if view.colors_from != colors_from {
        view.colors_from = colors_from;
        if let Some(mesh) = view.mesh.as_ref().and_then(|id| meshes.get_mut(id)) {
            mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, point_colors(points, activity));
        }
    }
    if let (Ok((node, transform)), Ok(window)) = (canvas.single(), window.single()) {
        if let Some(cursor) = window.physical_cursor_position() {
            let p = cursor - transform.translation;
            if p.abs().cmple(node.size() / 2.0).all() {
                if mouse.pressed(MouseButton::Left) {
                    view.yaw -= motion.delta.x * 0.007;
                    view.pitch = (view.pitch + motion.delta.y * 0.007).clamp(-1.4, 1.4);
                }
                view.zoom = (view.zoom * (scroll.delta.y * 0.12).exp()).clamp(0.5, 3.5);
            }
        }
    }
    if let Ok(mut camera) = camera.single_mut() {
        let offset = Quat::from_euler(EulerRot::YXZ, view.yaw, view.pitch, 0.0)
            * Vec3::new(0.0, 0.0, 2.8 / view.zoom);
        *camera = Transform::from_translation(offset).looking_at(Vec3::ZERO, Vec3::Y);
    }
}
