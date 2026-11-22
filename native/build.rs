use std::{env, fs, path::Path, process::Command};

fn main() {
    if env::var_os("CARGO_FEATURE_DESKTOP").is_none() {
        return;
    }
    for source in [
        "bake-scene.mjs",
        "../outputs/data",
        "../outputs/simulation.js",
        "../outputs/terrain.js",
        "../outputs/circuit-3d.mjs",
        "../outputs/terrain-3d.mjs",
        "../outputs/track-renderer.js",
        "../outputs/track-scenery.mjs",
        "../outputs/track-facilities.mjs",
        "../outputs/world-terrain.mjs",
        "../outputs/district-buildings.mjs",
        "../outputs/vegetation.mjs",
        "../outputs/buildings.mjs",
        "../outputs/assets/trees-supplied-v1.glb",
        "../outputs/assets/trees-european-v1.glb",
        "../outputs/assets/tree-oak-v1.glb",
        "../outputs/assets/monaco-building-v1.glb",
        "../outputs/assets/le-mans-house-v1.glb",
    ] {
        println!("cargo:rerun-if-changed={source}");
    }
    println!("cargo:rerun-if-changed=../outputs/desktop-runtime.js");
    let out = env::var_os("OUT_DIR").expect("Cargo OUT_DIR");
    let source = include_str!("../outputs/desktop-runtime.js");
    let shader = source
        .split_once("    shaderCode() {")
        .expect("Solver WebGPU")
        .1
        .split_once("].join(")
        .expect("Fine shader WebGPU")
        .0;
    let mut wgsl = String::new();
    for line in shader.lines() {
        let line = line.trim().trim_end_matches(',');
        if let Some(text) = line.strip_prefix('\'').and_then(|s| s.strip_suffix('\''))
            && !text.contains('\'')
        {
            wgsl.push_str(text);
            wgsl.push('\n');
        }
    }
    assert_eq!(
        wgsl.matches("@compute").count(),
        8,
        "Entrypoint shader 5.7.1"
    );
    fs::write(Path::new(&out).join("neural-solver.wgsl"), wgsl).expect("WGSL integrato");
    let result = Command::new("node")
        .arg("bake-scene.mjs")
        .arg(out)
        .status()
        .expect("Node serve solo in compilazione per preparare i dati della scena 5.7.1");
    assert!(result.success(), "Preparazione della scena nativa fallita");
}
