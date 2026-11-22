use rquickjs::{Ctx, Exception, Function, TypedArray};

pub(crate) fn install(ctx: Ctx<'_>) -> rquickjs::Result<()> {
    let globals = ctx.globals();
    globals.set("nativeLearningUpdate", Function::new(ctx.clone(), update)?)?;
    globals.set("nativeLearningSample", Function::new(ctx.clone(), sample)?)?;
    globals.set(
        "nativeLearningExplore",
        Function::new(ctx.clone(), explore)?,
    )?;
    Ok(())
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
