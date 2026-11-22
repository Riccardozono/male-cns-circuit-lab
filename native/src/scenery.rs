use bevy::{
    asset::RenderAssetUsages,
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
};
use flate2::read::GzDecoder;
use std::io::{self, Read};

pub struct Layer {
    pub mesh: Mesh,
    pub role: u32,
}
pub struct Scenery {
    pub layers: Vec<Layer>,
    pub trees: Vec<[f32; 5]>,
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
    if !input.starts_with(b"MLE3") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Dati scena non riconosciuti",
        ));
    }
    input = &input[4..];
    let count = take_u32(&mut input)?;
    let trees = take_u32(&mut input)?;
    let mut layers = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let size = take_u32(&mut input)?;
        let indexed = take_u32(&mut input)?;
        let role = take_u32(&mut input)?;
        let topology = if role & 256 != 0 {
            PrimitiveTopology::LineList
        } else {
            PrimitiveTopology::TriangleList
        };
        let mut points = Vec::with_capacity(size as usize);
        let mut normals = Vec::with_capacity(size as usize);
        let mut colors = Vec::with_capacity(size as usize);
        for _ in 0..size {
            let [x, y, z, nx, ny, nz, r, g, b] = read_vector::<9>(&mut input)?;
            points.push([x, y - if role == 1 { 0.13 } else { 0.0 }, z]);
            normals.push([nx, ny, nz]);
            colors.push([r, g, b, 1.0]);
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
        layers.push(Layer { mesh, role });
    }
    let trees = (0..trees)
        .map(|_| read_vector::<5>(&mut input))
        .collect::<io::Result<_>>()?;
    Ok(Scenery { layers, trees })
}

fn read_vector<const N: usize>(input: &mut &[u8]) -> io::Result<[f32; N]> {
    let mut values = [0.; N];
    for value in &mut values {
        *value = take_f32(input)?;
    }
    Ok(values)
}
