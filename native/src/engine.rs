use rquickjs::{Array, ArrayBuffer, CatchResultExt, Context, Ctx, Function, Object, Runtime};
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
    include_str!("../../outputs/desktop-state.js"),
    include_str!("bridge.js"),
];

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Driver {
    #[default]
    Connectome,
    Off,
    Straight,
}

impl Driver {
    fn id(self) -> &'static str {
        match self {
            Self::Connectome => "connectome",
            Self::Off => "off",
            Self::Straight => "straight",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Setup {
    pub model: String,
    pub circuit: String,
    pub population: u32,
    pub seed: u32,
    pub speed: f64,
    pub mutation: f64,
    #[serde(default)]
    pub driver: Driver,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoredSettings {
    population: f64,
    seed: f64,
    speed_multiplier: f64,
    mutation: f64,
}

impl Default for Setup {
    fn default() -> Self {
        Self {
            model: "v3".into(),
            circuit: "monza".into(),
            population: 16,
            seed: 7717,
            speed: 1.0,
            mutation: 0.32,
            driver: Driver::Connectome,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Car {
    pub x: f64,
    pub z: f64,
    pub elevation: f64,
    pub heading: f64,
    pub pitch: f32,
    pub roll: f32,
    #[serde(rename = "steeringAngle")]
    pub steering_angle: f32,
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
    #[serde(rename = "longitudinalG")]
    pub longitudinal_g: f64,
    #[serde(rename = "lateralG")]
    pub lateral_g: f64,
    pub abs: bool,
    pub tc: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generation {
    pub generation: u64,
    pub best_safe_progress: f64,
    pub mean_safe_progress: f64,
    pub best_progress: f64,
    pub mean_progress: f64,
    pub best: f64,
    pub mean: f64,
    pub stagnation: u32,
    pub max_laps: u32,
    pub best_lap_time: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Frame {
    pub generation: u64,
    pub ticks: u32,
    pub elapsed: f64,
    pub neurons: usize,
    pub edges: usize,
    pub leader: usize,
    pub trial: Option<TrialProgress>,
    pub history: Vec<Generation>,
    pub stopped: bool,
    #[serde(rename = "rayCar")]
    pub ray_car: usize,
    #[serde(default)]
    pub worker_count: usize,
    pub gpu: GpuStatus,
    pub rays: Vec<f64>,
    #[serde(rename = "rayPoints")]
    pub ray_points: Vec<[f64; 3]>,
    pub cars: Vec<Car>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GpuStatus {
    pub state: String,
    pub adapter: Option<String>,
    pub dispatches: u64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialHit {
    pub generation: u64,
    pub agent_id: usize,
    pub lap_times: [f64; 2],
    pub two_lap_sim_seconds: f64,
    pub wall_to_two_laps_seconds: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialProgress {
    pub ticks: u32,
    pub generations: u32,
    pub current_generation: u64,
    pub max_laps: u32,
    pub best_progress_meters: f64,
    pub hit: Option<TrialHit>,
    pub generation_sim_seconds: Option<f64>,
    pub done: bool,
    pub limit_reached: bool,
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
    pub landmarks: Vec<Landmark>,
    pub source: String,
    pub description: String,
    pub width_min: f64,
    pub width_max: f64,
    pub length: f32,
    pub outer: Vec<[f64; 3]>,
    pub inner: Vec<[f64; 3]>,
    pub center: Vec<[f64; 3]>,
}

#[derive(Debug, Deserialize)]
pub struct Landmark {
    pub label: String,
    pub point: [f32; 3],
    pub scene_only: bool,
    pub distance: Option<f32>,
    pub yaw: Option<f32>,
    pub pitch: Option<f32>,
}

#[cfg(feature = "desktop")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VehicleAction {
    GearMode(bool),
    Shift(i8),
    ToggleAbs,
    ToggleTc,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub car: usize,
    pub gear_manual: bool,
    pub shift_remaining: f64,
    pub reason: String,
    pub diagnostic: bool,
    pub tyre_c: f64,
    pub tyre_wear: f64,
    pub brake_c: f64,
    pub pressure_bar: f64,
    pub fuel_l: f64,
    pub engine_power_kw: f64,
    pub downforce_n: f64,
    pub road_grade_percent: f64,
    pub normal_g: f64,
    pub total_g: f64,
    pub slip_deg: f64,
    pub width: f64,
    pub loads: [f64; 4],
    pub reward: f64,
    pub penalty: f64,
    pub last_lap: Option<f64>,
    pub ledger: Vec<(String, f64)>,
    pub visual: [f64; 3],
    pub physics: [f64; 17],
}

pub struct Engine {
    context: Context,
    _runtime: Runtime,
    trial: crate::trial::Shared,
}

fn stringify<'js, T: DeserializeOwned>(ctx: &Ctx<'js>, value: Object<'js>) -> Result<T> {
    let json = ctx
        .json_stringify(value)
        .catch(ctx)
        .map_err(|error| error.to_string())?
        .ok_or("Dati di salvataggio mancanti.")?;
    Ok(serde_json::from_str(&json.to_string()?)?)
}

fn decode<T: DeserializeOwned>(json: String) -> Result<T> {
    Ok(serde_json::from_str(&json)?)
}

fn full_bytes(ctx: Ctx<'_>) -> rquickjs::Result<ArrayBuffer<'_>> {
    ArrayBuffer::new_copy(ctx, FULL_GRAPH)
}

impl Engine {
    #[cfg(feature = "desktop")]
    pub fn atlas(&self) -> Result<crate::atlas::Points> {
        self.context.with(|ctx| {
            let graph: rquickjs::Object = ctx
                .eval("nativeAtlasGraph()")
                .catch(&ctx)
                .map_err(|err| err.to_string())?;
            Ok(crate::atlas_data::points(&graph)?)
        })
    }

    #[cfg(feature = "desktop")]
    pub fn atlas_activity(
        &self,
        car: usize,
        filter: crate::atlas::Filter,
        limit: u16,
        focus: Option<usize>,
    ) -> Result<crate::atlas::Activity> {
        self.context.with(|ctx| {
            let sample: Function = ctx.globals().get("nativeAtlasActivity")?;
            let result: Option<rquickjs::Array> = sample
                .call((car,))
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            let Some(sample) = result else {
                return Err("Auto non disponibile nell'atlante".into());
            };
            let graph: rquickjs::Object = ctx
                .eval("nativeAtlasGraph()")
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            Ok(crate::atlas_data::activity(
                &graph, &sample, car, filter, limit, focus,
            )?)
        })
    }

    #[cfg(feature = "desktop")]
    pub fn iso_now(&self) -> Result<String> {
        Ok(crate::save_file::timestamp())
    }

    #[cfg(feature = "desktop")]
    pub fn track_two_laps(&self) -> Result<()> {
        let generation = self.context.with(|ctx| -> Result<u64> {
            ctx.eval::<u64, _>("nativeTrackTrial()")
                .catch(&ctx)
                .map_err(|error| error.to_string().into())
        })?;
        self.trial
            .replace(Some(crate::trial::Tracker::new(generation)));
        Ok(())
    }

    pub fn new() -> Result<Self> {
        Self::with_hardware(false)
    }

    #[cfg(feature = "desktop")]
    pub fn new_gpu() -> Result<Self> {
        Self::with_hardware(true)
    }

    fn with_hardware(_enable_gpu: bool) -> Result<Self> {
        static VERIFIED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        if !VERIFIED.get_or_init(|| {
            serde_json::from_str::<serde_json::Value>(FULL_METADATA).is_ok_and(|meta| {
                meta["binaryBytes"] == FULL_GRAPH.len()
                    && meta["binarySha256"] == format!("{:x}", Sha256::digest(FULL_GRAPH))
            })
        }) {
            return Err("Il pacchetto MaleCNS completo non supera la verifica SHA-256".into());
        }
        let runtime = Runtime::new()?;
        runtime.set_memory_limit(1_600_000_000);
        runtime.set_max_stack_size(4 * 1024 * 1024);
        let context = Context::full(&runtime)?;
        let trial = crate::trial::Shared::default();
        context.with(|ctx| -> Result<()> {
            let globals = ctx.globals();
            globals.set("nativeCircuits", include_str!("../../outputs/data/circuits.json"))?;
            globals.set("nativeReducedGraph", include_str!("../../outputs/data/connectome.json"))?;
            globals.set("nativeFullMetadata", FULL_METADATA)?;
            globals.set("nativeLoadFullBytes", Function::new(ctx.clone(), full_bytes)?)?;
            crate::trial::install(ctx.clone(), trial.clone())?;
            globals.set("MaleCNSNativeRng", Function::new(ctx.clone(), crate::random::create)?)?;
            globals.set("nativeVehicleAdvance", Function::new(ctx.clone(), crate::vehicle::advance)?)?;
            crate::reward::install(ctx.clone())?;
            crate::ranking::install(ctx.clone())?;
            crate::learning::install(ctx.clone())?;
            globals.set("nativeDense", Function::new(ctx.clone(), crate::neural::dense)?)?;
            globals.set("nativeSparse", Function::new(ctx.clone(), crate::neural::sparse)?)?;
            globals.set("nativeTrackGeometry", Function::new(ctx.clone(), crate::geometry::build)?)?;
            globals.set("MaleCNSNativeTerrain", Function::new(ctx.clone(), crate::surface::build)?)?;
            #[cfg(feature = "desktop")]
            crate::decoder::install(ctx.clone())?;
            #[cfg(feature = "desktop")]
            if _enable_gpu {
                crate::gpu::install(ctx.clone())?;
            }
            ctx.eval::<(), _>(
                "globalThis.MaleCNSDense = { step(graph, brain, iterations, edgesEnabled, gains) {
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
            trial,
        })
    }

    #[cfg(feature = "desktop")]
    pub fn simulate_device_loss(&self) -> Result<()> {
        self.context.with(|ctx| {
            ctx.eval::<(), _>("nativeGpuLose()")
                .catch(&ctx)
                .map_err(|e| e.to_string().into())
        })
    }

    #[cfg(feature = "desktop")]
    pub fn actor_start(
        &self,
        bundle: &crate::decoder::Bundle,
        adjustments: &[crate::decoder::Coefficients],
        generation: u32,
        previous: Option<f64>,
    ) -> Result<()> {
        self.context.with(|ctx| -> Result<()> {
            let start: Function = ctx.globals().get("nativeStartActor")?;
            start
                .call((
                    bundle.data(),
                    serde_json::to_string(adjustments)?,
                    generation,
                    previous,
                ))
                .catch(&ctx)
                .map_err(|error| error.to_string().into())
        })?;
        self.trial.take();
        Ok(())
    }

    #[cfg(feature = "desktop")]
    pub fn actor_results(&self) -> Result<Vec<crate::comparison::CandidateResult>> {
        let mut results: Vec<crate::comparison::CandidateResult> = self.context.with(|ctx| {
            decode(
                ctx.eval::<String, _>("nativeActorResults()")
                    .catch(&ctx)
                    .map_err(|error| error.to_string())?,
            )
        })?;
        if let Some(trial) = self.trial.borrow().as_ref() {
            for result in &mut results {
                result.done_at = trial.finish_time(result.agent_id);
            }
        }
        Ok(results)
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
                    .call((
                        &setup.model,
                        &setup.circuit,
                        setup.population,
                        setup.seed,
                        setup.mutation,
                        setup.driver.id(),
                    ))
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })?;
        self.trial.take();
        Ok((track, self.snapshot()?))
    }

    pub fn trial_progress(&self) -> Option<TrialProgress> {
        self.trial
            .borrow()
            .as_ref()
            .map(|tracker| tracker.progress.clone())
    }

    fn track_progress(&self, mut frame: Frame) -> Frame {
        frame.trial = self.trial_progress();
        frame
    }

    pub fn snapshot(&self) -> Result<Frame> {
        let frame = self.context.with(|ctx| {
            let snapshot: Function = ctx.globals().get("nativeSnapshot")?;
            decode(
                snapshot
                    .call(())
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })?;
        Ok(self.track_progress(frame))
    }

    pub fn advance(&self, ticks: u32) -> Result<Frame> {
        self.advance_with_clock(ticks, 0.0, 0.0)
    }

    pub fn advance_with_clock(
        &self,
        ticks: u32,
        wall_seconds: f64,
        limit_seconds: f64,
    ) -> Result<Frame> {
        if let Some(trial) = self.trial.borrow_mut().as_mut() {
            trial.begin_batch(wall_seconds, limit_seconds);
        }
        let frame = self.context.with(|ctx| {
            let advance: Function = ctx.globals().get("nativeAdvance")?;
            decode(
                advance
                    .call((ticks,))
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })?;
        Ok(self.track_progress(frame))
    }

    #[cfg(feature = "desktop")]
    pub fn inspect(&self, car: usize) -> Result<Inspection> {
        self.context.with(|ctx| {
            let inspect: Function = ctx.globals().get("nativeInspect")?;
            decode(
                inspect
                    .call((car,))
                    .catch(&ctx)
                    .map_err(|e| e.to_string())?,
            )
        })
    }

    #[cfg(feature = "desktop")]
    pub fn ray_selection(&self, id: Option<usize>) -> Result<()> {
        self.context.with(|ctx| {
            let select: Function = ctx.globals().get("nativeRaySelection")?;
            select
                .call::<_, ()>((id.map_or(-1, |id| id as i32),))
                .catch(&ctx)
                .map_err(|e| e.to_string().into())
        })
    }

    #[cfg(feature = "desktop")]
    pub fn vehicle(&self, car: usize, action: VehicleAction) -> Result<Frame> {
        let (name, value) = match action {
            VehicleAction::GearMode(manual) => ("mode", i8::from(manual)),
            VehicleAction::Shift(direction) => ("shift", direction),
            VehicleAction::ToggleAbs => ("abs", 0),
            VehicleAction::ToggleTc => ("tc", 0),
        };
        self.context.with(|ctx| -> Result<()> {
            let command: Function = ctx.globals().get("nativeVehicle")?;
            command
                .call::<_, ()>((car, name, value))
                .catch(&ctx)
                .map_err(|e| e.to_string().into())
        })?;
        self.snapshot()
    }

    pub fn mutation(&self, value: f64) -> Result<()> {
        self.context.with(|ctx| {
            let apply: Function = ctx.globals().get("nativeMutation")?;
            apply
                .call::<_, ()>((value.clamp(0.0, 0.35),))
                .catch(&ctx)
                .map_err(|e| e.to_string().into())
        })
    }

    pub fn evolve(&self) -> Result<Frame> {
        self.context.with(|ctx| {
            let apply: Function = ctx.globals().get("nativeEvolve")?;
            decode(apply.call(()).catch(&ctx).map_err(|e| e.to_string())?)
        })
    }

    pub fn save(&self, speed: f64) -> Result<String> {
        self.encode_pool(vec![self.capture(speed)?], serde_json::Value::Null)
    }

    fn save_compatibility(
        &self,
        model: &str,
        live: bool,
    ) -> Result<crate::save_state::Compatibility> {
        self.context.with(|ctx| {
            let describe: Function = ctx.globals().get("nativeSaveContext")?;
            let fields: Array = describe
                .call((model, live))
                .catch(&ctx)
                .map_err(|err| err.to_string())?;
            let (graph, policy, constants): (Object, Object, Object) =
                (fields.get(0)?, fields.get(1)?, fields.get(2)?);
            let signature =
                crate::session_state::graph_signature(ctx.clone(), &graph, &policy, model)
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?;
            constants.set("graph", signature)?;
            stringify(&ctx, constants)
        })
    }

    pub(crate) fn capture(&self, speed: f64) -> Result<serde_json::Value> {
        self.context.with(|ctx| {
            let current: Function = ctx.globals().get("nativeCurrentSimulation")?;
            let sim: Object = current
                .call(())
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            let snapshot = crate::session_state::capture(ctx.clone(), &sim, speed)
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            stringify(&ctx, snapshot)
        })
    }

    pub(crate) fn encode_pool(
        &self,
        states: Vec<serde_json::Value>,
        champion: serde_json::Value,
    ) -> Result<String> {
        let (model, circuit): (String, String) = self.context.with(|ctx| -> Result<_> {
            let current: Function = ctx.globals().get("nativeCurrentSimulation")?;
            let sim: Object = current
                .call(())
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            Ok((sim.get("modelId")?, sim.get("circuitId")?))
        })?;
        let compatibility = self.save_compatibility(&model, true)?;
        let workers: Vec<_> = states
            .into_iter()
            .enumerate()
            .map(|(index, state)| serde_json::json!({ "index": index, "state": state }))
            .collect();
        let payload = serde_json::json!({
            "modelId": model,
            "circuitId": circuit,
            "graph": &compatibility.graph,
            "vehicleRevision": &compatibility.vehicle_revision,
            "workers": workers,
            "globalChampion": champion,
        });
        compatibility.validate(&payload)?;
        crate::save_file::write(payload)
    }

    fn checked_payload(&self, text: &str) -> Result<serde_json::Value> {
        let payload = crate::save_file::read(
            text,
            |date| {
                self.context.with(|ctx| {
                    ctx.globals()
                        .get::<_, Function>("nativeCanParseDate")
                        .and_then(|parse| parse.call((date,)))
                        .unwrap_or(false)
                })
            },
            |source| {
                self.context.with(|ctx| {
                    let normalize: Function =
                        ctx.globals().get("nativeNormalizeLegacyDate").ok()?;
                    normalize.call((source,)).catch(&ctx).ok().flatten()
                })
            },
        )?;
        let model = payload["modelId"]
            .as_str()
            .filter(|model| matches!(*model, "v2" | "v3" | "v4" | "v5"))
            .ok_or("Modello neurale incompatibile.")?;
        self.save_compatibility(model, false)?.validate(&payload)?;
        Ok(payload)
    }

    pub fn load(&self, save: &str) -> Result<(Setup, Track, Frame)> {
        let payload = self.checked_payload(save)?;
        let workers = payload["workers"].as_array().ok_or("Worker mancanti")?;
        if workers.len() != 1 || !payload["globalChampion"].is_null() {
            return Err(
                "La prova a riga di comando richiede un worker e nessun campione globale.".into(),
            );
        }
        let model = payload["modelId"].as_str().ok_or("Modello mancante")?;
        let circuit = payload["circuitId"].as_str().ok_or("Circuito mancante")?;
        let state = serde_json::to_string(&workers[0]["state"])?;
        let setup = self.restore_state(model, circuit, &state)?;
        Ok((setup, self.track()?, self.snapshot()?))
    }

    pub(crate) fn restore_state(&self, model: &str, circuit: &str, state: &str) -> Result<Setup> {
        // All callers pass worker states already checked by the save validator.
        // Accept whole JavaScript numbers regardless of their JSON notation.
        let config: RestoredSettings = serde_json::from_str(state)?;
        self.context.with(|ctx| -> Result<()> {
            let globals = ctx.globals();
            let prepare: Function = globals.get("nativePrepareRestore")?;
            let commit: Function = globals.get("nativeCommitRestore")?;
            let candidate: Object = prepare
                .call((model, circuit))
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            let snapshot = ctx
                .json_parse(state)
                .catch(&ctx)
                .map_err(|error| error.to_string())?
                .into_object()
                .ok_or("Stato di ripristino non valido")?;
            crate::session_state::apply(ctx.clone(), &candidate, &snapshot)
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            commit
                .call::<_, ()>((candidate,))
                .catch(&ctx)
                .map_err(|error| error.to_string())?;
            Ok(())
        })?;
        self.trial.take();
        Ok(Setup {
            model: model.into(),
            circuit: circuit.into(),
            population: config.population as u32,
            seed: config.seed as u32,
            speed: config.speed_multiplier,
            mutation: config.mutation,
            driver: Driver::Connectome,
        })
    }

    pub(crate) fn track(&self) -> Result<Track> {
        self.context.with(|ctx| {
            decode(
                ctx.eval::<String, _>("nativeTrack()")
                    .catch(&ctx)
                    .map_err(|err| err.to_string())?,
            )
        })
    }
}

#[cfg(feature = "desktop")]
impl Engine {
    pub(crate) fn decode_pool(&self, text: &str) -> Result<crate::pool::SavedPool> {
        decode(serde_json::to_string(&self.checked_payload(text)?)?)
    }

    pub(crate) fn champion(&self, index: usize) -> Result<String> {
        self.context.with(|ctx| {
            let func: Function = ctx.globals().get("nativeChampion")?;
            Ok(func
                .call((index,))
                .catch(&ctx)
                .map_err(|err| err.to_string())?)
        })
    }

    pub(crate) fn better(&self, a: &str, b: &str) -> Result<bool> {
        self.context.with(|ctx| {
            let func: Function = ctx.globals().get("nativeBetter")?;
            Ok(func
                .call((a, b))
                .catch(&ctx)
                .map_err(|err| err.to_string())?)
        })
    }

    pub(crate) fn adopt(&self, champion: &str) -> Result<()> {
        self.context.with(|ctx| {
            let func: Function = ctx.globals().get("nativeAdopt")?;
            func.call((champion,))
                .catch(&ctx)
                .map_err(|err| err.to_string().into())
        })
    }
}
