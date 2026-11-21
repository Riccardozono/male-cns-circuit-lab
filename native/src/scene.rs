use crate::{
    engine::{Car, Track},
    window::{CameraMode, Session},
};
use bevy::{
    app::AppExit,
    asset::RenderAssetUsages,
    gltf::GltfAssetLabel,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
    render::{
        renderer::RenderAdapterInfo,
        view::screenshot::{Screenshot, save_to_disk},
    },
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

#[derive(Resource, Default)]
pub(crate) struct Geometry {
    revision: u64,
    origin: Vec3,
    view_radius: f32,
}

#[derive(Resource)]
pub(crate) struct Model(Handle<Scene>);

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
) {
    commands.insert_resource(Geometry::default());
    let porsche = assets.load(GltfAssetLabel::Scene(0).from_asset("embedded://porsche.glb"));
    commands.insert_resource(Model(porsche.clone()));
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
        Projection::Perspective(PerspectiveProjection {
            near: 0.05,
            far: 30_000.0,
            ..default()
        }),
        Transform::from_xyz(450.0, 380.0, 370.0).looking_at(Vec3::ZERO, Vec3::Y),
        CameraRig,
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 14_000.0,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::YXZ, -1.0, -0.75, 0.0)),
    ));
    let body = meshes.add(Cuboid::new(4.62, 0.80, 2.05));
    let colors = [
        Color::srgb(0.30, 0.71, 0.83),
        Color::srgb(0.76, 0.39, 0.18),
        Color::srgb(0.46, 0.67, 0.39),
        Color::srgb(0.71, 0.42, 0.62),
    ]
    .map(|color| {
        materials.add(StandardMaterial {
            base_color: color,
            perceptual_roughness: 0.5,
            ..default()
        })
    });
    for id in 0..100 {
        commands.spawn((
            Agent(id),
            Mesh3d(body.clone()),
            MeshMaterial3d(colors[id % colors.len()].clone()),
            Visibility::Hidden,
        ));
    }
}

fn area(ring: &[[f64; 3]]) -> f64 {
    ring.iter()
        .zip(ring.iter().cycle().skip(1))
        .map(|(a, b)| a[0] * b[2] - b[0] * a[2])
        .sum::<f64>()
        * 0.5
}

fn surface_mesh(positions: Vec<[f32; 3]>, indices: Vec<u32>, color: Option<Vec<[f32; 4]>>) -> Mesh {
    let normals = vec![[0.0, 1.0, 0.0]; positions.len()];
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    if let Some(tints) = color {
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, tints);
    }
    mesh.insert_indices(Indices::U32(indices));
    mesh
}

fn road(track: &Track, origin: Vec3) -> Option<Mesh> {
    let mut rings = [&track.outer, &track.inner];
    rings.sort_by(|a, b| area(b).abs().total_cmp(&area(a).abs()));
    let points: Vec<_> = rings.into_iter().flatten().collect();
    let projected: Vec<_> = points
        .iter()
        .flat_map(|point| [point[0], point[2]])
        .collect();
    let triangles = earcutr::earcut(&projected, &[rings[0].len()], 2).ok()?;
    let vertices: Vec<_> = points
        .iter()
        .map(|point| {
            [
                point[0] as f32 - origin.x,
                point[1] as f32 + 0.07,
                point[2] as f32 - origin.z,
            ]
        })
        .collect();
    let mut indices = Vec::with_capacity(triangles.len());
    for t in triangles.chunks_exact(3) {
        let [a, b, c] = [t[0], t[1], t[2]];
        let sign = (Vec3::from_array(vertices[b]) - Vec3::from_array(vertices[a]))
            .cross(Vec3::from_array(vertices[c]) - Vec3::from_array(vertices[a]))
            .y;
        if sign >= 0.0 {
            indices.extend([a as u32, b as u32, c as u32]);
        } else {
            indices.extend([a as u32, c as u32, b as u32]);
        }
    }
    Some(surface_mesh(vertices, indices, None))
}

fn ground(track: &Track, origin: Vec3) -> Mesh {
    let mut positions = Vec::new();
    let mut colors = Vec::new();
    let mut triangles = Vec::new();
    let padding = 650.0;
    let w = track.bounds.width + 2.0 * padding;
    let h = track.bounds.height + 2.0 * padding;
    let nx = (w / 13.0).ceil().clamp(40.0, 320.0) as u32;
    let nz = (h / 13.0).ceil().clamp(40.0, 320.0) as u32;
    let min_y = track
        .center
        .iter()
        .fold(0.0f64, |acc, point| acc.min(point[1])) as f32;
    let sampled: Vec<_> = track
        .center
        .iter()
        .step_by(3)
        .map(|p| Vec3::new(p[0] as f32 - origin.x, p[1] as f32, p[2] as f32 - origin.z))
        .collect();
    for z in 0..=nz {
        for x in 0..=nx {
            let px = w * (x as f32 / nx as f32 - 0.5);
            let pz = h * (z as f32 / nz as f32 - 0.5);
            let (distance, elevation) =
                sampled.iter().fold((f32::INFINITY, min_y), |(best, y), p| {
                    let d = (px - p.x).powi(2) + (pz - p.z).powi(2);
                    if d < best { (d, p.y) } else { (best, y) }
                });
            let blend = (distance.sqrt() / 420.0).clamp(0.0, 1.0);
            positions.push([px, elevation.lerp(min_y, blend) - 0.85, pz]);
            let t = 0.91 + 0.07 * (px * 0.053 + (pz * 0.031).sin()).cos();
            colors.push([0.09 * t, 0.17 * t, 0.087 * t, 1.0]);
            if x < nx && z < nz {
                let i = z * (nx + 1) + x;
                triangles.extend([i, i + nx + 1, i + 1, i + 1, i + nx + 1, i + nx + 2]);
            }
        }
    }
    surface_mesh(positions, triangles, Some(colors))
}

fn point(car: &Car, origin: Vec3) -> Vec3 {
    Vec3::new(
        car.x as f32 - origin.x,
        car.elevation as f32 + 0.10,
        car.z as f32 - origin.z,
    )
}

fn car_transform(car: &Car, origin: Vec3, lift: f32) -> Transform {
    Transform::from_translation(point(car, origin) + Vec3::Y * lift)
        .with_rotation(Quat::from_rotation_y(-(car.heading as f32)))
}

fn plant_woodland(commands: &mut Commands, track: &Track, origin: Vec3, woodland: &Woodland) {
    let every = (track.center.len() / 220).max(2);
    for (i, p) in track.center.iter().enumerate().step_by(every) {
        let next = track.center[(i + 1) % track.center.len()];
        let (dx, dz) = (next[0] - p[0], next[2] - p[2]);
        let norm = dx.hypot(dz);
        if norm <= 1e-8 {
            continue;
        }
        let seed = (i as u32).wrapping_mul(2_654_435_761).rotate_left(11);
        for side in [-1.0, 1.0] {
            let distance = 28.0 + f64::from(seed % 119) * 0.81;
            let x = p[0] - dz / norm * distance * side;
            let z = p[2] + dx / norm * distance * side;
            if track
                .center
                .iter()
                .any(|q| (q[0] - x).powi(2) + (q[2] - z).powi(2) < 17.0_f64.powi(2))
            {
                continue;
            }
            let height = 8.0 + (seed % 11) as f32 * 0.65;
            commands.spawn((
                CircuitSurface,
                Mesh3d(woodland.meshes[(seed % 2) as usize].clone()),
                MeshMaterial3d(woodland.material.clone()),
                Transform::from_xyz(x as f32 - origin.x, p[1] as f32 - 1.15, z as f32 - origin.z)
                    .with_rotation(Quat::from_rotation_y((seed % 360) as f32 * 0.01745))
                    .with_scale(Vec3::splat(height)),
            ));
        }
    }
}

pub fn update(
    mut commands: Commands,
    session: Res<Session>,
    mut geometry: ResMut<Geometry>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    woodland: Res<Woodland>,
    surfaces: Query<Entity, With<CircuitSurface>>,
    mut transforms: ParamSet<(
        Query<&mut Transform, With<CameraRig>>,
        Query<(&Agent, &mut Transform, &mut Visibility)>,
        Query<(&mut Transform, &mut Visibility), With<Porsche>>,
    )>,
    mut lods: Query<(&Name, &mut Visibility), (Added<Name>, Without<Agent>, Without<Porsche>)>,
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
        if let Some(road) = road(track, geometry.origin) {
            commands.spawn((
                CircuitSurface,
                Mesh3d(meshes.add(road)),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: Color::srgb(0.21, 0.25, 0.28),
                    perceptual_roughness: 0.96,
                    double_sided: true,
                    cull_mode: None,
                    ..default()
                })),
            ));
        }
        commands.spawn((
            CircuitSurface,
            Mesh3d(meshes.add(ground(track, geometry.origin))),
            MeshMaterial3d(materials.add(StandardMaterial {
                perceptual_roughness: 1.0,
                ..default()
            })),
        ));
        plant_woodland(&mut commands, track, geometry.origin, &woodland);
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
            *transform = car_transform(visible, origin, 0.41);
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
    let (eye, target, up) = match session.camera {
        CameraMode::Overview => (
            Vec3::new(0.48, 0.85, 0.55) * geometry.view_radius,
            Vec3::ZERO,
            Vec3::Y,
        ),
        CameraMode::Map => (
            Vec3::Y * geometry.view_radius * 1.39,
            Vec3::ZERO,
            Vec3::NEG_Z,
        ),
        CameraMode::Follow => (
            position - forward * 13.0 + Vec3::Y * 5.8,
            position + forward * 6.0,
            Vec3::Y,
        ),
        CameraMode::Cockpit => {
            let eye = position + Vec3::Y * 1.14 + forward * 0.62;
            (eye, eye + forward * 50.0 - Vec3::Y * 2.2, Vec3::Y)
        }
    };
    if let Ok(mut transform) = transforms.p0().single_mut() {
        *transform = Transform::from_translation(eye).looking_at(target, up);
    }
    let paint = Color::srgb(0.86, 0.87, 0.77);
    if session.camera == CameraMode::Follow || cockpit {
        for ring in [&track.outer, &track.inner] {
            for (a, b) in ring.iter().zip(ring.iter().cycle().skip(1)) {
                let a = Vec3::new(
                    a[0] as f32 - origin.x,
                    a[1] as f32 + 0.16,
                    a[2] as f32 - origin.z,
                );
                if a.distance_squared(position) > 180.0f32.powi(2) {
                    continue;
                }
                let b = Vec3::new(
                    b[0] as f32 - origin.x,
                    b[1] as f32 + 0.16,
                    b[2] as f32 - origin.z,
                );
                gizmos.line(a, b, paint);
            }
        }
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
    capture: bool,
}

impl Smoke {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            start: Instant::now(),
            capture: false,
        }
    }
}

pub fn verify_window(
    mut commands: Commands,
    mut session: ResMut<Session>,
    model: Res<Model>,
    assets: Res<AssetServer>,
    adapter: Res<RenderAdapterInfo>,
    mut smoke: ResMut<Smoke>,
    mut exit: MessageWriter<AppExit>,
) {
    let path = smoke.directory.join("native-scene.png");
    if smoke.start.elapsed().as_secs() > 150
        || session.frame.is_none() && !session.message.is_empty()
    {
        eprintln!("Prova finestra non completata: {}", session.message);
        exit.write(AppExit::error());
        return;
    }
    if !smoke.capture && session.frame.is_some() {
        session.camera = CameraMode::Follow;
        session.running = true;
    }
    if !smoke.capture
        && assets.is_loaded_with_dependencies(model.0.id())
        && session
            .frame
            .as_ref()
            .is_some_and(|frame| frame.elapsed > 1.0 && frame.cars.iter().any(|c| c.speed > 0.1))
    {
        session.running = false;
        let _ = fs::create_dir_all(&smoke.directory);
        commands
            .spawn(Screenshot::primary_window())
            .observe(save_to_disk(path.clone()));
        smoke.capture = true;
    }
    if smoke.capture && fs::metadata(&path).is_ok_and(|entry| entry.len() > 5000) {
        let frame = session.frame.as_ref().unwrap();
        let report = serde_json::json!({
            "passed": true, "rendered": path, "assetLoaded": true,
            "cars": frame.cars.len(), "elapsed": frame.elapsed, "backend": format!("{:?}", adapter.backend),
            "adapter": adapter.name,
        });
        let _ = fs::write(smoke.directory.join("smoke.json"), report.to_string());
        exit.write(AppExit::Success);
    }
}
