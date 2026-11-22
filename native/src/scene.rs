use crate::{
    engine::Car,
    window::{Action, CameraMode, Page, Session},
};
use bevy::{
    app::AppExit,
    camera::{ScalingMode, visibility::RenderLayers},
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
use std::{fs, path::PathBuf, time::Instant};

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
    mouse: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    if view.revision != session.revision || view.camera != session.camera {
        *view = TrackView {
            revision: session.revision,
            camera: session.camera,
            ..default()
        };
    }
    let (Ok((node, transform)), Ok(window)) = (canvas.single(), window.single()) else {
        return;
    };
    let Some(cursor) = window.physical_cursor_position() else {
        return;
    };
    if !matches!(session.page, Page::Session | Page::Split)
        || !(cursor - transform.translation)
            .abs()
            .cmple(node.size() / 2.0)
            .all()
    {
        return;
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

#[derive(Resource)]
pub(crate) struct Woodland {
    meshes: [Handle<Mesh>; 2],
    material: Handle<StandardMaterial>,
}

pub fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut gizmo_config: ResMut<GizmoConfigStore>,
) {
    gizmo_config
        .config_mut::<DefaultGizmoConfigGroup>()
        .0
        .render_layers = RenderLayers::layer(0);
    commands.init_resource::<TrackView>();
    commands.insert_resource(Geometry::default());
    let porsche = assets.load(GltfAssetLabel::Scene(0).from_asset("embedded://porsche.glb"));
    commands.insert_resource(Model {
        detailed: porsche.clone(),
        gltf: assets.load("embedded://porsche.glb"),
    });
    commands.spawn((Porsche, SceneRoot(porsche), Visibility::Hidden));
    let tree_mesh = |mesh| {
        assets.load(
            GltfAssetLabel::Primitive { mesh, primitive: 0 }.from_asset("embedded://trees.glb"),
        )
    };
    commands.insert_resource(Woodland {
        meshes: [tree_mesh(2), tree_mesh(3)],
        material: assets.load(
            GltfAssetLabel::Material {
                index: 0,
                is_scale_inverted: false,
            }
            .from_asset("embedded://trees.glb"),
        ),
    });
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
        RenderLayers::from_layers(&[0, 1]),
        DirectionalLight {
            illuminance: 14_000.0,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::YXZ, -1.0, -0.75, 0.0)),
    ));
    let mut sky = Sphere::new(8000.0).mesh().uv(96, 40);
    let positions = sky
        .attribute(Mesh::ATTRIBUTE_POSITION)
        .and_then(|p| p.as_float3())
        .unwrap();
    let colors: Vec<[f32; 4]> = positions
        .iter()
        .map(|p| {
            let [x, y, z] = *p;
            let elevation = (y / 8000.0).clamp(0.0, 1.0).sqrt();
            let horizon = Vec3::new(0.65, 0.78, 0.88);
            let zenith = Vec3::new(0.11, 0.38, 0.67);
            let blue = horizon.lerp(zenith, elevation);
            let clouds = (x * 0.0015 + z * 0.0019 + (z * 0.00083).cos()).sin() * 0.55
                + (x * 0.0021 - z * 0.0012).sin() * 0.27
                + (z * 0.0041).sin() * 0.16;
            let cover = ((clouds - 0.32) * 1.6).clamp(0.0, 0.68) * elevation;
            let c = blue.lerp(Vec3::new(0.96, 0.97, 0.96), cover);
            Color::srgb(c.x, c.y, c.z).to_linear().to_f32_array()
        })
        .collect();
    sky.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    commands.spawn((
        Mesh3d(meshes.add(sky)),
        MeshMaterial3d(materials.add(StandardMaterial {
            cull_mode: None,
            unlit: true,
            ..default()
        })),
        RenderLayers::layer(1),
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
    woodland: Res<Woodland>,
    view: Res<TrackView>,
    surfaces: Query<Entity, With<CircuitSurface>>,
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
                let mat = materials.add(StandardMaterial {
                    perceptual_roughness: 0.94,
                    cull_mode: None,
                    double_sided: true,
                    ..default()
                });
                for layer in scenery.layers {
                    let render_layer = if layer.role == 0 { 0 } else { 1 };
                    commands.spawn((
                        CircuitSurface,
                        Mesh3d(meshes.add(layer.mesh)),
                        MeshMaterial3d(mat.clone()),
                        RenderLayers::layer(render_layer),
                    ));
                }
                for (i, [x, y, z, height, yaw]) in scenery.trees.into_iter().enumerate() {
                    commands.spawn((
                        CircuitSurface,
                        Mesh3d(woodland.meshes[i % 2].clone()),
                        MeshMaterial3d(woodland.material.clone()),
                        RenderLayers::layer(1),
                        Transform::from_xyz(x, y, z)
                            .with_rotation(Quat::from_rotation_y(yaw))
                            .with_scale(Vec3::splat(height)),
                    ));
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
    let (eye, target, up) = match session.camera {
        CameraMode::Overview => (
            Quat::from_euler(EulerRot::YXZ, view.yaw + 2.3, view.pitch - 0.9, 0.0)
                * Vec3::Z
                * geometry.view_radius
                * 1.12
                / zoom,
            Vec3::ZERO,
            Vec3::Y,
        ),
        CameraMode::Map => (
            view.pan + Vec3::Y * geometry.view_radius * 1.39,
            view.pan,
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
            RenderLayers::from_layers(&[0, 1])
        };
        if *layers != next {
            *layers = next;
        }
        if map {
            let min_width = track.bounds.width * 1.17 / zoom;
            let min_height = track.bounds.height * 1.33 / zoom;
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
    if session.rays && !cockpit {
        let leader = &frame.cars[frame.leader];
        let start = point(leader, origin) + Vec3::Y * 0.58;
        for (distance, angle) in frame.rays.iter().zip([
            -1.25, -0.8, -0.4, 0.0, 0.4, 0.8, 1.25, -1.45, -1.05, 1.05, 1.45,
        ]) {
            let direction = angle + leader.heading;
            let end = start
                + Vec3::new(direction.cos() as f32, 0.0, direction.sin() as f32) * *distance as f32;
            gizmos.line(start, end, Color::srgb(0.96, 0.49, 0.30));
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
    session_clock: Option<(u32, f64)>,
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
            && session
                .activity
                .as_ref()
                .is_some_and(|(_, values)| values.iter().any(|v| v.abs() > 0.002))
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
            session.smoke_action.push(Action::Compare);
            smoke.step = 6;
        }
        6 if comparison.rows[0].elapsed > 0. => {
            session.smoke_action.push(Action::StopComparison);
            smoke.step = 7;
        }
        7 if !comparison.running => {
            if smoke.session_clock != Some((frame.generation, frame.elapsed)) {
                eprintln!("Il confronto ha alterato la sessione di guida");
                exit.write(AppExit::error());
                return;
            }
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
            let (elapsed, speed, progress, wall) = smoke.motion.unwrap();
            let report = serde_json::json!({
                "passed":true,"cars":frame.cars.len(),"elapsed":elapsed,"leaderKmh":speed,
                "leaderMeters":progress,"wallSecondsAfterAssetReady":wall,"comparisonPreservedSession":true,"liveAtlas":true,
                "screens":["native-scene.png","native-split.png","native-compare.png","native-map-dark.png","native-cockpit.png"],
                "targetSpeedAfterResume":session.setup.speed,"measuredSpeedAfterResume":session.effective,
                "backend":format!("{:?}",adapter.backend),"adapter":adapter.name,
            });
            fs::write(smoke.directory.join("smoke.json"), report.to_string())
                .expect("Rapporto nativo");
            exit.write(AppExit::Success);
        }
        _ => {}
    }
}
