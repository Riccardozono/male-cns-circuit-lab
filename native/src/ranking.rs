use rquickjs::{Coerced, Ctx, Function, Object, Result, Value};

const PROGRESS_EPSILON: f64 = 1e-9;

#[derive(Clone, Copy)]
struct Outcome {
    fitness: f64,
    laps: f64,
    progress: f64,
    lap_time: f64,
}

impl Outcome {
    fn from_agent(agent: Option<&Object<'_>>) -> Result<Self> {
        let progress = property(agent, "bestProgress")?;
        let progress = if progress
            .as_ref()
            .is_none_or(|v| v.is_null() || v.is_undefined())
        {
            property(agent, "progress")?
        } else {
            progress
        };
        Ok(Self {
            fitness: finite(property(agent, "fitness")?, f64::NEG_INFINITY),
            laps: number_or_zero(property(agent, "laps")?)?,
            progress: number_or_zero(progress)?,
            lap_time: finite(property(agent, "bestLapTime")?, f64::INFINITY),
        })
    }

    fn race(self, other: Self) -> f64 {
        if self.fitness != other.fitness {
            return if self.fitness > other.fitness {
                -1.
            } else {
                1.
            };
        }
        self.laps_time_progress(other)
    }

    fn learning(self, other: Self) -> f64 {
        if self.laps != other.laps {
            return other.laps - self.laps;
        }
        let progress = other.progress - self.progress;
        if self.laps == 0. && progress.abs() > PROGRESS_EPSILON {
            return progress;
        }
        if self.fitness != other.fitness {
            return other.fitness - self.fitness;
        }
        self.laps_time_progress(other)
    }

    fn laps_time_progress(self, other: Self) -> f64 {
        if self.laps != other.laps {
            return other.laps - self.laps;
        }
        if self.laps > 0. && self.lap_time != other.lap_time {
            return self.lap_time - other.lap_time;
        }
        let progress = other.progress - self.progress;
        if progress.abs() > PROGRESS_EPSILON {
            progress
        } else {
            0.
        }
    }

    fn frontier(self, other: Self, tolerance: f64) -> f64 {
        let laps = other.laps - self.laps;
        if laps != 0. && !laps.is_nan() {
            return laps;
        }
        let progress = other.progress - self.progress;
        if progress.abs() > tolerance {
            return progress;
        }
        self.lap_time - other.lap_time
    }
}

fn property<'js>(source: Option<&Object<'js>>, key: &str) -> Result<Option<Value<'js>>> {
    source.map(|object| object.get(key)).transpose()
}

fn finite(value: Option<Value<'_>>, fallback: f64) -> f64 {
    value
        .and_then(|v| v.as_number())
        .filter(|n| n.is_finite())
        .unwrap_or(fallback)
}

fn number_or_zero(value: Option<Value<'_>>) -> Result<f64> {
    let Some(value) = value else {
        return Ok(0.);
    };
    let Coerced(number) = value.get::<Coerced<f64>>()?;
    Ok(if number.is_nan() { 0. } else { number })
}

fn flag(value: Option<Value<'_>>) -> Result<bool> {
    value.map_or(Ok(false), |v| v.get::<Coerced<bool>>().map(|b| b.0))
}

fn safe(agent: Option<Object<'_>>) -> Result<bool> {
    let Some(agent) = agent else {
        return Ok(true);
    };
    let inner: Value = agent.get("car")?;
    let car = inner.as_object().unwrap_or(&agent);
    if flag(property(Some(car), "censored")?)? || flag(property(Some(car), "overlap")?)? {
        return Ok(false);
    }
    let reason: Value = car.get("reason")?;
    if flag(Some(reason.clone()))? {
        let Coerced(reason) = reason.get::<Coerced<String>>()?;
        if matches!(
            reason.trim().to_lowercase().as_str(),
            "urto"
                | "fuori pista"
                | "progresso non valido"
                | "collision"
                | "off track"
                | "invalid progress"
        ) {
            return Ok(false);
        }
    }
    let ledger: Value = car.get("rewardBreakdown")?;
    let penalties = property(ledger.as_object(), "penalties")?;
    let penalties = penalties.as_ref().and_then(Value::as_object);
    for key in ["collision", "offTrack", "invalid"] {
        if number_or_zero(property(penalties, key)?)? > 0. {
            return Ok(false);
        }
    }
    Ok(true)
}

fn compare(kind: u8, a: Option<Object<'_>>, b: Option<Object<'_>>, tolerance: f64) -> Result<f64> {
    let a_result = Outcome::from_agent(a.as_ref())?;
    let b_result = Outcome::from_agent(b.as_ref())?;
    if kind == 0 {
        return Ok(a_result.race(b_result));
    }
    if kind == 3 {
        return Ok(a_result.frontier(b_result, tolerance));
    }
    match (safe(a)?, safe(b)?) {
        (true, false) => Ok(-1.),
        (false, true) => Ok(1.),
        (false, false) if kind == 2 => Ok(a_result.race(b_result)),
        _ => Ok(a_result.learning(b_result)),
    }
}

pub(crate) fn install(ctx: Ctx<'_>) -> Result<()> {
    let globals = ctx.globals();
    globals.set("MaleCNSNativeCompare", Function::new(ctx.clone(), compare)?)?;
    globals.set("MaleCNSNativeSafeOutcome", Function::new(ctx, safe)?)
}

#[cfg(test)]
mod tests {
    use super::install;
    use rquickjs::{Context, Runtime};

    #[test]
    fn ranks_race_pace_and_safety_as_separate_objectives() {
        let rt = Runtime::new().unwrap();
        let context = Context::full(&rt).unwrap();
        context.with(|ctx| {
            install(ctx.clone()).unwrap();
            let matched: bool = ctx
                .eval(
                    r#"
                (() => {
                    const compare = (kind, a, b) => MaleCNSNativeCompare(kind, a, b, 0);
                    const idle = { fitness: 0, laps: 0, bestProgress: 20 };
                    const far = { fitness: -3000, laps: 0, bestProgress: 600 };
                    const impact = { ...far, fitness: -4000, reason: ' URTO ' };
                    const invalid = { ...far, fitness: -9000, bestProgress: 1100,
                                      car: { rewardBreakdown: { penalties: { invalid: 3 } } } };
                    const lap = { ...idle, laps: 1, bestLapTime: 120 };
                    return compare(0, idle, far) < 0
                        && compare(1, far, idle) < 0
                        && compare(1, far, impact) < 0
                        && compare(1, invalid, impact) < 0
                        && compare(2, impact, invalid) < 0
                        && compare(1, lap, far) < 0
                        && compare(1, lap, { ...lap, bestLapTime: 130 }) < 0
                        && compare(0, idle, { ...idle, bestProgress: 20 + 5e-10 }) === 0
                        && compare(3, idle, { ...idle, bestProgress: 20 + 5e-10 }) > 0
                        && Number.isNaN(compare(3, idle, idle));
                })()
            "#,
                )
                .unwrap();
            assert!(matched);
        });
    }
}
