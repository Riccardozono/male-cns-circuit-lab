use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    pbr::{ExtendedMaterial, MaterialExtension},
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::io::{self, Read};

pub struct Layer {
    pub mesh: Mesh,
    pub role: u32,
    pub style: u32,
}
pub struct Scenery {
    pub layers: Vec<Layer>,
    pub scale: f32,
}

pub(crate) type TrackMaterial = ExtendedMaterial<StandardMaterial, SurfaceDetail>;

#[derive(Asset, AsBindGroup, Reflect, Clone, Debug)]
pub(crate) struct SurfaceDetail {
    #[uniform(100)]
    pub style: u32,
    #[uniform(100)]
    pub scale: f32,
}

impl MaterialExtension for SurfaceDetail {
    fn fragment_shader() -> ShaderRef {
        "embedded://track_surface.wgsl".into()
    }
}

#[derive(Deserialize)]
pub struct Layout {
    pub props: Vec<Prop>,
    pub landmarks: Vec<crate::engine::Landmark>,
}

#[derive(Deserialize)]
pub struct Prop {
    pub asset: String,
    pub meshes: [Vec<usize>; 2],
    pub position: [f32; 3],
    pub yaw: f32,
    pub scale: f32,
}

pub fn layout(id: &str) -> crate::engine::Result<Layout> {
    let bytes: &[u8] = match id {
        "monza" => include_bytes!(concat!(env!("OUT_DIR"), "/monza.layout.json.gz")),
        "monaco" => include_bytes!(concat!(env!("OUT_DIR"), "/monaco.layout.json.gz")),
        "le-mans" => include_bytes!(concat!(env!("OUT_DIR"), "/le-mans.layout.json.gz")),
        _ => include_bytes!(concat!(env!("OUT_DIR"), "/lab.layout.json.gz")),
    };
    Ok(serde_json::from_reader(GzDecoder::new(bytes))?)
}

fn take_u32(input: &mut &[u8]) -> io::Result<u32> {
    let mut value = [0; 4];
    input.read_exact(&mut value)?;
    Ok(u32::from_le_bytes(value))
}
fn take_f32(input: &mut &[u8]) -> io::Result<f32> {
    Ok(f32::from_bits(take_u32(input)?))
}

pub fn load(id: &str) -> io::Result<Scenery> {
    let bytes: &[u8] = match id {
        "monza" => include_bytes!(concat!(env!("OUT_DIR"), "/monza.mle.gz")),
        "monaco" => include_bytes!(concat!(env!("OUT_DIR"), "/monaco.mle.gz")),
        "le-mans" => include_bytes!(concat!(env!("OUT_DIR"), "/le-mans.mle.gz")),
        _ => include_bytes!(concat!(env!("OUT_DIR"), "/lab.mle.gz")),
    };
    let mut uncompressed = Vec::new();
    GzDecoder::new(bytes).read_to_end(&mut uncompressed)?;
    let mut input = uncompressed.as_slice();
    if !input.starts_with(b"MLE4") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Dati scena non riconosciuti",
        ));
    }
    input = &input[4..];
    let count = take_u32(&mut input)?;
    let scale = take_f32(&mut input)?;
    let mut layers = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let size = take_u32(&mut input)?;
        let indexed = take_u32(&mut input)?;
        let flags = take_u32(&mut input)?;
        let role = flags & 255;
        let style = flags >> 16;
        let topology = if flags & 256 != 0 {
            PrimitiveTopology::LineList
        } else {
            PrimitiveTopology::TriangleList
        };
        let mut points = Vec::with_capacity(size as usize);
        let mut normals = Vec::with_capacity(size as usize);
        let mut colors = Vec::with_capacity(size as usize);
        for _ in 0..size {
            let [x, y, z, nx, ny, nz, r, g, b, water] = read_vector::<10>(&mut input)?;
            points.push([x, y - if role == 1 { 0.13 } else { 0.0 }, z]);
            normals.push([nx, ny, nz]);
            colors.push([r, g, b, if style == 1 { water } else { 1. }]);
        }
        let mut mesh = Mesh::new(topology, RenderAssetUsages::RENDER_WORLD);
        mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, points);
        mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
        if indexed > 0 {
            mesh.insert_indices(Indices::U32(
                (0..indexed)
                    .map(|_| take_u32(&mut input))
                    .collect::<io::Result<_>>()?,
            ));
        }
        layers.push(Layer { mesh, role, style });
    }
    Ok(Scenery { layers, scale })
}

fn read_vector<const N: usize>(input: &mut &[u8]) -> io::Result<[f32; N]> {
    let mut values = [0.; N];
    for value in &mut values {
        *value = take_f32(input)?;
    }
    Ok(values)
}
