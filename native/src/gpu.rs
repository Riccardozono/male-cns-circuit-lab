use rquickjs::{Ctx, Exception, Object, TypedArray};
use std::{
    borrow::Cow,
    cell::RefCell,
    sync::{Arc, Mutex, OnceLock, mpsc},
    time::Duration,
};
use wgpu::{BufferUsages as Usage, util::DeviceExt};

const WGSL: &str = include_str!(concat!(env!("OUT_DIR"), "/neural-solver.wgsl"));
type GpuResult<T> = Result<T, String>;

#[derive(Clone)]
struct Hardware {
    device: wgpu::Device,
    queue: wgpu::Queue,
    label: String,
    error: Arc<Mutex<Option<String>>>,
}

impl Hardware {
    fn open() -> GpuResult<Self> {
        if std::env::var("MALE_CNS_GPU").as_deref() == Ok("cpu") {
            return Err("GPU neurale disattivata".into());
        }
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::DX12 | wgpu::Backends::VULKAN,
            ..Default::default()
        });
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            ..Default::default()
        }))
        .map_err(|e| e.to_string())?;
        let info = adapter.get_info();
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("MAL-E CNS · calcolo neurale"),
            required_limits: wgpu::Limits::default(),
            ..Default::default()
        }))
        .map_err(|e| e.to_string())?;
        let error = Arc::new(Mutex::new(None));
        let lost = error.clone();
        device.set_device_lost_callback(move |reason, details| {
            *lost.lock().expect("Stato dispositivo") =
                Some(format!("GPU persa ({reason:?}): {details}"));
        });
        let unexpected = error.clone();
        device.on_uncaptured_error(Arc::new(move |failure| {
            *unexpected.lock().expect("Stato dispositivo") = Some(failure.to_string());
        }));
        Ok(Self {
            device,
            queue,
            label: format!("{} · {:?}", info.name, info.backend),
            error,
        })
    }

    fn check(&self) -> GpuResult<()> {
        self.error
            .lock()
            .expect("Stato dispositivo")
            .clone()
            .map_or(Ok(()), Err)
    }
}

fn hardware() -> GpuResult<Hardware> {
    static HARDWARE: OnceLock<GpuResult<Hardware>> = OnceLock::new();
    HARDWARE.get_or_init(Hardware::open).clone()
}

struct GraphData {
    packed: Vec<u32>,
    nodes: u32,
    inputs: u32,
    groups: u32,
    readout: u32,
    reserved: u32,
    budget: u32,
    activity_threshold: f32,
    edge_threshold: f32,
    bases: [u32; 6],
}

impl GraphData {
    fn from_js(graph: Object<'_>) -> rquickjs::Result<Self> {
        let rows: TypedArray<u32> = graph.get("rowOffsets")?;
        let targets: TypedArray<u32> = graph.get("targets")?;
        let weights: TypedArray<f32> = graph.get("csrWeights")?;
        let input: TypedArray<u32> = graph.get("inputs")?;
        let core: TypedArray<u8> = graph.get("coreMask")?;
        let learning: Object = graph.get("learning")?;
        let neural_groups: TypedArray<u8> = learning.get("groups")?;
        let owners: TypedArray<u32> = learning.get("gpuNodes")?;
        let groups = learning.get("gainGroups")?;
        let solver: Object = graph.get("solver")?;
        // No JS runs while copying these arrays rooted in the worker.
        let rows = unsafe { rows.as_slice() };
        let targets = unsafe { targets.as_slice() };
        let weights = unsafe { weights.as_slice() };
        let input = unsafe { input.as_slice() };
        let core = unsafe { core.as_slice() };
        let neural_groups = unsafe { neural_groups.as_slice() };
        let owners = unsafe { owners.as_slice() };
        let nodes = core.len() as u32;
        let readout = owners.len() as u32;
        let mut ranks = vec![u32::MAX; core.len()];
        for (rank, &node) in owners.iter().enumerate() {
            ranks[node as usize] = rank as u32;
        }
        let mut reserved = readout;
        for (rank, &is_core) in ranks.iter_mut().zip(core) {
            if is_core != 0 && *rank == u32::MAX {
                *rank = reserved;
                reserved += 1;
            }
        }
        let budget = nodes.min(solver.get("activeNeuronBudget")?);
        if reserved > budget {
            return Err(Exception::throw_message(
                graph.ctx(),
                "Budget GPU insufficiente per il nucleo di guida",
            ));
        }
        let target_base = rows.len();
        let weight_base = target_base + targets.len();
        let input_base = weight_base + weights.len();
        let output_base = input_base + input.len();
        let group_base = output_base + ranks.len();
        let mut packed = Vec::with_capacity(group_base + neural_groups.len());
        packed.extend_from_slice(rows);
        packed.extend_from_slice(targets);
        packed.extend(weights.iter().map(|w| w.to_bits()));
        packed.extend_from_slice(input);
        packed.extend(ranks);
        packed.extend(neural_groups.iter().map(|&g| u32::from(g)));
        Ok(Self {
            packed,
            nodes,
            inputs: input.len() as u32,
            groups,
            readout,
            reserved,
            budget,
            activity_threshold: solver.get("activityThreshold")?,
            edge_threshold: solver.get("edgeContributionThreshold")?,
            bases: [
                0,
                target_base as u32,
                weight_base as u32,
                input_base as u32,
                output_base as u32,
                group_base as u32,
            ],
        })
    }
}

struct Backend {
    gpu: Hardware,
    graph: GraphData,
    capacity: u32,
    population: u32,
    direction: usize,
    dispatches: u64,
    uniforms: [wgpu::Buffer; 2],
    drives: wgpu::Buffer,
    packet: wgpu::Buffer,
    readback: wgpu::Buffer,
    bytes: u64,
    groups: [wgpu::BindGroup; 2],
    pipelines: Vec<wgpu::ComputePipeline>,
}

const CLEAR: usize = 0;
const CLEAR_SUM: usize = 1;
const CLEAR_COUNTS: usize = 2;
const INJECT: usize = 3;
const PROPAGATE: usize = 4;
const UPDATE: usize = 5;
const COMPACT: usize = 6;
const PACK: usize = 7;

impl Backend {
    fn new(graph: GraphData, population: u32) -> GpuResult<Self> {
        let gpu = hardware()?;
        gpu.check()?;
        let cap = population.max(16).next_power_of_two().min(100);
        let gc = cap * graph.nodes;
        let ac = cap * graph.budget;
        let gain_base = cap * graph.inputs;
        let slots = cap * graph.readout + graph.budget;
        let bytes = u64::from(cap + 2 * slots) * 4;
        let device = &gpu.device;
        let max_storage = u64::from(device.limits().max_storage_buffer_binding_size);
        if u64::from(gc) * 8 > max_storage
            || graph.packed.len() as u64 * 4 > max_storage
            || gc.div_ceil(256) > device.limits().max_compute_workgroups_per_dimension
        {
            return Err("Batch oltre le capacità della GPU".into());
        }
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let buffer = |label, words, usage| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: u64::from(words) * 4,
                usage,
                mapped_at_creation: false,
            })
        };
        let uniforms = std::array::from_fn(|_| {
            buffer("Neural parameters", 12, Usage::UNIFORM | Usage::COPY_DST)
        });
        let packed = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("MaleCNS CSR"),
            contents: bytemuck::cast_slice(&graph.packed),
            usage: Usage::STORAGE,
        });
        let drives = buffer(
            "Input drives",
            cap * (graph.inputs + graph.groups),
            Usage::STORAGE | Usage::COPY_DST,
        );
        let sums = buffer("Accumulated input", gc, Usage::STORAGE);
        let states = buffer("Recurrent state", gc * 2, Usage::STORAGE);
        let active = buffer("Active indices", ac * 2, Usage::STORAGE);
        let values = buffer("Active values", ac * 2, Usage::STORAGE);
        let counts = buffer("Active counts", cap * 2, Usage::STORAGE);
        let packet = buffer(
            "Motor and atlas output",
            cap + slots * 2,
            Usage::STORAGE | Usage::COPY_SRC,
        );
        let readback = buffer(
            "Neural readback",
            cap + slots * 2,
            Usage::MAP_READ | Usage::COPY_DST,
        );
        let bind_entries: Vec<_> = (0..9)
            .map(|binding| wgpu::BindGroupLayoutEntry {
                binding,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: if binding == 0 {
                        wgpu::BufferBindingType::Uniform
                    } else {
                        wgpu::BufferBindingType::Storage {
                            read_only: binding <= 2,
                        }
                    },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            })
            .collect();
        let bind_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("MaleCNS buffers"),
            entries: &bind_entries,
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("MaleCNS pipeline"),
            bind_group_layouts: &[&bind_layout],
            push_constant_ranges: &[],
        });
        let names = [
            "ROW_BASE",
            "TARGET_BASE",
            "WEIGHT_BASE",
            "INPUT_BASE",
            "OUTPUT_BASE",
            "GROUP_BASE",
            "GAIN_BASE",
            "GAIN_GROUPS",
            "NODE_CAPACITY",
            "ACTIVE_CAPACITY",
            "POP_CAPACITY",
            "READOUT_COUNT",
            "PACKED_INDEX_BASE",
            "PACKED_VALUE_BASE",
        ];
        let constants = [
            graph.bases[0],
            graph.bases[1],
            graph.bases[2],
            graph.bases[3],
            graph.bases[4],
            graph.bases[5],
            gain_base,
            graph.groups,
            gc,
            ac,
            cap,
            graph.readout,
            cap,
            cap + slots,
        ];
        let mut source = String::new();
        for (name, value) in names.into_iter().zip(constants) {
            source.push_str(&format!("const {name}: u32 = {value}u;\n"));
        }
        source.push_str(WGSL);
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Solver 5.7.1"),
            source: wgpu::ShaderSource::Wgsl(Cow::Owned(source)),
        });
        let pipelines = [
            "clear_state",
            "clear_sum",
            "clear_counts",
            "inject",
            "propagate",
            "update_activity",
            "compact",
            "pack_readback",
        ]
        .into_iter()
        .map(|name| {
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some(name),
                layout: Some(&layout),
                module: &module,
                entry_point: Some(name),
                compilation_options: Default::default(),
                cache: None,
            })
        })
        .collect();
        let groups = std::array::from_fn(|dir| {
            let entries: Vec<_> = [
                &uniforms[dir],
                &packed,
                &drives,
                &sums,
                &states,
                &active,
                &values,
                &counts,
                &packet,
            ]
            .into_iter()
            .enumerate()
            .map(|(binding, value)| wgpu::BindGroupEntry {
                binding: binding as u32,
                resource: value.as_entire_binding(),
            })
            .collect();
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("MaleCNS ping / pong"),
                layout: &bind_layout,
                entries: &entries,
            })
        });
        if let Some(failure) = pollster::block_on(device.pop_error_scope()) {
            return Err(failure.to_string());
        }
        Ok(Self {
            gpu,
            graph,
            capacity: cap,
            population: 0,
            direction: 0,
            dispatches: 0,
            uniforms,
            drives,
            packet,
            readback,
            bytes,
            groups,
            pipelines,
        })
    }

    fn params(&self, population: u32, selected: u32, dir: usize) {
        let data = [
            self.graph.nodes,
            self.graph.inputs,
            population,
            self.graph.budget,
            self.graph.reserved,
            dir as u32,
            self.graph.activity_threshold.to_bits(),
            self.graph.edge_threshold.to_bits(),
            selected.min(population - 1),
            0,
            0,
            0,
        ];
        self.gpu
            .queue
            .write_buffer(&self.uniforms[dir], 0, bytemuck::cast_slice(&data));
    }

    fn pass(&self, cmd: &mut wgpu::CommandEncoder, pipe: usize, total: u32, lane: usize) {
        let mut pass = cmd.begin_compute_pass(&wgpu::ComputePassDescriptor::default());
        pass.set_pipeline(&self.pipelines[pipe]);
        pass.set_bind_group(0, &self.groups[lane], &[]);
        pass.dispatch_workgroups(
            total
                .div_ceil(if pipe == CLEAR_COUNTS { 64 } else { 256 })
                .max(1),
            1,
            1,
        );
    }

    fn output(
        &self,
        mut cmd: wgpu::CommandEncoder,
        population: u32,
        direction: usize,
    ) -> GpuResult<Vec<u32>> {
        self.pass(
            &mut cmd,
            PACK,
            population * self.graph.readout + self.graph.budget,
            direction,
        );
        cmd.copy_buffer_to_buffer(&self.packet, 0, &self.readback, 0, self.bytes);
        let submission = self.gpu.queue.submit([cmd.finish()]);
        let (done, ready) = mpsc::sync_channel(1);
        let range = self.readback.slice(..);
        range.map_async(wgpu::MapMode::Read, move |result| {
            let _ = done.send(result);
        });
        self.gpu
            .device
            .poll(wgpu::PollType::Wait {
                submission_index: Some(submission),
                timeout: Some(Duration::from_secs(8)),
            })
            .map_err(|e| e.to_string())?;
        self.gpu.check()?;
        ready
            .recv_timeout(Duration::from_secs(2))
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        let view = range.get_mapped_range();
        let data = bytemuck::cast_slice(&view).to_vec();
        drop(view);
        self.readback.unmap();
        Ok(data)
    }

    fn advance(
        &mut self,
        population: u32,
        drives: &[f32],
        gains: &[f32],
        selected: u32,
        reset: bool,
        iterations: u32,
    ) -> GpuResult<Vec<u32>> {
        self.gpu.check()?;
        if drives.len() != (population * self.graph.inputs) as usize
            || gains.len() != (population * self.graph.groups) as usize
        {
            return Err("Dati sensoriali o guadagni GPU incompleti".into());
        }
        self.gpu
            .queue
            .write_buffer(&self.drives, 0, bytemuck::cast_slice(drives));
        self.gpu.queue.write_buffer(
            &self.drives,
            u64::from(self.capacity * self.graph.inputs) * 4,
            bytemuck::cast_slice(gains),
        );
        self.params(population, selected, 0);
        self.params(population, selected, 1);
        let mut cmd = self
            .gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        let total = self.graph.nodes * population;
        if reset || population != self.population {
            self.direction = 0;
            self.pass(&mut cmd, CLEAR, total, 0);
        }
        for _ in 0..iterations.clamp(1, 4) {
            let lane = self.direction;
            self.pass(&mut cmd, CLEAR_SUM, total, lane);
            self.pass(&mut cmd, CLEAR_COUNTS, population, lane);
            self.pass(&mut cmd, INJECT, population * self.graph.inputs, lane);
            self.pass(&mut cmd, PROPAGATE, population * self.graph.budget, lane);
            self.pass(&mut cmd, UPDATE, total, lane);
            self.pass(&mut cmd, COMPACT, total, lane);
            self.direction ^= 1;
        }
        let output = self.output(cmd, population, self.direction)?;
        self.population = population;
        self.dispatches += 1;
        Ok(output)
    }

    fn inspect(&self, selected: u32) -> GpuResult<Vec<u32>> {
        self.gpu.check()?;
        if self.population == 0 {
            return Err("Campione GPU in attesa".into());
        }
        self.params(self.population, selected, self.direction);
        self.output(
            self.gpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor::default()),
            self.population,
            self.direction,
        )
    }
}

/// Every QuickJS engine owns its own wire protocol and recurrent GPU buffers.
#[derive(Default)]
pub struct State {
    backend: RefCell<Option<Backend>>,
}

impl State {
    pub fn transfer<'js>(
        &self,
        ctx: Ctx<'js>,
        graph: Object<'js>,
        request: Object<'js>,
    ) -> rquickjs::Result<Object<'js>> {
        let population: u32 = request.get("population")?;
        if !(1..=100).contains(&population) {
            return Err(Exception::throw_message(&ctx, "Popolazione GPU non valida"));
        }
        let selected: u32 = request.get("inspectedAgentId")?;
        let read_only: bool = request.get("readOnly")?;
        let mut backend = self.backend.borrow_mut();
        if !read_only && backend.as_ref().is_none_or(|b| population > b.capacity) {
            *backend = Some(
                Backend::new(GraphData::from_js(graph)?, population)
                    .map_err(|e| Exception::throw_message(&ctx, &e))?,
            );
        }
        let backend = backend
            .as_mut()
            .ok_or_else(|| Exception::throw_message(&ctx, "Campione GPU in attesa"))?;
        let packet = if read_only {
            backend.inspect(selected)
        } else {
            let drives: TypedArray<f32> = request.get("drives")?;
            let gains: TypedArray<f32> = request.get("gains")?;
            backend.advance(
                population,
                unsafe { drives.as_slice() },
                unsafe { gains.as_slice() },
                selected,
                request.get("reset")?,
                request.get("iterations")?,
            )
        }
        .map_err(|error| Exception::throw_message(&ctx, &error))?;
        let result = Object::new(ctx.clone())?;
        result.set("words", TypedArray::new(ctx, packet)?)?;
        result.set("capacity", backend.capacity)?;
        result.set("budget", backend.graph.budget)?;
        result.set("readout", backend.graph.readout)?;
        result.set("label", &backend.gpu.label)?;
        result.set("dispatches", backend.dispatches)?;
        Ok(result)
    }

    pub fn reset(&self) {
        self.backend.borrow_mut().take();
    }

    // Used by the headless acceptance probe to exercise actual device loss.
    pub fn lose(&self) {
        if let Some(current) = self.backend.borrow().as_ref() {
            current.gpu.device.destroy();
        }
    }
}

pub fn install<'js>(context: Ctx<'js>) -> rquickjs::Result<()> {
    let state = std::rc::Rc::new(State::default());
    let run = state.clone();
    let reset = state.clone();
    let globals = context.globals();
    let run = move |ctx: Ctx<'js>, graph: Object<'js>, request: Object<'js>| {
        run.transfer(ctx, graph, request)
    };
    globals.set("nativeGpu", rquickjs::Function::new(context.clone(), run)?)?;
    globals.set(
        "nativeGpuReset",
        rquickjs::Function::new(context.clone(), move || reset.reset())?,
    )?;
    globals.set(
        "nativeGpuLose",
        rquickjs::Function::new(context, move || state.lose())?,
    )
}
