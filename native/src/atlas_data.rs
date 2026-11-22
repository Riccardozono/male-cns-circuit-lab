use crate::atlas::{Activity, Edge, Filter, Neuron, Points};
use bevy::prelude::Vec3;
use rquickjs::{Array, Object, Result, TypedArray};

// These arrays are rooted in the simulation worker. A view borrows them
// synchronously and never mutates them or holds them across an engine call.
struct Anatomy<'js> {
    positions: TypedArray<'js, i32>,
    missing: i32,
    classes: TypedArray<'js, u8>,
    names: Vec<String>,
    inputs: TypedArray<'js, u32>,
    readouts: TypedArray<'js, u32>,
}

impl<'js> Anatomy<'js> {
    fn read(graph: &Object<'js>) -> Result<Self> {
        let policy: Object = graph.get("learning")?;
        Ok(Self {
            positions: graph.get("positions")?,
            missing: graph.get("missingPosition")?,
            classes: graph.get("classCodes")?,
            names: graph.get("classNames")?,
            inputs: graph.get("inputs")?,
            readouts: policy.get("nodes")?,
        })
    }

    fn flags(&self) -> Vec<u8> {
        let mut flags: Vec<_> = unsafe { self.classes.as_slice() }
            .iter()
            .map(|&code| match self.names[usize::from(code)].as_str() {
                "descending_neuron" => 4,
                "ascending_neuron" => 8,
                _ => 0,
            })
            .collect();
        for &input in unsafe { self.inputs.as_slice() } {
            flags[input as usize] |= 1;
        }
        for &readout in unsafe { self.readouts.as_slice() } {
            flags[readout as usize] |= 2;
        }
        flags
    }

    fn coordinates(&self) -> impl Iterator<Item = (usize, [i32; 3])> {
        unsafe { self.positions.as_slice() }
            .chunks_exact(3)
            .enumerate()
            .filter(|(_, xyz)| !xyz.contains(&self.missing))
            .map(|(index, xyz)| (index, [xyz[0], xyz[1], xyz[2]]))
    }
}

pub fn points(graph: &Object<'_>) -> Result<Points> {
    let anatomy = Anatomy::read(graph)?;
    let sides: TypedArray<i8> = graph.get("sideCodes")?;
    let ids: TypedArray<f64> = graph.get("bodyIds")?;
    let (sides, ids, classes) =
        unsafe { (sides.as_slice(), ids.as_slice(), anatomy.classes.as_slice()) };
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for (_, xyz) in anatomy.coordinates() {
        for (i, value) in xyz.map(f64::from).into_iter().enumerate() {
            min[i] = min[i].min(value);
            max[i] = max[i].max(value);
        }
    }
    let center: [f64; 3] = std::array::from_fn(|i| (max[i] + min[i]) / 2.);
    let span = (0..3).map(|i| max[i] - min[i]).fold(1., f64::max);
    let flags = anatomy.flags();
    let nodes = anatomy
        .coordinates()
        .map(|(index, coordinates)| {
            let xyz: [f32; 3] = std::array::from_fn(|i| {
                ((f64::from(coordinates[i]) - center[i]) * 2. / span) as f32
            });
            Neuron {
                index,
                body: ids[index] as u64,
                position: Vec3::new(xyz[0], -xyz[1], xyz[2]) * 1.1,
                class: classes[index] as usize,
                side: sides[index],
                flags: flags[index],
                coordinates,
            }
        })
        .collect();
    Ok(Points {
        nodes,
        classes: anatomy.names,
    })
}

pub fn activity<'js>(
    graph: &Object<'js>,
    sample: &Array<'js>,
    car: usize,
    filter: Filter,
    limit: u16,
    focus: Option<usize>,
) -> Result<Activity> {
    let gains: TypedArray<f32> = sample.get(1)?;
    let anatomy = Anatomy::read(graph)?;
    let policy: Object = graph.get("learning")?;
    let groups: TypedArray<u8> = policy.get("groups")?;
    let rows: TypedArray<u32> = graph.get("rowOffsets")?;
    let targets: TypedArray<u32> = graph.get("targets")?;
    let (gains, groups, rows, targets) = unsafe {
        (
            gains.as_slice(),
            groups.as_slice(),
            rows.as_slice(),
            targets.as_slice(),
        )
    };
    let mut mask = vec![false; groups.len()];
    let flags = match filter {
        Filter::Input | Filter::Motor | Filter::Descending => anatomy.flags(),
        _ => Vec::new(),
    };
    let query = |index: usize, value: f64| match filter {
        Filter::All => true,
        Filter::Active => value.abs() > 0.002,
        Filter::Input => flags[index] & 1 != 0,
        Filter::Motor => flags[index] & 2 != 0,
        Filter::Descending => flags[index] & 4 != 0,
    };
    let values;
    let edges;
    if graph.get::<_, bool>("full")? {
        let a: TypedArray<f32> = sample.get(0)?;
        let weights: TypedArray<f32> = graph.get("csrWeights")?;
        let (a, weights) = unsafe { (a.as_slice(), weights.as_slice()) };
        for (index, _) in anatomy.coordinates() {
            mask[index] = query(index, f64::from(a[index]));
        }
        edges = top_edges(
            a,
            weights,
            &mask,
            rows,
            targets,
            groups,
            gains,
            focus,
            usize::from(limit),
        );
        values = a.to_vec();
    } else {
        let a: TypedArray<f64> = sample.get(0)?;
        let weights: TypedArray<f64> = graph.get("csrWeights")?;
        let (a, weights) = unsafe { (a.as_slice(), weights.as_slice()) };
        for (index, _) in anatomy.coordinates() {
            mask[index] = query(index, a[index]);
        }
        edges = top_edges(
            a,
            weights,
            &mask,
            rows,
            targets,
            groups,
            gains,
            focus,
            usize::from(limit),
        );
        values = a.iter().map(|&x| x as f32).collect();
    }
    Ok(Activity { car, values, edges })
}

fn top_edges<N: Copy + Into<f64>>(
    activity: &[N],
    weights: &[N],
    mask: &[bool],
    rows: &[u32],
    targets: &[u32],
    groups: &[u8],
    gains: &[f32],
    focus: Option<usize>,
    limit: usize,
) -> Vec<Edge> {
    if limit == 0 {
        return Vec::new();
    }
    let magnitude = |index: usize| activity[index].into().abs();
    let active = |index: usize| mask[index] && magnitude(index) > 0.002;
    let mut sources: Vec<_> = (0..rows.len() - 1).filter(|&i| active(i)).collect();
    sources.sort_by(|&a, &b| magnitude(b).total_cmp(&magnitude(a)).then(a.cmp(&b)));
    sources.truncate(256);
    if let Some(selected) = focus.filter(|&index| index < mask.len() && active(index))
        && !sources.contains(&selected)
    {
        sources.push(selected);
    }
    let mut heap = Vec::with_capacity(limit);
    for source in sources {
        let gain = f64::from(gains[usize::from(groups[source])]);
        for index in rows[source] as usize..rows[source + 1] as usize {
            let target = targets[index] as usize;
            if !mask[target] || focus.is_some_and(|i| source != i && target != i) {
                continue;
            }
            let contribution = 0.9 * activity[source].into() * weights[index].into() * gain;
            if contribution.abs() > 0.00001 {
                offer(&mut heap, (contribution, source, target), limit);
            }
        }
    }
    heap.sort_by(|a, b| b.0.abs().total_cmp(&a.0.abs()));
    heap.into_iter()
        .map(|(value, source, target)| Edge {
            contribution: value as f32,
            source,
            target,
        })
        .collect()
}

fn offer(heap: &mut Vec<(f64, usize, usize)>, edge: (f64, usize, usize), limit: usize) {
    if heap.len() < limit {
        heap.push(edge);
        let mut i = heap.len() - 1;
        while i > 0 {
            let parent = (i - 1) / 2;
            if heap[parent].0.abs() <= heap[i].0.abs() {
                break;
            }
            heap.swap(i, parent);
            i = parent;
        }
    } else if edge.0.abs() > heap[0].0.abs() {
        heap[0] = edge;
        let mut i = 0;
        loop {
            let mut min = i;
            for child in [2 * i + 1, 2 * i + 2] {
                if child < heap.len() && heap[child].0.abs() < heap[min].0.abs() {
                    min = child;
                }
            }
            if min == i {
                break;
            }
            heap.swap(i, min);
            i = min;
        }
    }
}
