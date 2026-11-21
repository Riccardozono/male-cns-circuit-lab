use rquickjs::{ArrayBuffer, CatchResultExt, Context, Ctx, Function, Promise, Runtime, TypedArray};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};

const FULL_GRAPH: &[u8] = include_bytes!("../../outputs/data/connectome-full.bin");
const FULL_METADATA: &str = include_str!("../../outputs/data/connectome-full.json");
const SOURCES: &[&str] = &[
    include_str!("../../outputs/data/terrain.js"),
    include_str!("../../outputs/terrain.js"),
    include_str!("../../outputs/vehicle-992.js"),
    include_str!("../../outputs/rewards.js"),
    include_str!("../../outputs/neural-learning.js"),
    include_str!("../../outputs/legacy-models.js"),
    include_str!("../../outputs/model-profiles.js"),
    include_str!("../../outputs/simulation.js"),
    include_str!("../../outputs/progress-save.js"),
    include_str!("bridge.js"),
];

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Setup {
    pub model: String,
    pub circuit: String,
    pub population: u32,
    pub seed: u32,
    pub speed: f64,
}

impl Default for Setup {
    fn default() -> Self {
        Self {
            model: "v3".into(),
            circuit: "monza".into(),
            population: 16,
            seed: 7717,
            speed: 1.0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Car {
    pub x: f64,
    pub z: f64,
    pub elevation: f64,
    pub heading: f64,
    pub alive: bool,
    pub speed: f64,
    pub rpm: f64,
    pub gear: i32,
    pub laps: u32,
    pub fitness: f64,
    pub progress: f64,
    #[serde(rename = "bestLap")]
    pub best_lap: Option<f64>,
    pub outputs: [f64; 3],
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Frame {
    pub generation: u32,
    pub ticks: u32,
    pub elapsed: f64,
    pub neurons: usize,
    pub edges: usize,
    pub leader: usize,
    pub rays: Vec<f64>,
    pub cars: Vec<Car>,
}

#[derive(Debug, Deserialize)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Deserialize)]
pub struct Track {
    pub label: String,
    pub bounds: Bounds,
    pub length: f32,
    pub outer: Vec<[f64; 3]>,
    pub inner: Vec<[f64; 3]>,
    pub center: Vec<[f64; 3]>,
}

pub struct Engine {
    context: Context,
    _runtime: Runtime,
}

fn decode<T: DeserializeOwned>(json: String) -> Result<T> {
    Ok(serde_json::from_str(&json)?)
}

fn encode_utf8<'js>(ctx: Ctx<'js>, text: String) -> rquickjs::Result<TypedArray<'js, u8>> {
    TypedArray::new(ctx, text.into_bytes())
}

fn hash_bytes<'js>(
    ctx: Ctx<'js>,
    bytes: TypedArray<'js, u8>,
) -> rquickjs::Result<TypedArray<'js, u8>> {
    // The worker owns its JS runtime. No JS runs while we read the array.
    let input = unsafe { bytes.as_bytes() }.ok_or(rquickjs::Error::Unknown)?;
    let digest = Sha256::digest(input);
    TypedArray::new(ctx, digest.to_vec())
}

impl Engine {
    pub fn new() -> Result<Self> {
        let metadata: serde_json::Value = serde_json::from_str(FULL_METADATA)?;
        if metadata["binaryBytes"] != FULL_GRAPH.len()
            || metadata["binarySha256"] != format!("{:x}", Sha256::digest(FULL_GRAPH))
        {
            return Err("Il pacchetto MaleCNS completo non supera la verifica SHA-256".into());
        }
        let runtime = Runtime::new()?;
        runtime.set_memory_limit(1_600_000_000);
        runtime.set_max_stack_size(4 * 1024 * 1024);
        let context = Context::full(&runtime)?;
        context.with(|ctx| -> Result<()> {
            let globals = ctx.globals();
            globals.set("nativeCircuits", include_str!("../../outputs/data/circuits.json"))?;
            globals.set("nativeReducedGraph", include_str!("../../outputs/data/connectome.json"))?;
            globals.set("nativeFullMetadata", FULL_METADATA)?;
            globals.set("nativeFullGraph", ArrayBuffer::new_copy(ctx.clone(), FULL_GRAPH)?)?;
            globals.set("nativeEncode", Function::new(ctx.clone(), encode_utf8)?)?;
            globals.set("nativeHash", Function::new(ctx.clone(), hash_bytes)?)?;
            globals.set("nativeDense", Function::new(ctx.clone(), crate::neural::dense)?)?;
            globals.set("nativeSparse", Function::new(ctx.clone(), crate::neural::sparse)?)?;
            globals.set("nativeTrackGeometry", Function::new(ctx.clone(), crate::geometry::build)?)?;
            ctx.eval::<(), _>(
                "globalThis.TextEncoder = class { encode(value) { return nativeEncode(value); } };
                 globalThis.crypto = { subtle: { digest: (_, bytes) => nativeHash(bytes) } };
                 globalThis.MaleCNSDense = { step(graph, brain, iterations, edgesEnabled, gains) {
                   const result = nativeDense(graph, brain, iterations, edgesEnabled, gains);
                   if (iterations % 2) [brain.activity, brain.next] = [brain.next, brain.activity];
                   brain.activity.set(result[0]);
                   brain.next.set(result[1]);
                   brain.sum.set(result[2]);
                 } };
                 globalThis.MaleCNSNativeSparse = (graph, brain, iterations, edgesEnabled, gains) => {
                   const result = nativeSparse(graph, brain, iterations, edgesEnabled, gains);
                   if (iterations % 2) [brain.activity, brain.next] = [brain.next, brain.activity];
                   brain.activity.set(result[0]);
                   brain.next.set(result[1]);
                   brain.active.set(result[2]);
                   brain.activeCount = result[2].length;
                   brain.lastTouchedCount = result[3];
                   brain.lastCoreCandidateCount = result[4];
                   brain.peakActiveCount = Math.max(brain.peakActiveCount, result[5]);
                 };
                 globalThis.MaleCNSNativeGeometry = (() => {
                   const cache = new WeakMap();
                   return track => {
                     let data = cache.get(track);
                     if (!data) {
                       const { walls, segments, outer, inner } = track;
                       data = nativeTrackGeometry(JSON.stringify({ walls, segments, outer, inner }));
                       cache.set(track, data);
                     }
                     return data;
                   };
                 })();",
            ).catch(&ctx).map_err(|err| err.to_string())?;
            for source in SOURCES {
                ctx.eval::<(), _>(*source).catch(&ctx).map_err(|err| err.to_string())?;
            }
            Ok(())
        })?;
        Ok(Self {
            context,
            _runtime: runtime,
        })
    }

    pub fn start(&self, setup: &Setup) -> Result<(Track, Frame)> {
        if !matches!(setup.model.as_str(), "v2" | "v3" | "v4" | "v5")
            || !matches!(
                setup.circuit.as_str(),
                "lab" | "monza" | "monaco" | "le-mans"
            )
            || !(1..=100).contains(&setup.population)
        {
            return Err("Configurazione della simulazione non valida".into());
        }
        let track = self.context.with(|ctx| -> Result<Track> {
            let start: Function = ctx.globals().get("nativeStart")?;
            decode(
                start
                    .call((&setup.model, &setup.circuit, setup.population, setup.seed))
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })?;
        Ok((track, self.snapshot()?))
    }

    pub fn snapshot(&self) -> Result<Frame> {
        self.context.with(|ctx| {
            let snapshot: Function = ctx.globals().get("nativeSnapshot")?;
            decode(
                snapshot
                    .call(())
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })
    }

    pub fn advance(&self, ticks: u32) -> Result<Frame> {
        self.context.with(|ctx| {
            let advance: Function = ctx.globals().get("nativeAdvance")?;
            decode(
                advance
                    .call((ticks,))
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })
    }

    pub fn save(&self, speed: f64) -> Result<String> {
        self.context.with(|ctx| {
            let save: Function = ctx.globals().get("nativeSave")?;
            let promise: Promise = save
                .call((speed,))
                .catch(&ctx)
                .map_err(|err| err.to_string())?;
            Ok(promise
                .finish()
                .catch(&ctx)
                .map_err(|err| err.to_string())?)
        })
    }

    pub fn load(&self, save: &str) -> Result<(Setup, Track, Frame)> {
        if save.len() > 16 * 1024 * 1024 {
            return Err("File oltre il limite di 16 MiB".into());
        }
        let (setup, track) = self.context.with(|ctx| -> Result<(Setup, Track)> {
            let load: Function = ctx.globals().get("nativeLoad")?;
            let promise: Promise = load
                .call((save,))
                .catch(&ctx)
                .map_err(|err| err.to_string())?;
            let setup = decode(
                promise
                    .finish()
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )?;
            let track = decode(
                ctx.eval::<String, _>("nativeTrack()")
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )?;
            Ok((setup, track))
        })?;
        Ok((setup, track, self.snapshot()?))
    }
}
