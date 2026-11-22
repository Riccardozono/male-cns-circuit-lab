use std::{env, process::Command};

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
    ] {
        println!("cargo:rerun-if-changed={source}");
    }
    let result = Command::new("node")
        .arg("bake-scene.mjs")
        .arg(env::var_os("OUT_DIR").unwrap())
        .status()
        .expect("Node serve solo in compilazione per preparare i dati della scena 5.7.1");
    assert!(result.success(), "Preparazione della scena nativa fallita");
}
