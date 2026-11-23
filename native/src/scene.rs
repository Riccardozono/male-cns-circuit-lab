use crate::{
    engine::Car,
    window::{Action, CameraMode, Page, Session},
};
use bevy::{
    app::AppExit,
    camera::{
        ScalingMode,
        visibility::{RenderLayers, VisibilityRange},
    },
    gltf::GltfAssetLabel,
    gltf::{Gltf, GltfMesh},
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    prelude::*,
    render::{
        renderer::RenderAdapterInfo,
        view::screenshot::{Screenshot, save_to_disk},
    },
    window::PrimaryWindow,
};
use std::{collections::HashMap, fs, path::PathBuf, time::Instant};

#[derive(Component)]
pub(crate) struct CircuitSurface;

#[derive(Component)]
pub(crate) struct CameraRig;

#[derive(Component)]
pub(crate) struct Agent(usize);

#[derive(Component)]
pub(crate) struct Porsche;

#[derive(Component)]
pub(crate) struct Cockpit;

#[derive(Component)]
pub(crate) struct SteeringWheel;

#[derive(Resource, Default)]
pub(crate) struct Geometry {
    revision: u64,
    origin: Vec3,
    view_radius: f32,
}

#[derive(Resource, Default)]
pub(crate) struct TrackView {
    revision: u64,
    camera: CameraMode,
    reset: u64,
    yaw: f32,
    pitch: f32,
    pan: Vec3,
}

pub fn view_input(
    mut session: ResMut<Session>,
    mut view: ResMut<TrackView>,
    bounds: Res<Geometry>,
    canvas: Query<(&ComputedNode, &UiGlobalTransform), With<crate::dashboard::TrackCanvas>>,
    window: Query<&Window, With<PrimaryWindow>>,
    camera: Query<(&Camera, &GlobalTransform), With<CameraRig>>,
    buttons: Query<&Interaction, With<Button>>,
    mouse: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    if view.revision != session.revision
        || view.camera != session.camera
        || view.reset != session.camera_reset
    {
        *view = TrackView {
            revision: session.revision,
            camera: session.camera,
            reset: session.camera_reset,
            ..default()
        };
    }
    let (Ok((node, transform)), Ok(window)) = (canvas.single(), window.single()) else {
        return;
    };
    let Some(cursor) = window.physical_cursor_position() else {
        return;
    };
    if session.menu.is_some()
        || !matches!(session.page, Page::Session | Page::Split)
        || !(cursor - transform.translation)
            .abs()
            .cmple(node.size() / 2.0)
            .all()
    {
        return;
    }
    if mouse.just_released(MouseButton::Left)
        && !buttons.iter().any(|i| *i != Interaction::None)
        && let (Some(frame), Ok((camera, transform)), Some(cursor)) =
            (&session.frame, camera.single(), window.cursor_position())
    {
        let picked = frame
            .cars
            .iter()
            .enumerate()
            .filter_map(|(i, car)| {
                let position = point(car, bounds.origin);
                let pixel = camera.world_to_viewport(transform, position).ok()?;
                let distance = pixel.distance_squared(cursor);
                (distance < 18.0 * 18.0).then_some((distance, i))
            })
            .min_by(|a, b| a.0.total_cmp(&b.0))
            .map(|(_, i)| i);
        if let Some(selected) = picked {
            session.selected = Some(selected);
        }
    }
    if scroll.delta.y != 0.0 {
        session.zoom = (session.zoom * (scroll.delta.y * 0.12).exp()).clamp(0.5, 6.0);
    }
    if mouse.pressed(MouseButton::Right) {
        if session.camera == CameraMode::Overview {
            view.yaw -= motion.delta.x * 0.006;
            view.pitch = (view.pitch + motion.delta.y * 0.004).clamp(-0.62, 0.65);
        } else if session.camera == CameraMode::Cockpit {
            view.yaw = (view.yaw + motion.delta.x * 0.0035).clamp(-1.1, 1.1);
            view.pitch = (view.pitch - motion.delta.y * 0.0035).clamp(-0.55, 0.5);
        } else if session.camera == CameraMode::Map {
            let meters = bounds.view_radius / (node.size().y.max(1.0) * session.zoom);
            view.pan -= Vec3::new(motion.delta.x, 0.0, motion.delta.y) * meters;
        }
    }
}

#[derive(Resource)]
pub(crate) struct Model {
    detailed: Handle<Scene>,
    gltf: Handle<Gltf>,
}

pub fn setup_fleet(
    mut commands: Commands,
    model: Res<Model>,
    gltfs: Res<Assets<Gltf>>,
    gltf_meshes: Res<Assets<GltfMesh>>,
    agents: Query<Entity, With<Agent>>,
    mut loaded: Local<bool>,
) {
    if *loaded {
        return;
    }
    let Some(gltf) = gltfs.get(&model.gltf) else {
        return;
    };
    let parts = gltf
        .named_meshes
        .iter()
        .filter(|(name, _)| name.starts_with("lod2-"))
        .map(|(_, handle)| gltf_meshes.get(handle))
        .collect::<Option<Vec<_>>>();
    let Some(parts) = parts else { return };
    let parts: Vec<_> = parts
        .iter()
        .flat_map(|mesh| &mesh.primitives)
        .filter_map(|part| Some((part.mesh.clone(), part.material.clone()?)))
        .collect();
    if parts.is_empty() {
        return;
    }
    for entity in &agents {
        commands.entity(entity).with_children(|parent| {
            for (mesh, material) in &parts {
                parent.spawn((Mesh3d(mesh.clone()), MeshMaterial3d(material.clone())));
            }
        });
    }
    *loaded = true;
}

pub(crate) const DECOR_ASSETS: [(&str, &[u8]); 5] = [
    (
        "tree",
        include_bytes!("../../outputs/assets/trees-supplied-v1.glb"),
    ),
    (
        "european",
        include_bytes!("../../outputs/assets/trees-european-v1.glb"),
    ),
    (
        "oak",
        include_bytes!("../../outputs/assets/tree-oak-v1.glb"),
    ),
    (
        "monaco",
        include_bytes!("../../outputs/assets/monaco-building-v1.glb"),
    ),
    (
        "le-mans",
        include_bytes!("../../outputs/assets/le-mans-house-v1.glb"),
    ),
];

#[derive(Resource)]
pub(crate) struct Decor(HashMap<&'static str, Handle<Gltf>>);

#[derive(Component)]
pub(crate) struct PropMesh;

pub fn decorate(
    mut commands: Commands,
    session: Res<Session>,
    decor: Res<Decor>,
    gltfs: Res<Assets<Gltf>>,
    primitives: Res<Assets<GltfMesh>>,
    existing: Query<Entity, With<PropMesh>>,
    mut revision: Local<u64>,
) {
    if *revision == session.revision {
        return;
    }
    let Some(layout) = &session.decoration else {
        return;
    };
    let mut batches = HashMap::new();
    for prop in &layout.props {
        if batches.contains_key(prop.asset.as_str()) {
            continue;
        }
        let Some(file) = decor
            .0
            .get(prop.asset.as_str())
            .and_then(|id| gltfs.get(id))
        else {
            return;
        };
        let nodes = file
            .meshes
            .iter()
            .map(|mesh| primitives.get(mesh))
            .collect::<Option<Vec<_>>>();
        let Some(nodes) = nodes else {
            return;
        };
        batches.insert(prop.asset.as_str(), nodes);
    }
    for entity in &existing {
        commands.entity(entity).despawn();
    }
    for prop in &layout.props {
        let transform = Transform::from_translation(Vec3::from_array(prop.position))
            .with_rotation(Quat::from_rotation_y(prop.yaw))
            .with_scale(Vec3::splat(prop.scale));
        let threshold = if matches!(prop.asset.as_str(), "monaco" | "le-mans") {
            230.
        } else {
            130.
        };
        for (lod, ids) in prop.meshes.iter().enumerate() {
            let limit = if lod == 0 {
                VisibilityRange::abrupt(0., threshold)
            } else {
                VisibilityRange::abrupt(threshold, 18000.)
            };
            for index in ids {
                let Some(mesh) = batches[prop.asset.as_str()].get(*index) else {
                    continue;
                };
                for part in &mesh.primitives {
                    let Some(material) = &part.material else {
                        continue;
                    };
                    commands.spawn((
                        PropMesh,
                        Mesh3d(part.mesh.clone()),
                        MeshMaterial3d(material.clone()),
                        RenderLayers::layer(1),
                        transform,
                        limit.clone(),
                    ));
                }
            }
        }
    }
    *revision = session.revision;
}

pub fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut gizmo_config: ResMut<GizmoConfigStore>,
) {
    let (gizmos, _) = gizmo_config.config_mut::<DefaultGizmoConfigGroup>();
    gizmos.render_layers = RenderLayers::layer(0);
    gizmos.depth_bias = -1.;
    commands.init_resource::<TrackView>();
    commands.insert_resource(Geometry::default());
    let porsche = assets.load(GltfAssetLabel::Scene(0).from_asset("embedded://porsche.glb"));
    commands.insert_resource(Model {
        detailed: porsche.clone(),
        gltf: assets.load("embedded://porsche.glb"),
    });
    commands.spawn((Porsche, SceneRoot(porsche), Visibility::Hidden));
    commands.insert_resource(Decor(
        DECOR_ASSETS
            .into_iter()
            .map(|(id, _)| (id, assets.load(format!("embedded://{id}.glb"))))
            .collect(),
    ));
    commands.spawn((
        Camera3d::default(),
        Camera {
            order: 1,
            clear_color: Color::srgb(0.64, 0.76, 0.85).into(),
            ..default()
        },
        Projection::Perspective(PerspectiveProjection {
            near: 0.05,
            far: 30_000.0,
            ..default()
        }),
        Transform::from_xyz(450.0, 380.0, 370.0).looking_at(Vec3::ZERO, Vec3::Y),
        CameraRig,
        RenderLayers::from_layers(&[0, 1]),
    ));
    commands.spawn((
        RenderLayers::from_layers(&[0, 1, 3]),
        DirectionalLight {
            illuminance: 14_000.0,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::YXZ, -1.0, -0.75, 0.0)),
    ));
    cockpit_model(&mut commands, &mut meshes, &mut materials);
    for id in 0..100 {
        commands.spawn((Agent(id), Transform::default(), Visibility::Hidden));
    }
}

fn cockpit_model(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
) {
    let material = |r, g, b| StandardMaterial {
        base_color: Color::srgb_u8(r, g, b),
        perceptual_roughness: 0.7,
        ..default()
    };
    let dash = materials.add(material(23, 30, 37));
    let trim = materials.add(material(74, 85, 96));
    commands
        .spawn((Cockpit, Transform::default(), Visibility::Hidden))
        .with_children(|p| {
            p.spawn((
                Mesh3d(meshes.add(Cuboid::new(0.32, 0.12, 1.38))),
                MeshMaterial3d(dash.clone()),
                Transform::from_xyz(0.64, 0.64, 0.0),
            ));
            p.spawn((
                Mesh3d(meshes.add(Cuboid::new(0.20, 0.19, 0.26))),
                MeshMaterial3d(trim.clone()),
                Transform::from_xyz(0.60, 0.70, -0.32),
            ));
            p.spawn((
                SteeringWheel,
                Transform::from_xyz(0.43, 0.70, -0.32),
                Visibility::Inherited,
            ))
            .with_children(|p| {
                p.spawn((
                    Mesh3d(meshes.add(Torus::new(0.149, 0.191))),
                    MeshMaterial3d(dash.clone()),
                    Transform::from_rotation(Quat::from_rotation_z(std::f32::consts::FRAC_PI_2)),
                ));
                let spoke = meshes.add(Cuboid::new(0.035, 0.026, 0.17));
                for angle in [
                    0.,
                    std::f32::consts::TAU / 3.,
                    std::f32::consts::TAU * 2. / 3.,
                ] {
                    p.spawn((
                        Mesh3d(spoke.clone()),
                        MeshMaterial3d(trim.clone()),
                        Transform::from_xyz(0., angle.sin() * 0.075, angle.cos() * 0.075)
                            .with_rotation(Quat::from_rotation_x(-angle)),
                    ));
                }
                p.spawn((
                    Mesh3d(meshes.add(Cuboid::new(0.05, 0.07, 0.07))),
                    MeshMaterial3d(dash),
                ));
            });
        });
}

fn point(car: &Car, origin: Vec3) -> Vec3 {
    Vec3::new(
        car.x as f32 - origin.x,
        car.elevation as f32 + 0.10,
        car.z as f32 - origin.z,
    )
}

fn car_transform(car: &Car, origin: Vec3, lift: f32) -> Transform {
    let body = Quat::from_euler(
        EulerRot::XYZ,
        car.roll.clamp(-0.10, 0.10),
        0.0,
        -car.pitch.clamp(-0.09, 0.09),
    );
    Transform::from_translation(point(car, origin) + Vec3::Y * lift)
        .with_rotation(Quat::from_rotation_y(-(car.heading as f32)) * body)
}

pub fn update(
    mut commands: Commands,
    session: Res<Session>,
    mut geometry: ResMut<Geometry>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    view: Res<TrackView>,
    surfaces: Query<Entity, With<CircuitSurface>>,
    mut track_materials: ResMut<Assets<crate::scenery::TrackMaterial>>,
    mut transforms: ParamSet<(
        Query<
            (
                &mut Transform,
                &mut RenderLayers,
                &mut Camera,
                &mut Projection,
            ),
            With<CameraRig>,
        >,
        Query<(&Agent, &mut Transform, &mut Visibility)>,
        Query<(&mut Transform, &mut Visibility), With<Porsche>>,
        Query<(&mut Transform, &mut Visibility), With<Cockpit>>,
        Query<&mut Transform, With<SteeringWheel>>,
    )>,
    mut lods: Query<
        (&Name, &mut Visibility),
        (
            Added<Name>,
            Without<Agent>,
            Without<Porsche>,
            Without<Cockpit>,
        ),
    >,
    mut gizmos: Gizmos,
) {
    for (name, mut visibility) in &mut lods {
        if matches!(name.as_str(), "LOD1" | "LOD2") {
            *visibility = Visibility::Hidden;
        }
    }
    let (Some(track), Some(frame)) = (&session.track, &session.frame) else {
        return;
    };
    if geometry.revision != session.revision {
        for entity in &surfaces {
            commands.entity(entity).despawn();
        }
        geometry.revision = session.revision;
        geometry.origin = Vec3::new(
            track.bounds.x + track.bounds.width / 2.0,
            0.0,
            track.bounds.y + track.bounds.height / 2.0,
        );
        geometry.view_radius = track.bounds.width.max(track.bounds.height);
        match crate::scenery::load(&session.setup.circuit) {
            Ok(scenery) => {
                let base = StandardMaterial {
                    perceptual_roughness: 0.94,
                    cull_mode: None,
                    double_sided: true,
                    ..default()
                };
                let mat = materials.add(base.clone());
                let mut styles = HashMap::new();
                for layer in scenery.layers {
                    let render_layers = match layer.role {
                        0 => RenderLayers::layer(0),
                        1 | 3 => RenderLayers::from_layers(&[1, 3]),
                        _ => RenderLayers::layer(1),
                    };
                    let mut surface = commands.spawn((
                        CircuitSurface,
                        Mesh3d(meshes.add(layer.mesh)),
                        render_layers,
                    ));
                    if layer.style == 0 {
                        surface.insert(MeshMaterial3d(mat.clone()));
                    } else {
                        let material = styles.entry(layer.style).or_insert_with(|| {
                            track_materials.add(crate::scenery::TrackMaterial {
                                base: base.clone(),
                                extension: crate::scenery::SurfaceDetail {
                                    style: layer.style,
                                    scale: scenery.scale,
                                },
                            })
                        });
                        surface.insert(MeshMaterial3d(material.clone()));
                    }
                }
            }
            Err(error) => error!(
                "Impossibile disegnare la scena {}: {error}",
                session.setup.circuit
            ),
        }
    }

    let selected = session.selected_car();
    let car = &frame.cars[selected];
    let origin = geometry.origin;
    let position = point(car, origin);
    let heading = car.heading as f32;
    let forward = Vec3::new(heading.cos(), 0.0, heading.sin());
    let cockpit = session.camera == CameraMode::Cockpit;
    for (agent, mut transform, mut visibility) in &mut transforms.p1() {
        if let Some(visible) = frame.cars.get(agent.0).filter(|car| {
            car.alive && agent.0 != selected && point(car, origin).distance_squared(position) > 19.0
        }) {
            *transform = car_transform(visible, origin, 0.0);
            *visibility = Visibility::Visible;
        } else {
            *visibility = Visibility::Hidden;
        }
    }
    if let Ok((mut transform, mut visibility)) = transforms.p2().single_mut() {
        *transform = car_transform(car, origin, 0.0);
        *visibility = if cockpit {
            Visibility::Hidden
        } else {
            Visibility::Visible
        };
    }
    if let Ok((mut transform, mut visibility)) = transforms.p3().single_mut() {
        *visibility = if cockpit {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
        if cockpit {
            *transform = car_transform(car, origin, 0.0);
            if let Ok(mut wheel) = transforms.p4().single_mut() {
                wheel.rotation = Quat::from_rotation_x(-car.steering_angle * 10.0);
            }
        }
    }
    let zoom = session.zoom.max(0.5);
    let landmark = session.landmark.and_then(|i| track.landmarks.get(i));
    let focus = landmark.map(|point| Vec3::from_array(point.point) - origin);
    let camera_center = focus.unwrap_or(Vec3::ZERO);
    let view_radius = if focus.is_some() {
        geometry.view_radius.min(200.)
    } else {
        geometry.view_radius
    };
    let (eye, target, up) = match session.camera {
        CameraMode::Overview => {
            let yaw = landmark.and_then(|p| p.yaw).unwrap_or(2.3);
            let pitch = landmark.and_then(|p| p.pitch).unwrap_or(0.9);
            let distance =
                landmark.map_or(view_radius * 1.12, |point| point.distance.unwrap_or(95.));
            (
                Quat::from_euler(EulerRot::YXZ, view.yaw + yaw, view.pitch - pitch, 0.0)
                    * Vec3::Z
                    * distance
                    / zoom
                    + camera_center,
                camera_center,
                Vec3::Y,
            )
        }
        CameraMode::Map => (
            view.pan + camera_center + Vec3::Y * geometry.view_radius * 1.39,
            view.pan + camera_center,
            Vec3::NEG_Z,
        ),
        CameraMode::Follow => (
            position + (-forward * 13.0 + Vec3::Y * 5.8) / zoom,
            position + forward * 6.0,
            Vec3::Y,
        ),
        CameraMode::Cockpit => {
            let pose = car_transform(car, origin, 0.0);
            let eye = pose.transform_point(Vec3::new(0.10, 1.05, -0.32));
            let look = pose.rotation
                * Vec3::new(
                    view.yaw.cos() * view.pitch.cos(),
                    view.pitch.sin(),
                    view.yaw.sin() * view.pitch.cos(),
                );
            (eye, eye + look * 42.0, pose.rotation * Vec3::Y)
        }
    };
    if let Ok((mut transform, mut layers, mut camera, mut projection)) =
        transforms.p0().single_mut()
    {
        *transform = Transform::from_translation(eye).looking_at(target, up);
        let map = session.camera == CameraMode::Map;
        let next = if map {
            RenderLayers::layer(0)
        } else {
            if session.details {
                RenderLayers::from_layers(&[0, 1])
            } else {
                RenderLayers::from_layers(&[0, 3])
            }
        };
        if *layers != next {
            *layers = next;
        }
        if map {
            let min_width = if focus.is_some() {
                view_radius
            } else {
                track.bounds.width * 1.17
            } / zoom;
            let min_height = if focus.is_some() {
                view_radius * 0.7
            } else {
                track.bounds.height * 1.33
            } / zoom;
            let needs_projection = !matches!(&*projection, Projection::Orthographic(value)
                if matches!(value.scaling_mode, ScalingMode::AutoMin { min_width: w, min_height: h }
                    if w == min_width && h == min_height));
            if needs_projection {
                *projection = Projection::Orthographic(OrthographicProjection {
                    near: 0.1,
                    far: 30_000.0,
                    scaling_mode: ScalingMode::AutoMin {
                        min_width,
                        min_height,
                    },
                    ..OrthographicProjection::default_3d()
                });
            }
        } else {
            let fov = if cockpit {
                (70.0 / zoom).clamp(40.0, 95.0)
            } else {
                48.0_f32
            }
            .to_radians();
            if !matches!(&*projection, Projection::Perspective(value) if value.fov == fov) {
                *projection = Projection::Perspective(PerspectiveProjection {
                    fov,
                    near: 0.05,
                    far: 30_000.0,
                    ..default()
                });
            }
        }
        camera.clear_color = if map {
            Color::srgb_u8(25, 37, 52)
        } else {
            Color::srgb(0.64, 0.76, 0.85)
        }
        .into();
    }
    if session.camera == CameraMode::Map {
        let radius = geometry.view_radius * 0.009 / zoom;
        for (i, car) in frame.cars.iter().enumerate().filter(|(_, car)| car.alive) {
            let center = point(car, origin) + Vec3::Y * 3.0;
            let heading = car.heading as f32;
            let forward = Vec3::new(heading.cos(), 0.0, heading.sin());
            let right = forward.cross(Vec3::Y);
            let color = if i == selected {
                Color::srgb(1.0, 0.70, 0.23)
            } else {
                Color::srgb(0.33, 0.83, 0.82)
            };
            let tip = center + forward * radius * 1.20;
            let left = center + (-forward * 0.7 - right * 0.6) * radius;
            let right = center + (-forward * 0.7 + right * 0.6) * radius;
            gizmos.linestrip([left, tip, right, left], color);
        }
    } else if !cockpit {
        gizmos.circle(
            Isometry3d::new(
                position + Vec3::Y * 0.09,
                Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
            ),
            3.0,
            Color::srgb(1.0, 0.73, 0.28),
        );
    }
    if session.boundaries {
        for boundary in [&track.outer, &track.inner] {
            if let Some(first) = boundary.first() {
                gizmos.linestrip(
                    boundary
                        .iter()
                        .chain(std::iter::once(first))
                        .map(|[x, y, z]| {
                            Vec3::new(*x as f32, *y as f32 + 0.17, *z as f32) - origin
                        }),
                    Color::srgb(0.98, 0.57, 0.15),
                );
            }
        }
    }
    if session.rays
        && !cockpit
        && frame.ray_car == selected
        && let Some((start, ends)) = frame.ray_points.split_first()
    {
        let project = |point: &[f64; 3]| Vec3::from_array(point.map(|v| v as f32)) - origin;
        let start = project(start);
        for end in ends {
            gizmos.line(start, project(end), Color::srgb(0.96, 0.49, 0.30));
        }
    }
}

#[derive(Resource)]
pub struct Smoke {
    directory: PathBuf,
    start: Instant,
    step: u8,
    phase: Instant,
    drive: Option<(Instant, f64)>,
    motion: Option<(f64, f64, f64, f64)>,
    session_clock: Option<(u64, f64)>,
}
impl Smoke {
    pub fn new(directory: PathBuf) -> Self {
        let now = Instant::now();
        Self {
            directory,
            start: now,
            step: 0,
            phase: now,
            drive: None,
            motion: None,
            session_clock: None,
        }
    }
}

pub fn verify_window(
    mut commands: Commands,
    mut session: ResMut<Session>,
    model: Res<Model>,
    assets: Res<AssetServer>,
    adapter: Res<RenderAdapterInfo>,
    comparison: Res<crate::comparison::Comparison>,
    clouds: Query<(), With<crate::atlas::Cloud>>,
    scenery: Query<(), With<PropMesh>>,
    window: Query<Entity, With<PrimaryWindow>>,
    mut key_events: MessageWriter<bevy::input::keyboard::KeyboardInput>,
    mut smoke: ResMut<Smoke>,
    mut exit: MessageWriter<AppExit>,
) {
    let directory = smoke.directory.clone();
    let picture = |name: &str| directory.join(format!("{name}.png"));
    let ready = |name: &str| fs::metadata(picture(name)).is_ok_and(|entry| entry.len() > 5000);
    let capture = |commands: &mut Commands, name: &str| {
        commands
            .spawn(Screenshot::primary_window())
            .observe(save_to_disk(picture(name)));
    };
    if smoke.start.elapsed().as_secs() > 150
        || session.frame.is_none() && !session.message.is_empty()
    {
        eprintln!(
            "Prova Windows non completata, fase {}: {}",
            smoke.step, session.message
        );
        exit.write(AppExit::error());
        return;
    }
    let Some(frame) = session.frame.as_ref() else {
        return;
    };
    if session.profile.is_training() {
        match smoke.step {
            0 if assets.is_loaded_with_dependencies(model.detailed.id()) => {
                if session.running || frame.elapsed != 0. {
                    eprintln!("Avvio del profilo V3 non valido: {}", session.message);
                    exit.write(AppExit::error());
                    return;
                }
                fs::create_dir_all(&directory).expect("Cartella prova del profilo V3");
                capture(&mut commands, "native-v3-training");
                smoke.session_clock = Some((frame.generation, frame.elapsed));
                smoke.step = 1;
            }
            1 if ready("native-v3-training") => {
                session.smoke_action.push(Action::Run);
                smoke.step = 2;
            }
            2 if session.running && frame.elapsed >= 0.25 => {
                let (generation, elapsed) = smoke.session_clock.unwrap();
                let report = serde_json::json!({
                    "passed": true,
                    "pausedAtStartup": true,
                    "generationAtStartup": generation,
                    "elapsedAtStartup": elapsed,
                    "startupWarning": session.message,
                    "elapsedAfterResume": frame.elapsed,
                    "profile": session.profile.label(),
                    "modelId": session.setup.model,
                    "circuitId": session.setup.circuit,
                    "workerCount": frame.worker_count,
                    "population": frame.cars.len(),
                    "backend": format!("{:?}", adapter.backend),
                });
                fs::write(directory.join("smoke.json"), report.to_string())
                    .expect("Rapporto del profilo V3");
                exit.write(AppExit::Success);
            }
            _ => {}
        }
        return;
    }
    match smoke.step {
        0 if assets.is_loaded_with_dependencies(model.detailed.id()) && session.running => {
            smoke.drive = Some((Instant::now(), frame.elapsed));
            smoke.step = 1;
        }
        1 if frame.elapsed >= smoke.drive.unwrap().1 + 6.0 => {
            let car = &frame.cars[frame.leader];
            if car.speed < 2.0 || car.progress < 6.0 {
                eprintln!("Nessun avanzamento fisico sufficiente a Monza");
                exit.write(AppExit::error());
                return;
            }
            let _ = fs::create_dir_all(&smoke.directory);
            capture(&mut commands, "native-scene");
            let wall = smoke.drive.unwrap().0.elapsed().as_secs_f64();
            let motion = (
                frame.elapsed - smoke.drive.unwrap().1,
                car.speed * 3.6,
                car.progress,
                wall,
            );
            session.running = false;
            smoke.motion = Some(motion);
            smoke.step = 2;
        }
        2 if ready("native-scene") && !session.request => {
            smoke.session_clock = Some((frame.generation, frame.elapsed));
            session.smoke_action.push(Action::Page(Page::Split));
            smoke.phase = Instant::now();
            smoke.step = 3;
        }
        3 if session.page == Page::Split
            && !clouds.is_empty()
            && session.activity.as_ref().is_some_and(|sample| {
                !sample.edges.is_empty() && sample.values.iter().any(|v| v.abs() > 0.002)
            })
            && smoke.phase.elapsed().as_millis() > 750 =>
        {
            capture(&mut commands, "native-split");
            smoke.step = 4;
        }
        4 if ready("native-split") => {
            session.smoke_action.push(Action::Page(Page::Compare));
            smoke.step = 5;
        }
        5 if session.page == Page::Compare => {
            session.smoke_action.push(Action::LimitEnter);
            session.smoke_action.push(Action::Compare);
            smoke.step = 6;
        }
        6 if comparison.rows[0].elapsed > 0. => {
            session
                .smoke_action
                .push(Action::SetDriver(crate::engine::Driver::Straight));
            smoke.phase = Instant::now();
            smoke.step = 60;
        }
        60 if smoke.phase.elapsed().as_millis() > 240 => {
            if session.running || session.setup.driver != crate::engine::Driver::Connectome {
                eprintln!("La diagnostica ha riattivato la prova durante il confronto");
                exit.write(AppExit::error());
                return;
            }
            session.smoke_action.push(Action::StopComparison);
            smoke.step = 7;
        }
        7 if !comparison.running => {
            if smoke.session_clock != Some((frame.generation, frame.elapsed)) {
                eprintln!("Il confronto ha alterato la sessione di guida");
                exit.write(AppExit::error());
                return;
            }
            session.smoke_action.push(Action::LimitEnter);
            smoke.step = 71;
        }
        71 if session.comparison_limit_edit.is_some() => {
            use bevy::input::{
                ButtonState,
                keyboard::{Key, KeyboardInput, NativeKey},
            };
            let Ok(window) = window.single() else {
                return;
            };
            for key_code in [KeyCode::Digit1, KeyCode::Digit2, KeyCode::Enter] {
                key_events.write(KeyboardInput {
                    key_code,
                    logical_key: Key::Unidentified(NativeKey::Unidentified),
                    state: ButtonState::Pressed,
                    text: None,
                    repeat: false,
                    window,
                });
            }
            smoke.step = 72;
        }
        72 if session.comparison_limit == 12 && session.comparison_limit_edit.is_none() => {
            capture(&mut commands, "native-compare");
            smoke.step = 8;
        }
        8 if ready("native-compare") => {
            session.smoke_action.push(Action::Page(Page::Session));
            smoke.step = 9;
        }
        9 if session.page == Page::Session => {
            session.smoke_action.push(Action::Map);
            session.smoke_action.push(Action::Theme);
            smoke.phase = Instant::now();
            smoke.step = 10;
        }
        10 if session.camera == CameraMode::Map
            && session.dark
            && smoke.phase.elapsed().as_millis() > 600 =>
        {
            capture(&mut commands, "native-map-dark");
            smoke.step = 11;
        }
        11 if ready("native-map-dark") => {
            session.smoke_action.push(Action::Scene);
            smoke.step = 12;
        }
        12 if session.camera == CameraMode::Follow => {
            session.smoke_action.push(Action::Camera);
            session.smoke_action.push(Action::SetSpeed(60));
            session.smoke_action.push(Action::Run);
            smoke.phase = Instant::now();
            smoke.step = 13;
        }
        13 if session.camera == CameraMode::Cockpit
            && session.setup.speed == 30.0
            && session.running
            && frame.elapsed >= smoke.session_clock.unwrap().1 + 1.1
            && smoke.phase.elapsed().as_millis() > 1150 =>
        {
            capture(&mut commands, "native-cockpit");
            smoke.step = 14;
        }
        14 if ready("native-cockpit") => {
            session.smoke_action.push(Action::Run);
            session
                .smoke_action
                .push(Action::Menu(crate::menus::Menu::Driver));
            smoke.phase = Instant::now();
            smoke.step = 15;
        }
        15 if session.menu == Some(crate::menus::Menu::Driver)
            && smoke.phase.elapsed().as_millis() > 440 =>
        {
            capture(&mut commands, "native-menu");
            smoke.step = 16;
        }
        16 if ready("native-menu") => {
            session.smoke_action.push(Action::SetSpeed(2));
            session
                .smoke_action
                .push(Action::SetDriver(crate::engine::Driver::Off));
            smoke.step = 17;
        }
        17 if session.setup.driver == crate::engine::Driver::Off && frame.elapsed > 0.45 => {
            if frame
                .cars
                .iter()
                .any(|car| car.outputs != [0., 0., 0.] || car.speed != 0.)
            {
                eprintln!("La diagnostica a cervello spento ha mosso l'auto");
                exit.write(AppExit::error());
                return;
            }
            session
                .smoke_action
                .push(Action::SetDriver(crate::engine::Driver::Straight));
            smoke.step = 18;
        }
        18 if session.setup.driver == crate::engine::Driver::Straight && frame.elapsed > 0.45 => {
            if !frame
                .cars
                .iter()
                .any(|car| car.outputs == [0., 0.7, 0.] && car.speed > 0.)
            {
                eprintln!("La diagnostica a sterzo zero non ha mosso l'auto");
                exit.write(AppExit::error());
                return;
            }
            session.smoke_action.push(Action::Evolve);
            session.smoke_action.push(Action::Save);
            smoke.phase = Instant::now();
            smoke.step = 61;
        }
        61 if smoke.phase.elapsed().as_millis() > 360 => {
            if session.busy || frame.generation != 1 || !frame.history.is_empty() {
                eprintln!("Evoluzione o salvataggio consentiti durante la diagnostica");
                exit.write(AppExit::error());
                return;
            }
            session.smoke_action.push(Action::SetModel(0));
            smoke.step = 19;
        }
        19 if session.setup.model == "v2" => {
            session.smoke_action.push(Action::SetPopulation(17));
            smoke.step = 20;
        }
        20 if !session.busy && session.setup.population == 17 && frame.cars.len() == 17 => {
            session.smoke_action.push(Action::SetPopulation(99));
            smoke.step = 21;
        }
        21 if !session.busy && session.setup.population == 99 && frame.cars.len() == 99 => {
            session.smoke_action.push(Action::SetPopulation(4));
            smoke.step = 22;
        }
        22 if !session.busy && session.setup.population == 4 => {
            session.smoke_action.push(Action::SetCircuit(1));
            session
                .smoke_action
                .push(Action::SetCamera(CameraMode::Overview));
            session.smoke_action.push(Action::Theme);
            smoke.phase = Instant::now();
            smoke.step = 23;
        }
        23 if !session.busy
            && session.setup.circuit == "monaco"
            && !scenery.is_empty()
            && smoke.phase.elapsed().as_millis() > 1_400 =>
        {
            capture(&mut commands, "native-monaco-coast");
            smoke.step = 24;
        }
        24 if ready("native-monaco-coast") => {
            let (elapsed, speed, progress, wall) = smoke.motion.unwrap();
            let report = serde_json::json!({
                "passed":true,"cars":99,"elapsed":elapsed,"leaderKmh":speed,
                "leaderMeters":progress,"wallSecondsAfterAssetReady":wall,"comparisonPreservedSession":true,"liveAtlas":true,"atlasSignedEdges":true,
                "screens":["native-scene.png","native-split.png","native-compare.png","native-map-dark.png","native-cockpit.png","native-menu.png","native-monaco-coast.png"],
                "testedPopulationValues":[17,99],"diagnostics":["off","straight"],"diagnosticEvolutionBlocked":true,"diagnosticSaveBlocked":true,"comparisonFocusedLimitPreserved":true,"comparisonOrderedNumberInput":true,
                "backend":format!("{:?}",adapter.backend),"adapter":adapter.name,
            });
            fs::write(smoke.directory.join("smoke.json"), report.to_string())
                .expect("Rapporto nativo");
            exit.write(AppExit::Success);
        }
        _ => {}
    }
}
