#import bevy_pbr::{
    forward_io::{VertexOutput, FragmentOutput},
    mesh_view_bindings::view,
    pbr_fragment::pbr_input_from_standard_material,
    pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing},
}

struct SurfaceStyle {
    style: u32,
    scale: f32,
}
@group(#{MATERIAL_BIND_GROUP}) @binding(100) var<uniform> surface: SurfaceStyle;

fn hash(p: vec2<f32>) -> f32 {
    var v = fract(p.xyx * 0.1031);
    v += vec3(dot(v, v.yzx + 33.33));
    return fract((v.x + v.y) * v.z);
}

fn noise(p: vec2<f32>) -> f32 {
    let cell = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    let x = mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x);
    let y = mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x);
    return mix(x, y, f.y);
}

fn detail(p: vec2<f32>, settings: vec3<f32>) -> f32 {
    let grain = p * settings.x;
    let footprint = max(length(dpdx(grain)), length(dpdy(grain)));
    let fade = 1.0 - smoothstep(0.20, 0.85, footprint);
    let coarse = noise(p * 0.125) - 0.5;
    return 1.0 + coarse * settings.z + (noise(grain) - 0.5) * fade * settings.y;
}

fn seawater(position: vec3<f32>, metres: vec2<f32>) -> vec3<f32> {
    let sight = view.world_position - position;
    let eye = normalize(sight);
    let fade = 1.0 - smoothstep(65.0, 850.0, length(sight) / surface.scale);
    let swell = cos(dot(metres, vec2(0.24, 0.11)) + sin(metres.y * 0.09));
    let wave = cos(dot(metres, vec2(-0.41, 0.85)) + cos(metres.x * 0.17));
    let normal = normalize(vec3((swell * 0.038 - wave * 0.019) * fade, 1.0,
        (wave * 0.049 + swell * 0.018) * fade));
    let grazing = pow(1.0 - clamp(dot(eye, normal), 0.0, 1.0), 4.0);
    let sun = normalize(vec3(-0.43, 0.67, 0.49));
    let glint = pow(max(0.0, dot(normal, normalize(eye + sun))), 48.0);
    let base = mix(vec3(0.017, 0.113, 0.151), vec3(0.027, 0.145, 0.185), noise(metres * 0.018));
    return mix(base, vec3(0.34, 0.53, 0.69), grazing)
        + vec3(0.36, 0.27, 0.17) * glint
        + (swell + wave) * fade * vec3(0.004, 0.010, 0.012);
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) is_front: bool) -> FragmentOutput {
    var input = pbr_input_from_standard_material(in, is_front);
    let metres = in.world_position.xz / surface.scale;
    var settings = vec3(3.0, 0.24, 0.24);
    switch surface.style {
        case 1u: { settings = vec3(1.9, 0.21, 0.17); }
        case 2u: { settings = vec3(24.0, 0.48, 0.14); }
        case 3u: { settings = vec3(14.0, 0.58, 0.22); }
        default: {}
    }
    var grain = detail(metres, settings);
    if surface.style == 1u {
        grain += (noise(metres * 0.027) - 0.5) * 0.15;
    }
    input.material.base_color = vec4(input.material.base_color.rgb * grain, 1.0);
    var color = apply_pbr_lighting(input);
#ifdef VERTEX_COLORS
    if surface.style == 1u {
        let wet = smoothstep(0.30, 0.76, in.color.a);
        if wet > 0.0 {
            color = vec4(mix(color.rgb, seawater(in.world_position.xyz, metres), wet), color.a);
        }
    }
#endif
    var out: FragmentOutput;
    out.color = main_pass_post_lighting_processing(input, color);
    return out;
}
