use rquickjs::{Ctx, Exception, Function, TypedArray};

const PROGRESS: f64 = 1.;
const CHECKPOINT: f64 = 2.;
const LAP: f64 = 3.;
const PACE: f64 = 4.;
const TIME: f64 = -1.;
const SLOW: f64 = -2.;
const REVERSE: f64 = -3.;
const RISK: f64 = -4.;
const SLIP: f64 = -5.;
const IMPACT: f64 = -6.;
const OFF_TRACK: f64 = -7.;
const STALL: f64 = -8.;
const SLOW_PROGRESS: f64 = -9.;
const INVALID: f64 = -10.;

pub fn install(ctx: Ctx<'_>) -> rquickjs::Result<()> {
    let globals = ctx.globals();
    globals.set("nativeRewardStep", Function::new(ctx.clone(), step)?)?;
    globals.set(
        "nativeRewardMissingLaps",
        Function::new(ctx.clone(), missing_laps)?,
    )?;
    globals.set(
        "nativeRewardComparison",
        Function::new(ctx.clone(), lap_comparison)?,
    )?;
    Ok(())
}

fn missing_laps(revision: u8, laps: u8, high_water: f64, circumference: f64) -> f64 {
    if laps == 0 {
        return 2000. + 1000. * (1. - (high_water / circumference).clamp(0., 1.));
    }
    if revision >= 3 && laps == 1 {
        let partial = ((high_water - circumference) / circumference).clamp(0., 1.);
        return 1000. * (1. - partial);
    }
    0.
}

fn lap_comparison<'js>(
    ctx: Ctx<'js>,
    times: TypedArray<'js, f64>,
    reference: f64,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    let mut penalty = 0.;
    let mut lost = 0.;
    if reference > 0. && reference.is_finite() {
        for &time in unsafe { times.as_slice() } {
            penalty += (4000. * (time / reference - 1.).max(0.)).min(3000.);
            lost += (time - reference).max(0.);
        }
    }
    TypedArray::new(ctx, [penalty, lost])
}

pub fn step<'js>(
    ctx: Ctx<'js>,
    packet: TypedArray<'js, f64>,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    // The caller retains ownership of the input packet and has no access to
    // it during this synchronous transition.
    let data = unsafe { packet.as_slice() };
    let &[
        circumference,
        scale,
        reference,
        revision,
        x,
        y,
        along,
        speed,
        slip,
        throttle,
        brake,
        lifetime,
        on_road,
        collision,
        clearance,
        dt,
        old_x,
        old_y,
        old_along,
        mut high_water,
        mut stall_high,
        mut checkpoint,
        mut invalid,
        mut pace_time,
        mut pace_progress,
        mut locked_seconds,
        mut progress,
        mut last_progress_time,
        mut lap_start,
        mut laps,
    ] = data
    else {
        return Err(Exception::throw_message(
            &ctx,
            "Pacchetto ricompense incompleto",
        ));
    };
    let mut effects = Vec::with_capacity(48);
    let travelled = (x - old_x).hypot(y - old_y);
    let mut delta = along - old_along;
    if delta > circumference / 2.0 {
        delta -= circumference;
    }
    if delta < -circumference / 2.0 {
        delta += circumference;
    }
    let continuous = delta.is_finite()
        && travelled.is_finite()
        && travelled <= 120. * scale * dt + 1e-6 * scale
        && delta.abs() <= travelled * 2. + 0.02 * scale;
    invalid = if continuous { 0. } else { invalid + 1. };
    let mut push = |kind: f64, amount: f64| {
        if amount.is_finite() && amount > 0. {
            effects.extend([kind, amount]);
        }
    };
    push(TIME, 120. * dt / reference);
    let speed = speed.abs();
    if speed > 5. {
        push(SLIP, dt * 8. * ((slip.abs() - 0.22) / 0.5).clamp(0., 1.));
        let stopping = (4.619 + speed * speed / (2. * 9.80665 * 1.3)) * scale;
        push(
            RISK,
            dt * 4. * ((stopping - clearance) / stopping).clamp(0., 1.),
        );
    }
    if revision >= 2. {
        let prior = locked_seconds;
        let min_speed = (circumference / reference * 0.075).max(0.6);
        let locked = high_water > 20. * scale
            && continuous
            && on_road != 0.
            && collision == 0.
            && speed < min_speed
            && delta.abs() / (scale * dt) <= 0.5
            && brake >= 0.05
            && throttle <= 0.05;
        locked_seconds = if locked { prior + dt } else { 0. };
        if locked {
            push(
                STALL,
                350. * ((locked_seconds - 2.).max(0.) - (prior - 2.).max(0.)),
            );
        }
    }
    let previous_high = high_water;
    if continuous && on_road != 0. && collision == 0. {
        let before = progress;
        progress += delta;
        push(REVERSE, (-delta).max(0.) / circumference * 9000.);
        let high = progress.max(high_water).min(circumference * 2.);
        push(PROGRESS, (high - high_water) / circumference * 5000.);
        high_water = high;
        if high - stall_high >= scale {
            stall_high = high;
            last_progress_time = lifetime;
        }
        let spacing = circumference / 32.;
        while delta > 0. && checkpoint <= 64. && progress >= checkpoint * spacing - 1e-9 {
            if before > checkpoint * spacing + 1e-6 * scale {
                break;
            }
            push(CHECKPOINT, 500. / 32.);
            if (checkpoint as u32).is_multiple_of(32) {
                let crossing =
                    lifetime - dt + dt * ((checkpoint * spacing - before) / delta).clamp(0., 1.);
                let time = crossing - lap_start;
                let ratio = time / reference;
                let pace = 2000. * (1. / ratio.max(1e-9) - 1.).clamp(0., 1.);
                let slow = 4000. * (ratio - 1.).clamp(0., 2.);
                laps += 1.;
                lap_start = crossing;
                // The stream also records a lap boundary so the original
                // ledger API can apply the historical comparison at this point.
                push(5., time);
                push(LAP, 8000.);
                push(PACE, pace);
                push(SLOW, slow);
            }
            checkpoint += 1.;
        }
    }
    let mut reason = if collision != 0. {
        push(IMPACT, 900. + 180. * (speed / 70.).clamp(0., 1.));
        1.
    } else if on_road == 0. {
        push(OFF_TRACK, 1400. + 180. * (speed / 70.).clamp(0., 1.));
        2.
    } else if invalid >= 3. {
        push(INVALID, 1200.);
        3.
    } else if laps >= 2. {
        4.
    } else if lifetime - last_progress_time > 8. {
        push(STALL, 1400.);
        5.
    } else {
        0.
    };
    if reason == 0. && lifetime - pace_time >= 8. {
        let recent = (high_water - pace_progress) / (lifetime - pace_time);
        let minimum = circumference / reference * 0.075;
        if lifetime >= 16. && recent < minimum {
            push(SLOW_PROGRESS, 1400.);
            let factor = if revision == 5. { 1.25 } else { 1. };
            let recovering = revision >= 4.
                && speed >= minimum * factor / scale
                && high_water > previous_high + 1e-12;
            if !recovering {
                reason = 6.;
            }
        }
        pace_time = lifetime;
        pace_progress = high_water;
    }
    let mut output = vec![
        if continuous { 1. } else { 0. },
        high_water,
        stall_high,
        checkpoint,
        invalid,
        pace_time,
        pace_progress,
        locked_seconds,
        progress,
        last_progress_time,
        lap_start,
        reason,
    ];
    output.extend(effects);
    TypedArray::new(ctx, output)
}
