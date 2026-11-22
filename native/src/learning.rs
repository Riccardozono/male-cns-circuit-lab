use rquickjs::{Array, Ctx, Exception, Function, Object, TypedArray};

pub(crate) fn install(ctx: Ctx<'_>) -> rquickjs::Result<()> {
    let globals = ctx.globals();
    globals.set("nativeLearningUpdate", Function::new(ctx.clone(), update)?)?;
    globals.set("nativeLearningSample", Function::new(ctx.clone(), sample)?)?;
    globals.set(
        "nativeLearningExplore",
        Function::new(ctx.clone(), explore)?,
    )?;
    globals.set(
        "nativeLearningReadout",
        Function::new(ctx.clone(), readout)?,
    )?;
    globals.set("nativeLearningInputs", Function::new(ctx.clone(), inputs)?)?;
    Ok(())
}

fn readout<'js>(
    ctx: Ctx<'js>,
    graph: Object<'js>,
    brain: Object<'js>,
    weights: TypedArray<'js, f64>,
    launch: f64,
) -> rquickjs::Result<Array<'js>> {
    let policy: Object = graph.get("learning")?;
    let nodes: TypedArray<u32> = policy.get("nodes")?;
    let count: u32 = policy.get("normalizationCount")?;
    let signal_count: usize = policy.get("signalCount")?;
    let offset: usize = policy.get("readoutOffset")?;
    let norm = 1. / f64::from(count).sqrt();
    let (nodes, weights) = unsafe { (nodes.as_slice(), weights.as_slice()) };
    let mut features = Vec::with_capacity(nodes.len());
    if graph.get::<_, bool>("full")? {
        let active: TypedArray<f32> = brain.get("activity")?;
        let active = unsafe { active.as_slice() };
        features.extend(nodes.iter().map(|&i| f64::from(active[i as usize])));
    } else {
        let active: TypedArray<f64> = brain.get("activity")?;
        let active = unsafe { active.as_slice() };
        features.extend(nodes.iter().map(|&i| active[i as usize]));
    }
    let signal = features
        .iter()
        .take(signal_count)
        .map(|v| v.abs())
        .fold(0., f64::max);
    let mut steering = 0.;
    let mut longitudinal = 0.;
    for (j, value) in features.iter_mut().enumerate() {
        *value = (8. * *value).tanh();
        steering += *value * weights[offset + j * 2] * norm;
        longitudinal += *value * weights[offset + j * 2 + 1] * norm;
    }
    let controls = if signal < 1e-7 {
        [0.; 3]
    } else {
        let steering = (steering + weights[weights.len() - 2]).tanh();
        let longitudinal =
            ((longitudinal + weights[weights.len() - 1]).tanh() + launch).clamp(-1., 1.);
        [steering, longitudinal.max(0.), (-longitudinal).max(0.)]
    };
    let result = Array::new(ctx.clone())?;
    result.set(0, TypedArray::new(ctx.clone(), controls)?)?;
    result.set(1, TypedArray::new(ctx, features)?)?;
    Ok(result)
}

fn inputs<'js>(
    ctx: Ctx<'js>,
    graph: Object<'js>,
    weights: TypedArray<'js, f64>,
    sensors: TypedArray<'js, f64>,
    mapping: u8,
    physics_gain: f64,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    const CHANNELS: usize = 28;
    let visual: TypedArray<u8> = graph.get("inputChannels")?;
    let physics: TypedArray<i8> = graph.get("physicsChannels")?;
    let road: TypedArray<i8> = graph.get("roadChannels")?;
    let (weights, sensors, visual, physics, road) = unsafe {
        (
            weights.as_slice(),
            sensors.as_slice(),
            visual.as_slice(),
            physics.as_slice(),
            road.as_slice(),
        )
    };
    let term = |channel: usize| {
        let raw = sensors
            .get(channel)
            .copied()
            .filter(|v| v.is_finite())
            .unwrap_or(0.);
        let input = if channel < 11 { raw * 2. - 1. } else { raw };
        input * weights[channel] + weights[CHANNELS + channel]
    };
    let mut values = Vec::with_capacity(visual.len());
    for i in 0..visual.len() {
        let value = if mapping == 1 {
            term(i % CHANNELS)
        } else {
            let mut value = term(usize::from(visual[i]));
            if physics[i] >= 11 {
                value += physics_gain * term(physics[i] as usize);
            }
            if road[i] >= 18 {
                value += physics_gain * term(road[i] as usize);
            }
            value
        };
        values.push(0.7 * value);
    }
    TypedArray::new(ctx, values)
}

fn update<'js>(
    ctx: Ctx<'js>,
    mean: TypedArray<'js, f64>,
    sigma: TypedArray<'js, f64>,
    scales: TypedArray<'js, f64>,
    trials: TypedArray<'js, f64>,
    groups: TypedArray<'js, u32>,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    // Synchronous inputs remain rooted and are never written by Rust.
    let (mean, sigma, scales, trials, groups) = unsafe {
        (
            mean.as_slice(),
            sigma.as_slice(),
            scales.as_slice(),
            trials.as_slice(),
            groups.as_slice(),
        )
    };
    let width = mean.len();
    let count = groups.len();
    if width == 0
        || count < 2
        || sigma.len() != width
        || scales.len() != width
        || trials.len() != count * width
    {
        return Err(Exception::throw_message(
            &ctx,
            "Dimensioni dell'ottimizzatore non valide",
        ));
    }
    let elite_count = (count / 2).min(count.div_ceil(4).max(2)).max(1);
    let elite_weights: Vec<_> = (1..=elite_count)
        .map(|rank| (elite_count as f64 + 0.5).ln() - (rank as f64).ln())
        .collect();
    let weight_total = elite_weights.iter().sum::<f64>();
    let mut weights = vec![0.; count];
    let mut scale_weights = vec![0.; count];
    for (i, weight) in elite_weights.into_iter().enumerate() {
        let weight = weight / weight_total;
        weights[i] = weight;
        weights[count - 1 - i] = -weight;
        scale_weights[i] = weight;
    }
    let mut start = 0;
    while start < count {
        let mut end = start + 1;
        while end < count && groups[end] == groups[start] {
            end += 1;
        }
        let samples = (end - start) as f64;
        let tied = weights[start..end].iter().sum::<f64>() / samples;
        let tied_scale = scale_weights[start..end].iter().sum::<f64>() / samples;
        weights[start..end].fill(tied);
        scale_weights[start..end].fill(tied_scale);
        start = end;
    }
    let scale_total = scale_weights.iter().sum::<f64>().max(1e-12);
    let trials = trials.chunks_exact(width);
    let mut result = vec![0.; 2 * width];
    for j in 0..width {
        let (direction, variance) = trials.clone().zip(&weights).zip(&scale_weights).fold(
            (0., 0.),
            |(direction, variance), ((trial, weight), scale)| {
                let delta = trial[j] - mean[j];
                (
                    direction + weight * delta,
                    variance + scale * (delta * delta),
                )
            },
        );
        result[j] = (mean[j] + 0.325 * direction).clamp(-8., 8.);
        result[width + j] = (0.85 * (sigma[j] * sigma[j]) + 0.15 * variance / scale_total)
            .sqrt()
            .clamp(scales[j] * 0.5, scales[j] * 3.);
    }
    TypedArray::new(ctx, result)
}

fn sample<'js>(
    ctx: Ctx<'js>,
    mean: TypedArray<'js, f64>,
    sigma: TypedArray<'js, f64>,
    variation: TypedArray<'js, f64>,
    scale: f64,
    mirrored: bool,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    let (mean, sigma, variation) =
        unsafe { (mean.as_slice(), sigma.as_slice(), variation.as_slice()) };
    if mean.len() != sigma.len() || mean.len() != variation.len() {
        return Err(Exception::throw_message(
            &ctx,
            "Dimensioni del campione non valide",
        ));
    }
    let values = mean
        .iter()
        .zip(sigma)
        .zip(variation)
        .map(|((&value, &sigma), &draw)| {
            if mirrored {
                (2. * value - draw).clamp(-8., 8.)
            } else {
                let radius = (8. - value.abs()).max(0.);
                value + (draw * sigma * scale).clamp(-radius, radius)
            }
        })
        .collect::<Vec<_>>();
    TypedArray::new(ctx, values)
}

fn explore<'js>(
    ctx: Ctx<'js>,
    sigma: TypedArray<'js, f64>,
    scales: TypedArray<'js, f64>,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    let (sigma, scales) = unsafe { (sigma.as_slice(), scales.as_slice()) };
    if sigma.len() != scales.len() {
        return Err(Exception::throw_message(
            &ctx,
            "Dimensioni dell'esplorazione non valide",
        ));
    }
    let values = sigma
        .iter()
        .zip(scales)
        .map(|(current, initial)| (current * 1.2).max(initial * 0.8).min(initial * 3.))
        .collect::<Vec<_>>();
    TypedArray::new(ctx, values)
}
