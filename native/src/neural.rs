//! Float64 neural propagation for V2 and V3. Orders, weights, gain groups and
//! recurrence follow the reference dense-neural.js implementation.
use rquickjs::{Array, Ctx, Object, Result, TypedArray};

pub fn dense<'js>(
    ctx: Ctx<'js>,
    graph: Object<'js>,
    brain: Object<'js>,
    iterations: u32,
    edges_enabled: bool,
    gains: Option<TypedArray<'js, f32>>,
) -> Result<Array<'js>> {
    let from: TypedArray<u32> = graph.get("from")?;
    let to: TypedArray<u32> = graph.get("to")?;
    let weights: TypedArray<f64> = graph.get("weights")?;
    let active: TypedArray<f64> = brain.get("activity")?;
    let injection: TypedArray<f64> = brain.get("injection")?;
    let groups: Option<TypedArray<u8>> = if gains.is_some() {
        let learning: Object = graph.get("learning")?;
        Some(learning.get("groups")?)
    } else {
        None
    };
    // These typed arrays belong to the worker's private JS context. No JS
    // executes while Rust reads them, and Rust writes only to its own buffers.
    let mut activity = unsafe { active.as_slice() }.to_vec();
    let n = activity.len();
    let from = unsafe { from.as_slice() };
    let to = unsafe { to.as_slice() };
    let weights = unsafe { weights.as_slice() };
    let injection = unsafe { injection.as_slice() };
    let source_gain = if let (Some(gains), Some(groups)) = (&gains, &groups) {
        let gains = unsafe { gains.as_slice() };
        let groups = unsafe { groups.as_slice() };
        groups
            .iter()
            .map(|&group| f64::from(gains[group as usize]))
            .collect::<Vec<_>>()
    } else {
        vec![1.0; n]
    };
    let mut next = vec![0.0; n];
    let mut sum = vec![0.0; n];
    for _ in 0..iterations {
        sum.copy_from_slice(injection);
        if edges_enabled {
            for ((&a, &b), &weight) in from.iter().zip(to).zip(weights) {
                let a = a as usize;
                sum[b as usize] += (0.9 * weight) * activity[a] * source_gain[a];
            }
        }
        for ((out, &current), &input) in next.iter_mut().zip(&activity).zip(&sum) {
            *out = 0.45 * current + 0.55 * input.tanh();
        }
        std::mem::swap(&mut activity, &mut next);
    }
    let result = Array::new(ctx.clone())?;
    result.set(0, TypedArray::new(ctx.clone(), activity)?)?;
    result.set(1, TypedArray::new(ctx.clone(), next)?)?;
    result.set(2, TypedArray::new(ctx, sum)?)?;
    Ok(result)
}

fn mark(index: usize, markers: &mut [bool], touched: &mut Vec<usize>) {
    if !markers[index] {
        markers[index] = true;
        touched.push(index);
    }
}

fn bucket(value: f32) -> usize {
    (f64::from(value).abs() * 255.0).floor().min(255.0) as usize
}

fn select(
    budget: usize,
    candidates: &[u32],
    next: &mut [f32],
    core: &[u8],
    outputs: &[u8],
    marks: &mut [bool],
    active: &mut Vec<u32>,
) {
    active.clear();
    if candidates.len() <= budget {
        active.extend_from_slice(candidates);
        return;
    }
    for &node in candidates {
        if active.len() == budget {
            break;
        }
        if outputs[node as usize] != 0 {
            active.push(node);
            marks[node as usize] = true;
        }
    }
    for core_group in [true, false] {
        let capacity = budget - active.len();
        if capacity == 0 {
            break;
        }
        let mut bins = [0; 256];
        let mut total = 0;
        for &node in candidates {
            let i = node as usize;
            if !marks[i] && (core[i] != 0) == core_group {
                bins[bucket(next[i])] += 1;
                total += 1;
            }
        }
        if total == 0 {
            continue;
        }
        let (mut cutoff, mut left_at_cutoff) = (0, capacity);
        if total > capacity {
            cutoff = 255;
            while cutoff > 0 && bins[cutoff] <= left_at_cutoff {
                left_at_cutoff -= bins[cutoff];
                cutoff -= 1;
            }
        }
        for &node in candidates {
            if active.len() == budget {
                break;
            }
            let i = node as usize;
            if marks[i] || (core[i] != 0) != core_group {
                continue;
            }
            let strength = bucket(next[i]);
            if total <= capacity || strength > cutoff || (strength == cutoff && left_at_cutoff > 0)
            {
                if strength == cutoff && total > capacity {
                    left_at_cutoff -= 1;
                }
                active.push(node);
                marks[i] = true;
            }
        }
    }
    for &node in candidates {
        let i = node as usize;
        if marks[i] {
            marks[i] = false;
        } else {
            next[i] = 0.0;
        }
    }
}

/// Sparse V4/V5 propagation. Sum and activation values retain the reference
/// Float32 storage boundaries and Float64 intermediates.
pub fn sparse<'js>(
    ctx: Ctx<'js>,
    graph: Object<'js>,
    brain: Object<'js>,
    iterations: u32,
    edges_enabled: bool,
    gains: Option<TypedArray<'js, f32>>,
) -> Result<Array<'js>> {
    let offsets: TypedArray<u32> = graph.get("rowOffsets")?;
    let targets: TypedArray<u32> = graph.get("targets")?;
    let weights: TypedArray<f32> = graph.get("csrWeights")?;
    let inputs: TypedArray<u32> = graph.get("inputs")?;
    let core: TypedArray<u8> = graph.get("coreMask")?;
    let outputs: TypedArray<u8> = graph.get("outputMask")?;
    let activity: TypedArray<f32> = brain.get("activity")?;
    let next: TypedArray<f32> = brain.get("next")?;
    let active: TypedArray<u32> = brain.get("active")?;
    let drive: TypedArray<f32> = brain.get("inputDrive")?;
    let active_count: usize = brain.get("activeCount")?;
    let groups: Option<TypedArray<u8>> = if gains.is_some() {
        let learning: Object = graph.get("learning")?;
        Some(learning.get("groups")?)
    } else {
        None
    };
    let solver: Option<Object> = graph.get("solver")?;
    let budget: usize = solver
        .as_ref()
        .and_then(|value| value.get("activeNeuronBudget").ok())
        .unwrap_or(16_384);
    let threshold: f64 = solver
        .as_ref()
        .and_then(|value| value.get("activityThreshold").ok())
        .unwrap_or(0.0005);
    let minimum: f64 = solver
        .as_ref()
        .and_then(|value| value.get("edgeContributionThreshold").ok())
        .unwrap_or(0.0000005);
    // The worker owns the buffers and does not call JS while borrowing them.
    let offsets = unsafe { offsets.as_slice() };
    let targets = unsafe { targets.as_slice() };
    let weights = unsafe { weights.as_slice() };
    let inputs = unsafe { inputs.as_slice() };
    let core = unsafe { core.as_slice() };
    let outputs = unsafe { outputs.as_slice() };
    let drive = unsafe { drive.as_slice() };
    let gains = gains.as_ref().map(|values| unsafe { values.as_slice() });
    let groups = groups.as_ref().map(|values| unsafe { values.as_slice() });
    let gain = |source| match (gains, groups) {
        (Some(gains), Some(groups)) => f64::from(gains[groups[source] as usize]),
        _ => 1.0,
    };
    let mut activity = unsafe { activity.as_slice() }.to_vec();
    let mut next = unsafe { next.as_slice() }.to_vec();
    let active_indices = unsafe { active.as_slice() };
    let mut active = active_indices[..active_count].to_vec();
    let n = activity.len();
    let mut sum = vec![0.0f32; n];
    let mut marked = vec![false; n];
    let mut touched = Vec::new();
    let mut candidates = Vec::new();
    let mut peak = 0;
    let mut core_count = 0;
    for _ in 0..iterations {
        touched.clear();
        candidates.clear();
        for (&index, &value) in inputs.iter().zip(drive) {
            if f64::from(value).abs() >= minimum {
                let i = index as usize;
                mark(i, &mut marked, &mut touched);
                sum[i] += value;
            }
        }
        for &source in &active {
            let i = source as usize;
            let value = f64::from(activity[i]);
            mark(i, &mut marked, &mut touched);
            if !edges_enabled || value.abs() < threshold {
                continue;
            }
            let source_gain = gain(i);
            let range = offsets[i] as usize..offsets[i + 1] as usize;
            for (&weight, &target) in weights[range.clone()].iter().zip(&targets[range]) {
                let contribution = 0.9 * f64::from(weight) * value * source_gain;
                if contribution.abs() < minimum {
                    continue;
                }
                let j = target as usize;
                mark(j, &mut marked, &mut touched);
                sum[j] = (f64::from(sum[j]) + contribution) as f32;
            }
        }
        core_count = 0;
        for &index in &touched {
            let value = 0.45 * f64::from(activity[index]) + 0.55 * f64::from(sum[index]).tanh();
            sum[index] = 0.0;
            marked[index] = false;
            next[index] = if value.abs() >= threshold {
                candidates.push(index as u32);
                core_count += usize::from(core[index]);
                value as f32
            } else {
                0.0
            };
        }
        select(
            budget.min(n),
            &candidates,
            &mut next,
            core,
            outputs,
            &mut marked,
            &mut active,
        );
        peak = peak.max(active.len());
        std::mem::swap(&mut activity, &mut next);
    }
    let result = Array::new(ctx.clone())?;
    result.set(0, TypedArray::new(ctx.clone(), activity)?)?;
    result.set(1, TypedArray::new(ctx.clone(), next)?)?;
    result.set(2, TypedArray::new(ctx, active)?)?;
    result.set(3, touched.len())?;
    result.set(4, core_count)?;
    result.set(5, peak)?;
    Ok(result)
}
