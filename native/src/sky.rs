use bevy::{
    asset::RenderAssetUsages,
    camera::Exposure,
    core_pipeline::Skybox,
    image::ImageSampler,
    pbr::{DistanceFog, FogFalloff},
    prelude::*,
    render::render_resource::{
        Extent3d, TextureDimension, TextureFormat, TextureViewDescriptor, TextureViewDimension,
    },
};

use crate::{
    scene::CameraRig,
    window::{CameraMode, Session},
};

#[derive(Resource)]
pub struct Daylight(Handle<Image>);

pub fn prepare(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    const SIDE: u32 = 384;
    let mut pixels = Vec::with_capacity((SIDE * SIDE * 6 * 4) as usize);
    for face in 0..6 {
        for y in 0..SIDE {
            for x in 0..SIDE {
                let u = (x as f32 + 0.5) * (2. / SIDE as f32) - 1.;
                let v = (y as f32 + 0.5) * (2. / SIDE as f32) - 1.;
                // Bevy samples the cubemap with world Z negated.
                let direction = match face {
                    0 => Vec3::new(1., -v, u),
                    1 => Vec3::new(-1., -v, -u),
                    2 => Vec3::new(u, 1., -v),
                    3 => Vec3::new(u, -1., v),
                    4 => Vec3::new(u, -v, -1.),
                    _ => Vec3::new(-u, -v, 1.),
                };
                let rgb = horizon(direction.normalize()).clamp(Vec3::ZERO, Vec3::ONE);
                pixels.extend(rgb.to_array().map(|c| (255. * c).round() as u8));
                pixels.push(255);
            }
        }
    }
    let mut image = Image::new(
        Extent3d {
            width: SIDE,
            height: SIDE,
            depth_or_array_layers: 6,
        },
        TextureDimension::D2,
        pixels,
        TextureFormat::Rgba8Unorm,
        RenderAssetUsages::RENDER_WORLD,
    );
    image.texture_view_descriptor = Some(TextureViewDescriptor {
        dimension: Some(TextureViewDimension::Cube),
        ..default()
    });
    image.sampler = ImageSampler::linear();
    commands.insert_resource(Daylight(images.add(image)));
}

pub fn camera(
    mut commands: Commands,
    sky: Res<Daylight>,
    session: Res<Session>,
    camera: Query<(Entity, Has<Skybox>), With<CameraRig>>,
) {
    let Ok((entity, enabled)) = camera.single() else {
        return;
    };
    if session.camera == CameraMode::Map {
        if enabled {
            commands.entity(entity).remove::<(Skybox, DistanceFog)>();
        }
    } else if !enabled {
        commands.entity(entity).insert((
            Skybox {
                image: sky.0.clone(),
                brightness: Exposure::default().exposure().recip(),
                ..default()
            },
            DistanceFog {
                color: Color::srgb_u8(179, 197, 210),
                falloff: FogFalloff::Linear {
                    start: 850.,
                    end: 10_500.,
                },
                ..default()
            },
        ));
    }
}

// Same daylight palette and cloud bands as the 5.7.1 reference shader.
fn horizon(ray: Vec3) -> Vec3 {
    let elevation = ray.y.max(0.);
    let sky = Vec3::new(0.70, 0.80, 0.87).lerp(Vec3::new(0.065, 0.26, 0.54), elevation.powf(0.46));
    let p = Vec2::new(ray.x, ray.z) / (elevation + 0.23) * 2.4;
    let clouds = noise(p) * 0.60 + noise(p * 2.1) * 0.28 + noise(p * 4.3) * 0.12;
    let cover = smooth(0.49, 0.70, clouds) * smooth(0.015, 0.18, elevation);
    let cloud_color =
        Vec3::new(0.63, 0.70, 0.78).lerp(Vec3::new(0.99, 0.98, 0.93), smooth(0.50, 0.78, clouds));
    let sun = ray.dot(Vec3::new(-0.43, 0.67, 0.49).normalize()).max(0.);
    sky.lerp(cloud_color, cover * 0.91)
        + Vec3::new(0.29, 0.21, 0.12) * sun.powi(24)
        + Vec3::new(1., 0.88, 0.64) * smooth(0.9994, 0.9998, sun)
}

fn smooth(a: f32, b: f32, value: f32) -> f32 {
    let x = ((value - a) / (b - a)).clamp(0., 1.);
    x * x * (3. - 2. * x)
}

fn noise(p: Vec2) -> f32 {
    fn hash(p: Vec2) -> f32 {
        let s = Vec3::new(p.x, p.y, p.x) * 0.1031;
        let mut s = s - s.floor();
        s += Vec3::splat(s.dot(Vec3::new(s.y, s.z, s.x) + Vec3::splat(33.33)));
        let n = (s.x + s.y) * s.z;
        n - n.floor()
    }
    let tile = p.floor();
    let f = p - tile;
    let f = f * f * (Vec2::splat(3.) - 2. * f);
    let a = hash(tile).lerp(hash(tile + Vec2::X), f.x);
    let b = hash(tile + Vec2::Y).lerp(hash(tile + Vec2::ONE), f.x);
    a.lerp(b, f.y)
}
