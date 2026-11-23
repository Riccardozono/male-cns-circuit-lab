use crate::engine::{TrialHit, TrialProgress};
use rquickjs::{Ctx, Error, Function, Result, TypedArray};
use std::{cell::RefCell, rc::Rc, time::Instant};

pub type Shared = Rc<RefCell<Option<Tracker>>>;

const AGENT_LIMIT: usize = 100;

#[derive(Clone, Copy)]
struct Agent {
    id: usize,
    alive: bool,
    diagnostic: bool,
    completed: bool,
    laps: u32,
    progress: f64,
    lap_times: [f64; 2],
    timed_laps: u32,
    last_crossing: f64,
}

impl Agent {
    fn from_row(row: &[f64; 8]) -> Self {
        let flags = row[1] as u8;
        Self {
            id: row[0] as usize,
            alive: flags & 1 != 0,
            diagnostic: flags & 2 != 0,
            completed: flags & 4 != 0,
            laps: row[2] as u32,
            progress: row[3],
            lap_times: [row[4], row[5]],
            last_crossing: row[6],
            timed_laps: row[7] as u32,
        }
    }

    fn valid_two_laps(self) -> bool {
        self.laps == 2
            && self.completed
            && self.timed_laps == 2
            && self.lap_times.iter().all(|t| t.is_finite() && *t > 0.)
    }
}

#[derive(Clone, Copy)]
struct Tick {
    generation: u64,
    elapsed: f64,
    scale: f64,
    actor: bool,
}

struct Clock {
    started: Instant,
    offset: f64,
    limit: f64,
}

pub struct Tracker {
    pub progress: TrialProgress,
    finishes: [Option<f64>; AGENT_LIMIT],
    clock: Option<Clock>,
}

impl Tracker {
    pub fn new() -> Self {
        Self {
            progress: TrialProgress {
                ticks: 0,
                generations: 0,
                current_generation: 1,
                max_laps: 0,
                best_progress_meters: 0.,
                hit: None,
                generation_sim_seconds: None,
                done: false,
                limit_reached: false,
            },
            finishes: [None; AGENT_LIMIT],
            clock: None,
        }
    }

    pub fn begin_batch(&mut self, offset: f64, limit: f64) {
        self.clock = Some(Clock {
            started: Instant::now(),
            offset,
            limit,
        });
    }

    pub fn finish_time(&self, car: usize) -> Option<f64> {
        self.finishes.get(car).copied().flatten()
    }

    fn observe(
        &mut self,
        tick: Tick,
        cars: impl Iterator<Item = Agent> + Clone,
        read_clock: impl FnOnce() -> (f64, f64),
    ) -> bool {
        let result = &mut self.progress;
        if result.done {
            return true;
        }
        result.ticks += 1;
        result.current_generation = tick.generation;
        let eligible = cars.clone().filter(|car| !car.diagnostic);
        for car in eligible.clone() {
            result.max_laps = result.max_laps.max(car.laps);
            result.best_progress_meters =
                result.best_progress_meters.max(car.progress / tick.scale);
        }

        let (time, limit) = read_clock();
        if limit > 0. && time >= limit {
            result.limit_reached = true;
            result.done = true;
            return true;
        }
        if tick.actor {
            for car in eligible.clone().filter(|c| c.laps == 2 && c.completed) {
                if let Some(finish) = self.finishes.get_mut(car.id) {
                    finish.get_or_insert(time);
                }
            }
        }
        if result.hit.is_none() {
            let first = eligible.filter(|car| car.valid_two_laps()).min_by(|a, b| {
                a.last_crossing
                    .partial_cmp(&b.last_crossing)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.id.cmp(&b.id))
            });
            result.hit = first.map(|car| TrialHit {
                generation: tick.generation,
                agent_id: car.id,
                lap_times: car.lap_times,
                two_lap_sim_seconds: car.lap_times.iter().sum(),
                wall_to_two_laps_seconds: time,
            });
        }
        if cars.into_iter().all(|car| !car.alive) {
            result.generations += 1;
            if tick.actor
                || result
                    .hit
                    .as_ref()
                    .is_some_and(|hit| hit.generation == tick.generation)
            {
                result.generation_sim_seconds = Some(tick.elapsed);
                result.done = true;
            }
        }
        result.done
    }
}

pub fn install(ctx: Ctx<'_>, state: Shared) -> Result<()> {
    let observe =
        move |generation: u64, elapsed: f64, scale: f64, actor: bool, packet: TypedArray<f64>| {
            // The source array stays rooted in this worker until the callback returns.
            let packet = unsafe { packet.as_slice() };
            let (rows, rest) = packet.as_chunks::<8>();
            if rows.is_empty()
                || rows.len() > AGENT_LIMIT
                || !rest.is_empty()
                || !scale.is_finite()
                || scale <= 0.
            {
                return Err(Error::new_from_js_message(
                    "Float64Array",
                    "TrialTracker",
                    "Telemetria del confronto non valida",
                ));
            }
            let mut slot = state.borrow_mut();
            let Some(trial) = slot.as_mut() else {
                return Ok(false);
            };
            let clock = trial
                .clock
                .as_ref()
                .map(|clock| (clock.started, clock.offset, clock.limit));
            let tick = Tick {
                generation,
                elapsed,
                scale,
                actor,
            };
            Ok(trial.observe(tick, rows.iter().map(Agent::from_row), || {
                clock.map_or((0., 0.), |(start, offset, limit)| {
                    (offset + start.elapsed().as_secs_f64(), limit)
                })
            }))
        };
    let globals = ctx.globals();
    globals.set("nativeTrialObserve", Function::new(ctx.clone(), observe)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOVING: Agent = Agent {
        id: 1,
        alive: true,
        diagnostic: false,
        completed: false,
        laps: 0,
        progress: 0.,
        lap_times: [f64::NAN; 2],
        timed_laps: 0,
        last_crossing: 0.,
    };
    const FINISH: Agent = Agent {
        id: 0,
        alive: false,
        diagnostic: false,
        completed: true,
        laps: 2,
        progress: 2000.,
        lap_times: [41., 43.],
        timed_laps: 2,
        last_crossing: 84.,
    };
    const TICK: Tick = Tick {
        generation: 1,
        elapsed: 84.,
        scale: 2.,
        actor: true,
    };

    #[test]
    fn waits_for_the_rest_of_the_generation() {
        let mut tracker = Tracker::new();
        assert!(!tracker.observe(TICK, [FINISH, MOVING].into_iter(), || (1., 0.)));
        assert!(
            tracker.observe(
                TICK,
                [
                    FINISH,
                    Agent {
                        alive: false,
                        ..MOVING
                    }
                ]
                .into_iter(),
                || (2., 0.)
            )
        );
        assert_eq!(tracker.progress.ticks, 2);
        assert_eq!(tracker.progress.generations, 1);
        assert_eq!(tracker.progress.best_progress_meters, 1000.);
        assert_eq!(tracker.progress.generation_sim_seconds, Some(84.));
        assert_eq!(tracker.finish_time(0), Some(1.));
    }

    #[test]
    fn the_second_lap_after_the_deadline_does_not_count() {
        let mut tracker = Tracker::new();
        assert!(tracker.observe(TICK, [FINISH].into_iter(), || (60.01, 60.)));
        assert!(tracker.progress.limit_reached);
        assert!(tracker.progress.hit.is_none());
        assert_eq!(tracker.finish_time(0), None);
    }

    #[test]
    fn deadline_censors_a_generation_even_after_both_laps() {
        let mut tracker = Tracker::new();
        assert!(!tracker.observe(TICK, [FINISH, MOVING].into_iter(), || (59.9, 60.)));
        assert!(
            tracker.observe(
                TICK,
                [
                    FINISH,
                    Agent {
                        alive: false,
                        ..MOVING
                    }
                ]
                .into_iter(),
                || (60., 60.)
            )
        );
        assert!(tracker.progress.limit_reached);
        assert_eq!(tracker.progress.generations, 0);
        assert_eq!(
            tracker
                .progress
                .hit
                .as_ref()
                .map(|hit| hit.two_lap_sim_seconds),
            Some(84.)
        );
    }

    #[test]
    fn picks_the_first_crossing_and_excludes_diagnostic_cars() {
        let mut tracker = Tracker::new();
        let early_diagnostic = Agent {
            id: 2,
            diagnostic: true,
            last_crossing: 80.,
            ..FINISH
        };
        let early = Agent {
            id: 1,
            last_crossing: 83.,
            ..FINISH
        };
        assert!(
            tracker.observe(TICK, [FINISH, early_diagnostic, early].into_iter(), || (
                1., 0.
            ))
        );
        assert_eq!(
            tracker.progress.hit.as_ref().map(|hit| hit.agent_id),
            Some(1)
        );
        assert_eq!(tracker.finish_time(2), None);
    }

    #[test]
    fn a_failed_decoder_episode_finishes_without_a_hit() {
        let mut tracker = Tracker::new();
        let stopped = Agent {
            alive: false,
            ..MOVING
        };
        assert!(tracker.observe(TICK, [stopped].into_iter(), || (1., 0.)));
        assert_eq!(tracker.progress.generations, 1);
        assert_eq!(tracker.progress.generation_sim_seconds, Some(TICK.elapsed));
        assert!(tracker.progress.hit.is_none());
    }
}
