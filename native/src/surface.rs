use rquickjs::{Ctx, Function, Object, Result};
use serde::Deserialize;
use std::{cell::RefCell, collections::HashMap, rc::Rc};

#[derive(Deserialize)]
struct Point {
    x: f64,
    y: f64,
}
#[derive(Deserialize)]
struct Segment {
    a: Point,
    b: Point,
    dx: f64,
    dy: f64,
    len: f64,
    s: f64,
}
#[derive(Deserialize)]
struct Anchor {
    s: f64,
    height: f64,
}
#[derive(Deserialize)]
struct Input {
    segments: Vec<Segment>,
    cell: f64,
    ppm: f64,
    total: f64,
    anchors: Vec<Anchor>,
}

struct Sampler {
    input: Input,
    buckets: HashMap<(i32, i32), Vec<usize>>,
    scratch: RefCell<(Vec<bool>, Vec<usize>)>,
    coefficients: Vec<(f64, f64, [f64; 4])>,
    minimum: f64,
}

fn wrap(x: f64, total: f64) -> f64 {
    ((x % total) + total) % total
}

impl Sampler {
    fn new(input: Input) -> Self {
        let mut buckets = HashMap::<_, Vec<usize>>::new();
        let coord = |v: f64| (v / input.cell).floor() as i32;
        for (i, seg) in input.segments.iter().enumerate() {
            for x in coord(seg.a.x.min(seg.b.x))..=coord(seg.a.x.max(seg.b.x)) {
                for y in coord(seg.a.y.min(seg.b.y))..=coord(seg.a.y.max(seg.b.y)) {
                    buckets.entry((x, y)).or_default().push(i);
                }
            }
        }
        let a = &input.anchors;
        let n = a.len();
        let next = |i| (i + 1) % n;
        let widths: Vec<_> = (0..n)
            .map(|i| {
                let width = wrap(a[next(i)].s - a[i].s, input.total);
                if width == 0.0 { input.total } else { width }
            })
            .collect();
        let slopes: Vec<_> = (0..n)
            .map(|i| (a[next(i)].height - a[i].height) / widths[i])
            .collect();
        let tangents: Vec<_> = (0..n)
            .map(|i| {
                let p = (i + n - 1) % n;
                let (w1, w2) = (2.0 * widths[i] + widths[p], widths[i] + 2.0 * widths[p]);
                if slopes[p] * slopes[i] <= 0.0 {
                    0.0
                } else {
                    (w1 + w2) / (w1 / slopes[p] + w2 / slopes[i])
                }
            })
            .collect();
        let coefficients = (0..n)
            .map(|i| {
                let h = widths[i];
                let (low, high) = (a[i].height, a[next(i)].height);
                let (u, v) = (tangents[i] * h, tangents[next(i)] * h);
                (
                    a[i].s,
                    h,
                    [
                        low,
                        u,
                        -3.0 * low + 3.0 * high - 2.0 * u - v,
                        2.0 * low - 2.0 * high + u + v,
                    ],
                )
            })
            .collect();
        let minimum = a.iter().map(|v| v.height).fold(f64::INFINITY, f64::min);
        let scratch = RefCell::new((vec![false; input.segments.len()], Vec::with_capacity(48)));
        Self {
            input,
            buckets,
            scratch,
            coefficients,
            minimum,
        }
    }

    fn sample(&self, x: f64, y: f64) -> [f64; 7] {
        let (cx, cy) = (
            (x / self.input.cell).floor() as i32,
            (y / self.input.cell).floor() as i32,
        );
        let (seen, used) = &mut *self.scratch.borrow_mut();
        let (mut best, mut t, mut distance) = (0, 0.0, f64::INFINITY);
        let mut visit = |i| {
            let seg: &Segment = &self.input.segments[i];
            let (px, py) = (x - seg.a.x, y - seg.a.y);
            let divisor = if seg.len == 0.0 {
                1.0
            } else {
                seg.len * seg.len
            };
            let fraction = ((px * seg.dx + py * seg.dy) / divisor).clamp(0.0, 1.0);
            let (ox, oy) = (px - seg.dx * fraction, py - seg.dy * fraction);
            let d = ox * ox + oy * oy;
            if d < distance {
                distance = d;
                best = i;
                t = fraction;
            }
        };
        // Match the reference grid's insertion and tie order, including the center cell.
        for r in 0..=2 {
            for gx in cx - r..=cx + r {
                for gy in cy - r..=cy + r {
                    if let Some(bucket) = self.buckets.get(&(gx, gy)) {
                        for &i in bucket {
                            if !seen[i] {
                                seen[i] = true;
                                used.push(i);
                                visit(i);
                            }
                        }
                    }
                }
            }
            if !used.is_empty() && r >= 1 {
                break;
            }
        }
        if used.is_empty() {
            for i in 0..self.input.segments.len() {
                visit(i);
            }
        }
        for i in used.drain(..) {
            seen[i] = false;
        }
        let line = &self.input.segments[best];
        let s = wrap(line.s + t * line.len / self.input.ppm, self.input.total);
        let index = self
            .coefficients
            .partition_point(|(start, _, _)| *start <= s);
        let (start, h, [c0, c1, c2, c3]) = self.coefficients[if index == 0 {
            self.coefficients.len() - 1
        } else {
            index - 1
        }];
        let t = wrap(s - start, self.input.total) / h;
        let height = c0 + c1 * t + c2 * t * t + c3 * t * t * t - self.minimum;
        let slope = (c1 + 2.0 * c2 * t + 3.0 * c3 * t * t) / h;
        let curve = (2.0 * c2 + 6.0 * c3 * t) / (h * h);
        let len = if line.len == 0.0 { 1.0 } else { line.len };
        let (tx, ty) = (line.dx / len, line.dy / len);
        [
            height,
            slope * tx,
            slope * ty,
            curve * tx * tx,
            curve * tx * ty,
            curve * ty * ty,
            distance.sqrt() / self.input.ppm,
        ]
    }
}

pub fn build(ctx: Ctx<'_>, json: String) -> Result<Object<'_>> {
    let input = serde_json::from_str::<Input>(&json).map_err(|_| {
        rquickjs::Exception::throw_message(&ctx, "Altimetria del circuito non valida")
    })?;
    let sampler = Rc::new(Sampler::new(input));
    let object = Object::new(ctx.clone())?;
    let copy = sampler.clone();
    object.set(
        "sample",
        Function::new(ctx.clone(), move |x: f64, y: f64| {
            copy.sample(x, y).to_vec()
        })?,
    )?;
    object.set(
        "visualHeight",
        Function::new(ctx, move |x: f64, y: f64| {
            let data = sampler.sample(x, y);
            let dist = (data[6] - 10.0).max(0.0);
            data[0] * (-dist * dist / (95.0 * 95.0)).exp()
        })?,
    )?;
    Ok(object)
}
