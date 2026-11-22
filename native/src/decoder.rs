use crate::engine::Result;
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use rquickjs::{Ctx, Exception, Function, Object, TypedArray};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    cell::RefCell,
    collections::BTreeMap,
    fs::File,
    io::{Read, Write},
    path::Path,
};

const MAX_RAW: u64 = 2 * 1024 * 1024;
const FEATURE_COUNT: usize = 332;
const WINDOW: usize = 166;
const MOTOR: usize = 128;
const V1: &str = "male-cns-v3-imitation-trial-v1";
const V2: &str = "male-cns-v3-imitation-trial-v2";

#[derive(Clone)]
pub struct Bundle {
    source: Value,
    pub circuit: String,
    pub hash: String,
    pub name: String,
    pub initial: Coefficients,
}

impl Bundle {
    pub fn load(path: &Path) -> Result<Self> {
        let mut input = Vec::new();
        File::open(path)?
            .take(MAX_RAW + 1)
            .read_to_end(&mut input)?;
        if input.len() as u64 > MAX_RAW {
            return Err("File decoder V3 troppo grande".into());
        }
        let mut bytes = Vec::new();
        GzDecoder::new(input.as_slice())
            .take(MAX_RAW * 4 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "File decoder V3 compresso non valido")?;
        if bytes.len() as u64 > MAX_RAW * 4 {
            return Err("Decoder V3 decompresso troppo grande".into());
        }
        let source = serde_json::from_slice::<Value>(&bytes)?;
        let format = source["format"].as_str().unwrap_or_default();
        let circuit = source["circuitId"].as_str().unwrap_or_default();
        if !matches!(format, V1 | V2) || !matches!(circuit, "monza" | "monaco" | "le-mans") {
            return Err("Formato o circuito incompatibile con il decoder V3".into());
        }
        let expected: BTreeMap<String, String> =
            serde_json::from_str(include_str!("../reference-decoder-runtime.json"))?;
        let hashes = &source["runtimeHashes"];
        if expected
            .iter()
            .any(|(file, digest)| hashes[file] != *digest)
        {
            return Err("Decoder V3 incompatibile con il motore di riferimento 5.7.1".into());
        }
        let actor: Actor = serde_json::from_value(source["actor"].clone())?;
        actor.validate(format == V2)?;
        let genome = &source["genome"];
        for (name, length) in [("policyWeights", 330), ("encoder", 56)] {
            if !genome[name]
                .as_array()
                .is_some_and(|values| valid_json(values, length))
            {
                return Err("Genoma del decoder V3 incompatibile".into());
            }
        }
        if !genome["readout"]
            .as_array()
            .is_some_and(|v| v.len() <= 2048 && valid_json(v, v.len()))
            || !genome["gain"].as_f64().is_some_and(f64::is_finite)
        {
            return Err("Lettura motoria del decoder V3 incompatibile".into());
        }
        Ok(Self {
            circuit: circuit.into(),
            hash: format!("{:x}", Sha256::digest(&input)),
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Decoder V3")
                .into(),
            initial: actor.actuator_refinement.unwrap_or_default(),
            source,
        })
    }

    pub fn data(&self) -> String {
        self.source.to_string()
    }

    pub fn encode(&self, coefficients: Coefficients) -> Result<Vec<u8>> {
        let mut updated = self.source.clone();
        updated["actor"]["actuatorRefinement"] = serde_json::to_value(coefficients)?;
        let mut stream = GzEncoder::new(Vec::new(), Compression::new(5));
        stream.write_all(&serde_json::to_vec(&updated)?)?;
        Ok(stream.finish()?)
    }
}

fn valid_json(values: &[Value], count: usize) -> bool {
    values.len() == count
        && values.iter().all(|v| {
            v.as_f64()
                .is_some_and(|x| x.is_finite() && x.abs() <= 1000.)
        })
}

fn valid(values: &[f64], count: usize) -> bool {
    values.len() == count && values.iter().all(|x| x.is_finite() && x.abs() <= 1000.)
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coefficients {
    pub steering_scale: f64,
    pub pedal_scale: f64,
    pub acceleration_bias: f64,
}

impl Default for Coefficients {
    fn default() -> Self {
        Self {
            steering_scale: 1.,
            pedal_scale: 1.,
            acceleration_bias: 0.,
        }
    }
}

impl Coefficients {
    pub fn valid(self) -> bool {
        (0.94..=1.06).contains(&self.steering_scale)
            && (0.9..=1.18).contains(&self.pedal_scale)
            && (0.0..=0.075).contains(&self.acceleration_bias)
    }

    fn apply(self, steering: f64, pedal: f64) -> [f64; 2] {
        let bias = if pedal > 0. {
            self.acceleration_bias * (-7. * steering.abs()).exp()
        } else {
            0.
        };
        [
            (steering * self.steering_scale).clamp(-1., 1.),
            (pedal * self.pedal_scale + bias).clamp(-1., 1.),
        ]
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Actor {
    format: String,
    feature_count: usize,
    feature_layout: FeatureLayout,
    center: Vec<f64>,
    scale: Vec<f64>,
    layers: Vec<Layer>,
    neural_correction: Option<Correction>,
    actuator_refinement: Option<Coefficients>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureLayout {
    descending: usize,
    input_group_means: usize,
    adjacent_difference: usize,
}

impl Actor {
    fn validate(&self, corrected: bool) -> Result<()> {
        let layout = &self.feature_layout;
        if self.format != "male-cns-neural-imitation-actor-v1"
            || self.feature_count != FEATURE_COUNT
            || layout.descending != MOTOR
            || layout.input_group_means != WINDOW - MOTOR
            || layout.adjacent_difference != WINDOW
            || !valid(&self.center, FEATURE_COUNT)
            || !valid(&self.scale, FEATURE_COUNT)
            || self.scale.iter().any(|x| *x <= 0.)
            || !network_valid(&self.layers, &[332, 112, 80, 2], Activation::Tanh)
            || self
                .actuator_refinement
                .is_some_and(|refinement| !refinement.valid())
            || corrected != self.neural_correction.is_some()
            || self
                .neural_correction
                .as_ref()
                .is_some_and(|correction| !correction.valid())
        {
            return Err("Strati o metadati del decoder V3 non validi".into());
        }
        Ok(())
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Activation {
    Silu,
    Sigmoid,
    Tanh,
}

impl Activation {
    fn run(self, x: f64) -> f64 {
        match self {
            Self::Silu => x / (1. + (-x).exp()),
            Self::Sigmoid => 1. / (1. + (-x).exp()),
            Self::Tanh => x.tanh(),
        }
    }
}

#[derive(Deserialize)]
struct Layer {
    weights: Vec<Vec<f64>>,
    bias: Vec<f64>,
    activation: Activation,
}

fn network_valid(layers: &[Layer], sizes: &[usize], output: Activation) -> bool {
    layers.len() + 1 == sizes.len()
        && layers
            .iter()
            .zip(sizes.windows(2))
            .enumerate()
            .all(|(i, (layer, size))| {
                layer.activation
                    == if i + 1 == layers.len() {
                        output
                    } else {
                        Activation::Silu
                    }
                    && valid(&layer.bias, size[1])
                    && layer.weights.len() == size[1]
                    && layer.weights.iter().all(|w| valid(w, size[0]))
            })
}

fn predict(network: &[Layer], mut inputs: Vec<f64>) -> Vec<f64> {
    for layer in network {
        inputs = layer
            .weights
            .iter()
            .zip(&layer.bias)
            .map(|(weights, bias)| {
                let sum = inputs
                    .iter()
                    .zip(weights)
                    .fold(*bias, |s, (x, w)| s + x * w);
                layer.activation.run(sum)
            })
            .collect();
    }
    inputs
}

#[derive(Deserialize)]
struct Correction {
    gate: Vec<Layer>,
    adjustment: Vec<Layer>,
    decays: [f64; 2],
    threshold: f64,
    exponent: f64,
    parameters: CorrectionParameters,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorrectionParameters {
    steer_gain: f64,
    steer_bias: f64,
    pedal_bias: f64,
    steer_residual: f64,
    pedal_residual: f64,
}

impl Correction {
    fn valid(&self) -> bool {
        let p = &self.parameters;
        (-0.06..=0.06).contains(&p.steer_gain)
            && (-0.04..=0.04).contains(&p.steer_bias)
            && (-0.05..=0.05).contains(&p.pedal_bias)
            && (-0.2..=1.).contains(&p.steer_residual)
            && (-0.2..=1.).contains(&p.pedal_residual)
            && (0.1..=0.9).contains(&self.threshold)
            && (0.3..=1.5).contains(&self.exponent)
            && self.decays.iter().all(|x| (0.7..=0.99).contains(x))
            && network_valid(&self.gate, &[664, 64, 32, 1], Activation::Sigmoid)
            && network_valid(&self.adjustment, &[664, 96, 60, 2], Activation::Tanh)
    }

    fn apply(
        &self,
        memory: &mut Option<[Vec<f64>; 2]>,
        inputs: &[f64],
        control: [f64; 2],
    ) -> [f64; 2] {
        let memory =
            memory.get_or_insert_with(|| std::array::from_fn(|_| inputs[..WINDOW].to_vec()));
        let mut context = inputs.to_vec();
        for (trace, decay) in memory.iter_mut().zip(self.decays) {
            for (value, input) in trace.iter_mut().zip(inputs) {
                *value = decay * *value + (1. - decay) * input;
                context.push(input - *value);
            }
        }
        let confidence = predict(&self.gate, context.clone())[0];
        let intensity = ((confidence - self.threshold) / (1. - self.threshold))
            .clamp(0., 1.)
            .powf(self.exponent);
        if intensity == 0. {
            return control;
        }
        let residual = predict(&self.adjustment, context);
        let [steering, pedal] = control;
        let p = &self.parameters;
        [
            steering
                + intensity
                    * (steering * p.steer_gain
                        + p.steer_bias
                        + 0.55 * p.steer_residual * residual[0]),
            pedal + intensity * (p.pedal_bias + 0.55 * p.pedal_residual * residual[1]),
        ]
    }
}

#[derive(Default)]
struct CarMemory {
    previous: Option<[f32; WINDOW]>,
    correction: Option<[Vec<f64>; 2]>,
}

struct Controller {
    actor: Actor,
    groups: Vec<Vec<usize>>,
    coefficients: Vec<Coefficients>,
    memories: BTreeMap<usize, CarMemory>,
}

impl Controller {
    fn new(
        graph: Object<'_>,
        actor: Actor,
        coefficients: Vec<Coefficients>,
    ) -> rquickjs::Result<Self> {
        let indices: TypedArray<u32> = graph.get("inputs")?;
        let visual: TypedArray<u8> = graph.get("inputChannels")?;
        let physics: TypedArray<i8> = graph.get("physicsChannels")?;
        let road: TypedArray<i8> = graph.get("roadChannels")?;
        let learning: Object = graph.get("learning")?;
        let nodes: TypedArray<u32> = learning.get("nodes")?;
        let mut keys = Vec::new();
        let mut groups = Vec::<Vec<usize>>::new();
        let signatures = unsafe { visual.as_slice() }
            .iter()
            .zip(unsafe { physics.as_slice() })
            .zip(unsafe { road.as_slice() });
        for (id, ((&visual, &physics), &road)) in
            unsafe { indices.as_slice() }.iter().zip(signatures)
        {
            let key = (visual, physics, road);
            let index = keys.iter().position(|p| *p == key).unwrap_or_else(|| {
                keys.push(key);
                groups.push(Vec::new());
                keys.len() - 1
            });
            groups[index].push(*id as usize);
        }
        if unsafe { nodes.as_slice() }.len() != MOTOR || groups.len() != WINDOW - MOTOR {
            return Err(Exception::throw_message(
                graph.ctx(),
                "Grafo MaleCNS incompatibile con il decoder V3",
            ));
        }
        Ok(Self {
            actor,
            groups,
            coefficients,
            memories: BTreeMap::new(),
        })
    }

    fn drive(&mut self, car: Object<'_>) -> rquickjs::Result<Vec<f64>> {
        let id: usize = car.get("id")?;
        let brain: Object = car.get("brain")?;
        let motor: TypedArray<f64> = brain.get("policyFeatures")?;
        let activity: TypedArray<f64> = brain.get("activity")?;
        let mut features = [0.0f32; FEATURE_COUNT];
        for (dst, &src) in features
            .iter_mut()
            .take(MOTOR)
            .zip(unsafe { motor.as_slice() })
        {
            *dst = src as f32;
        }
        let activity = unsafe { activity.as_slice() };
        for (index, group) in self.groups.iter().enumerate() {
            let sum: f64 = group.iter().map(|&i| activity[i]).sum();
            features[MOTOR + index] = (sum / group.len() as f64) as f32;
        }
        let memory = self.memories.entry(id).or_default();
        if let Some(previous) = memory.previous {
            for (i, prev) in previous.into_iter().enumerate() {
                features[WINDOW + i] = features[i] - prev;
            }
        }
        let mut frame = [0.; WINDOW];
        frame.copy_from_slice(&features[..WINDOW]);
        memory.previous = Some(frame);
        let normalized = features
            .iter()
            .zip(&self.actor.center)
            .zip(&self.actor.scale)
            .map(|((&x, c), s)| ((f64::from(x) - c) / s).clamp(-8., 8.))
            .collect::<Vec<_>>();
        let control = predict(&self.actor.layers, normalized.clone());
        let mut control = [control[0], control[1]];
        if let Some(correction) = &self.actor.neural_correction {
            control = correction.apply(&mut memory.correction, &normalized, control);
        }
        if let Some(params) = self
            .coefficients
            .get(id)
            .copied()
            .or(self.actor.actuator_refinement)
        {
            control = params.apply(control[0], control[1]);
        }
        let [steer, pedal] = control;
        Ok(vec![steer, pedal.max(0.), (-pedal).max(0.)])
    }
}

pub fn install<'js>(ctx: Ctx<'js>) -> rquickjs::Result<()> {
    let holder = std::rc::Rc::new(RefCell::new(None::<Controller>));
    let init = holder.clone();
    let setup = move |context: Ctx<'js>,
                      graph: Object<'js>,
                      json: String,
                      coefficients: String|
          -> rquickjs::Result<()> {
        let actor: Actor = serde_json::from_str(&json)
            .map_err(|e| Exception::throw_message(&context, &e.to_string()))?;
        let coefficients: Vec<Coefficients> = serde_json::from_str(&coefficients)
            .map_err(|e| Exception::throw_message(&context, &e.to_string()))?;
        *init.borrow_mut() = Some(Controller::new(graph, actor, coefficients)?);
        Ok(())
    };
    let run = move |car: Object<'js>| {
        holder
            .borrow_mut()
            .as_mut()
            .ok_or_else(|| Exception::throw_message(car.ctx(), "Decoder V3 assente"))?
            .drive(car)
    };
    ctx.globals()
        .set("nativeActorSetup", Function::new(ctx.clone(), setup)?)?;
    ctx.globals()
        .set("nativeActorDrive", Function::new(ctx.clone(), run)?)
}
