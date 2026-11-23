use rquickjs::{
    Array, Ctx, Function, Object, Result, TypedArray, Value,
    function::{Constructor, This},
};

pub(crate) fn apply<'js>(
    ctx: Ctx<'js>,
    candidate: &Object<'js>,
    state: &Object<'js>,
) -> Result<()> {
    let circuit: String = state.get("circuitId")?;
    let configure: Function = candidate.get("configureCircuit")?;
    configure.call::<_, ()>((This(candidate.clone()), circuit))?;

    for field in [
        "rewardRevision",
        "population",
        "mutation",
        "speedMultiplier",
        "seed",
        "generation",
        "stagnation",
        "history",
        "learningFrontier",
        "champion",
        "championStats",
        "hallOfFame",
        "externalChampion",
    ] {
        candidate.set(field, state.get::<_, Value>(field)?)?;
    }
    candidate.set("mode", "connectome")?;
    candidate.set("running", false)?;
    candidate.set(
        "random",
        crate::random::create(ctx.clone(), state.get("rngState")?)?,
    )?;

    // Archive scores may be from another runtime. Match Electron's reset of
    // the safe frontier and let the next real rollout revalidate the archive.
    let frontier = Object::new(ctx.clone())?;
    frontier.set("progress", 0.)?;
    frontier.set("laps", 0)?;
    frontier.set("lapTime", Value::new_null(ctx.clone()))?;
    candidate.set("safeLearningFrontier", frontier)?;
    let champion: Option<Object> = state.get("champion")?;
    let stats: Option<Object> = state.get("championStats")?;
    candidate.set(
        "archiveRevalidationPending",
        champion.is_some() && stats.is_some(),
    )?;
    let best: Option<f64> = state.get("bestEver")?;
    candidate.set("bestEver", best.unwrap_or(f64::NEG_INFINITY))?;
    if let Some(stats) = stats {
        restore_lap_time(&stats)?;
    }
    let archive: Array = state.get("hallOfFame")?;
    for index in 0..archive.len() {
        restore_lap_time(&archive.get(index)?)?;
    }
    candidate.set("pendingExternalChampion", Value::new_null(ctx.clone()))?;

    let learning: Object = ctx.globals().get("MaleCNSLearning")?;
    let strategy: Constructor = learning.get("EvolutionStrategy")?;
    let graph: Object = candidate.get("graph")?;
    let optimizer: Object = strategy.construct((graph,))?;
    let previous: Object = state.get("optimizer")?;
    for field in ["mean", "sigma", "updates", "episodes"] {
        optimizer.set(field, previous.get::<_, Value>(field)?)?;
    }
    candidate.set("optimizer", optimizer)?;
    let spawn: Function = candidate.get("spawn")?;
    let genomes: Array = state.get("genomes")?;
    // Portable files omit optimizer sample IDs. The new population resumes
    // without attributing old samples to the current evolution strategy.
    spawn.call::<_, ()>((This(candidate.clone()), genomes, false, Array::new(ctx)?))?;
    candidate.set("accumulator", 0.)
}

fn restore_lap_time(record: &Object<'_>) -> Result<()> {
    if record.get::<_, Value>("bestLapTime")?.is_null() {
        record.set("bestLapTime", f64::INFINITY)?;
    }
    Ok(())
}

pub(crate) fn capture<'js>(ctx: Ctx<'js>, sim: &Object<'js>, speed: f64) -> Result<Object<'js>> {
    let mode: String = sim.get("mode")?;
    let optimizer: Option<Object> = sim.get("optimizer")?;
    let Some(optimizer) = optimizer.filter(|_| mode == "connectome") else {
        return Err(rquickjs::Exception::throw_message(
            &ctx,
            "Salva i progressi nella modalità di apprendimento, non durante un test motore.",
        ));
    };
    sim.set("speedMultiplier", speed)?;
    let snapshot = Object::new(ctx.clone())?;
    let circuit: Object = sim.get("circuit")?;
    let random: Object = sim.get("random")?;
    let rng_state: Function = random.get("getState")?;
    for field in [
        "rewardRevision",
        "circuitId",
        "population",
        "mutation",
        "speedMultiplier",
        "generation",
        "seed",
        "stagnation",
        "learningFrontier",
        "history",
        "bestEver",
        "championStats",
        "hallOfFame",
    ] {
        snapshot.set(field, sim.get::<_, Value>(field)?)?;
    }
    let revision: Option<u32> = circuit.get("revision")?;
    snapshot.set(
        "circuitRevision",
        revision.filter(|revision| *revision > 0).unwrap_or(1),
    )?;
    snapshot.set("elapsedAtSave", sim.get::<_, Value>("elapsed")?)?;
    snapshot.set("rngState", rng_state.call::<_, Value>((This(random),))?)?;

    let fly: Object = ctx.globals().get("FlySim")?;
    let clone_genome: Function = fly.get("cloneGenome")?;
    for field in ["champion", "externalChampion"] {
        let genome: Value = sim.get(field)?;
        let genome = if genome.is_null() {
            genome
        } else {
            clone_genome.call((genome,))?
        };
        snapshot.set(field, genome)?;
    }
    let optimizer_snapshot = Object::new(ctx.clone())?;
    for field in ["mean", "sigma", "updates", "episodes"] {
        optimizer_snapshot.set(field, optimizer.get::<_, Value>(field)?)?;
    }
    snapshot.set("optimizer", optimizer_snapshot)?;

    let cars: Array = sim.get("cars")?;
    let genomes = Array::new(ctx)?;
    for index in 0..cars.len() {
        let car: Object = cars.get(index)?;
        let genome: Value = clone_genome.call((car.get::<_, Value>("genome")?,))?;
        genomes.set(index, genome)?;
    }
    snapshot.set("genomes", genomes)?;
    Ok(snapshot)
}

pub(crate) fn graph_signature<'js>(
    ctx: Ctx<'js>,
    graph: &Object<'js>,
    policy: &Object<'js>,
    model: &str,
) -> Result<Object<'js>> {
    let signature = Object::new(ctx.clone())?;
    for (key, source) in [
        ("dataset", "dataset"),
        ("revision", "revision"),
        ("nodes", "n"),
        ("edges", "edgeCount"),
    ] {
        signature.set(key, graph.get::<_, Value>(source)?)?;
    }
    let version: u32 = policy.get("version")?;
    signature.set("policyVersion", version)?;
    signature.set("parameters", policy.get::<_, Value>("length")?)?;
    let outputs: Object = graph.get("outputs")?;
    signature.set("outputs", outputs.get::<_, Value>("length")?)?;

    if model == "v5" {
        signature.set("solver", graph.get::<_, Value>("solver")?)?;
    }
    if model == "v3" {
        if let Some(profile) = graph.get::<_, Option<String>>("sensorProfile")? {
            signature.set("sensorProfile", profile)?;
        }
        if version == 6 {
            for (key, source) in [
                ("decoderProfile", "decoderProfile"),
                ("readoutNormalizationCount", "normalizationCount"),
                ("readoutSignalCount", "signalCount"),
            ] {
                signature.set(key, policy.get::<_, Value>(source)?)?;
            }
        }
    }
    if model == "v5" || (model == "v3" && version == 6) {
        signature.set("gainGroups", policy.get::<_, Value>("gainGroups")?)?;
        let nodes: TypedArray<u32> = policy.get("nodes")?;
        // Copy before creating JavaScript values that may allocate or run the GC.
        let nodes = unsafe { nodes.as_slice() }.to_vec();
        let values = Array::new(ctx)?;
        for (index, value) in nodes.into_iter().enumerate() {
            values.set(index, value)?;
        }
        signature.set("readoutNodes", values)?;
    }
    Ok(signature)
}
