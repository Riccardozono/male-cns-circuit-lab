use crate::engine::{Engine, Frame, Result, Setup, Track};
use serde::Deserialize;
use serde_json::value::RawValue;
use std::{sync::mpsc, thread};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedPool {
    pub model_id: String,
    pub circuit_id: String,
    workers: Vec<SavedWorker>,
    global_champion: Box<RawValue>,
}

impl SavedPool {
    pub fn count(&self) -> usize {
        self.workers.len()
    }
}

#[derive(Deserialize)]
struct SavedWorker {
    state: Box<RawValue>,
}

type Job = Box<dyn FnOnce(&Engine) + Send>;
type Reply<T> = mpsc::Receiver<std::result::Result<T, String>>;

struct Island {
    sender: mpsc::Sender<Job>,
    thread: Option<thread::JoinHandle<()>>,
}

impl Island {
    fn launch(index: usize) -> Result<Self> {
        let (sender, jobs) = mpsc::channel::<Job>();
        let (ready, startup) = mpsc::sync_channel(1);
        let thread = thread::Builder::new()
            .name(format!("male-cns-worker-{index}"))
            .stack_size(8 * 1024 * 1024)
            .spawn(move || match Engine::new() {
                Ok(engine) => {
                    if ready.send(Ok(())).is_ok() {
                        while let Ok(job) = jobs.recv() {
                            job(&engine);
                        }
                    }
                }
                Err(error) => {
                    let _ = ready.send(Err(error.to_string()));
                }
            })?;
        startup
            .recv()?
            .map_err(|message| -> Box<dyn std::error::Error> { message.into() })?;
        Ok(Self {
            sender,
            thread: Some(thread),
        })
    }

    fn send<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Engine) -> Result<T> + Send + 'static,
    ) -> Result<Reply<T>> {
        let (answer, result) = mpsc::channel();
        self.sender
            .send(Box::new(move |engine| {
                let _ = answer.send(work(engine).map_err(|error| error.to_string()));
            }))
            .map_err(|_| "Worker di simulazione disconnesso")?;
        Ok(result)
    }
}

impl Drop for Island {
    fn drop(&mut self) {
        let (closed, end) = mpsc::channel();
        drop(end);
        drop(std::mem::replace(&mut self.sender, closed));
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

fn wait<T>(reply: Reply<T>) -> Result<T> {
    reply.recv()?.map_err(Into::into)
}

pub(crate) struct Pool {
    pub primary: Engine,
    other: Vec<Island>,
    generations: Vec<u32>,
    seeds: Vec<u32>,
    global_champion: String,
    restored_champion: bool,
    resume_due: bool,
    model: String,
    single_for_smoke: bool,
}

impl Pool {
    pub fn new(single_for_smoke: bool) -> Result<Self> {
        Ok(Self {
            primary: Engine::new_gpu()?,
            other: Vec::new(),
            generations: Vec::new(),
            seeds: Vec::new(),
            global_champion: "null".into(),
            restored_champion: false,
            resume_due: false,
            model: String::new(),
            single_for_smoke,
        })
    }

    pub fn count(&self) -> usize {
        self.other.len() + 1
    }

    pub fn view(&self, mut frame: Frame) -> Frame {
        frame.worker_count = self.count();
        frame
    }

    fn default_count(&self, model: &str) -> usize {
        if self.single_for_smoke || matches!(model, "v4" | "v5") {
            1
        } else {
            (thread::available_parallelism().map_or(2, usize::from) / 2)
                .saturating_sub(1)
                .clamp(1, 32)
        }
    }

    pub fn start(&mut self, settings: &Setup) -> Result<(Track, Frame, crate::atlas::Points)> {
        let count = if self.model == settings.model {
            self.count()
        } else {
            self.default_count(&settings.model)
        };
        let mut new_pool = Pool::new(self.single_for_smoke)?;
        let mut waiting = Vec::with_capacity(count.saturating_sub(1));
        for index in 1..count {
            let peer = Island::launch(index)?;
            let mut options = settings.clone();
            options.seed = if self.model == settings.model {
                self.seeds.get(index).copied()
            } else {
                None
            }
            .unwrap_or_else(|| settings.seed.wrapping_add(index as u32 * 100003));
            new_pool.seeds.push(options.seed);
            waiting.push(
                peer.send(move |engine| engine.start(&options).map(|(_, frame)| frame.generation))?,
            );
            new_pool.other.push(peer);
        }
        let (track, frame) = new_pool.primary.start(settings)?;
        let atlas = new_pool.primary.atlas()?;
        new_pool.generations.push(frame.generation);
        new_pool.seeds.insert(0, settings.seed);
        for reply in waiting {
            new_pool.generations.push(wait(reply)?);
        }
        new_pool.model.clone_from(&settings.model);
        *self = new_pool;
        Ok((track, self.view(frame), atlas))
    }

    pub fn load_checked(
        &mut self,
        input: SavedPool,
    ) -> Result<(Setup, Track, Frame, crate::atlas::Points)> {
        let mut candidate = Pool::new(self.single_for_smoke)?;
        let mut states = input.workers.into_iter();
        let Some(first) = states.next() else {
            return Err("Il file non contiene worker".into());
        };
        let mut waiting = Vec::new();
        for (index, state) in states.enumerate() {
            let peer = Island::launch(index + 1)?;
            let (model, circuit) = (input.model_id.clone(), input.circuit_id.clone());
            waiting.push(peer.send(move |engine| {
                let setup = engine.restore_state(&model, &circuit, state.state.get())?;
                Ok((engine.snapshot()?.generation, setup.seed))
            })?);
            candidate.other.push(peer);
        }
        let setup = candidate.primary.restore_state(
            &input.model_id,
            &input.circuit_id,
            first.state.get(),
        )?;
        let track = candidate.primary.track()?;
        let frame = candidate.primary.snapshot()?;
        let atlas = candidate.primary.atlas()?;
        candidate.generations.push(frame.generation);
        candidate.seeds.push(setup.seed);
        for reply in waiting {
            let (generation, seed) = wait(reply)?;
            candidate.generations.push(generation);
            candidate.seeds.push(seed);
        }
        candidate.model = input.model_id;
        candidate.global_champion = input.global_champion.get().to_owned();
        candidate.restored_champion = candidate.global_champion != "null";
        candidate.resume_due = candidate.restored_champion;
        *self = candidate;
        Ok((setup, track, self.view(frame), atlas))
    }

    pub fn save(&self, speed: f64) -> Result<String> {
        let waiting = self
            .other
            .iter()
            .map(|peer| peer.send(move |engine| engine.capture(speed)))
            .collect::<Result<Vec<_>>>()?;
        let mut states = vec![self.primary.capture(speed)?];
        for reply in waiting {
            states.push(wait(reply)?);
        }
        self.primary
            .encode_pool(&serde_json::to_string(&states)?, &self.global_champion)
    }

    pub fn mutation(&self, mutation: f64) -> Result<()> {
        let waiting = self
            .other
            .iter()
            .map(|peer| peer.send(move |engine| engine.mutation(mutation)))
            .collect::<Result<Vec<_>>>()?;
        self.primary.mutation(mutation)?;
        for reply in waiting {
            wait(reply)?;
        }
        Ok(())
    }

    fn broadcast(&self) -> Result<()> {
        if self.global_champion == "null" {
            return Ok(());
        }
        for peer in &self.other {
            let champion = self.global_champion.clone();
            wait(peer.send(move |engine| engine.adopt(&champion))?)?;
        }
        self.primary.adopt(&self.global_champion)
    }

    pub fn advance(&mut self, ticks: u32) -> Result<Frame> {
        if self.resume_due {
            self.broadcast()?;
            self.resume_due = false;
        }
        self.step(Some(ticks))
    }

    pub fn evolve(&mut self) -> Result<Frame> {
        self.step(None)
    }

    fn step(&mut self, ticks: Option<u32>) -> Result<Frame> {
        let waiting = self
            .other
            .iter()
            .enumerate()
            .map(|(i, peer)| {
                let generation = self.generations[i + 1];
                peer.send(move |engine| {
                    let frame = if let Some(ticks) = ticks {
                        engine.advance(ticks)?
                    } else {
                        engine.evolve()?
                    };
                    let champion = if generation != frame.generation {
                        engine.champion(i + 1)?
                    } else {
                        "null".into()
                    };
                    Ok((frame.generation, champion))
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let frame = if let Some(ticks) = ticks {
            self.primary.advance(ticks)?
        } else {
            self.primary.evolve()?
        };
        let mut records = vec![if self.generations[0] != frame.generation {
            self.primary.champion(0)?
        } else {
            "null".into()
        }];
        self.generations[0] = frame.generation;
        for (index, reply) in waiting.into_iter().enumerate() {
            let (generation, champion) = wait(reply)?;
            self.generations[index + 1] = generation;
            records.push(champion);
        }
        for candidate in records {
            if candidate != "null"
                && (self.restored_champion
                    || self.primary.better(&self.global_champion, &candidate)?)
            {
                self.global_champion = candidate;
                self.restored_champion = false;
                self.broadcast()?;
            }
        }
        Ok(self.view(frame))
    }
}
