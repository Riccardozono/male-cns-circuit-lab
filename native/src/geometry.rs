//! Native equivalents of the reference track queries. Projection is used
//! for scoring. It is never applied to a car's coordinates.
use rquickjs::{Ctx, Function, Object, Result};
use serde::Deserialize;
use std::rc::Rc;

#[derive(Clone, Copy, Deserialize)]
struct Point {
    x: f64,
    y: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Wall {
    a: Point,
    b: Point,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
}

impl Wall {
    fn overlaps(&self, min_x: f64, max_x: f64, min_y: f64, max_y: f64) -> bool {
        self.max_x >= min_x && self.min_x <= max_x && self.max_y >= min_y && self.min_y <= max_y
    }
}

#[derive(Deserialize)]
struct Segment {
    a: Point,
    b: Point,
    length: f64,
    start: f64,
}

#[derive(Deserialize)]
struct Geometry {
    walls: Vec<Wall>,
    segments: Vec<Segment>,
    outer: Vec<Point>,
    inner: Vec<Point>,
}

impl Geometry {
    fn locate(&self, x: f64, y: f64) -> Vec<f64> {
        let mut best = [0.0, 0.0, 0.0, f64::INFINITY, 0.0];
        for segment in &self.segments {
            let dx = segment.b.x - segment.a.x;
            let dy = segment.b.y - segment.a.y;
            let t = (((x - segment.a.x) * dx + (y - segment.a.y) * dy) / (dx * dx + dy * dy))
                .clamp(0.0, 1.0);
            let px = x - segment.a.x - t * dx;
            let py = y - segment.a.y - t * dy;
            let square = px * px + py * py;
            if square < best[3] {
                best = [
                    segment.a.x + t * dx,
                    segment.a.y + t * dy,
                    t,
                    square,
                    segment.start + t * segment.length,
                ];
            }
        }
        best[3] = best[3].sqrt();
        best.to_vec()
    }

    fn raycast(&self, x: f64, y: f64, dx: f64, dy: f64, limit: f64) -> f64 {
        let mut distance = limit;
        let end_x = x + dx * limit;
        let end_y = y + dy * limit;
        for wall in &self.walls {
            if !wall.overlaps(x.min(end_x), x.max(end_x), y.min(end_y), y.max(end_y)) {
                continue;
            }
            let sx = wall.b.x - wall.a.x;
            let sy = wall.b.y - wall.a.y;
            let denom = dx * sy - dy * sx;
            if denom.abs() < 1e-9 {
                continue;
            }
            let qx = wall.a.x - x;
            let qy = wall.a.y - y;
            let t = (qx * sy - qy * sx) / denom;
            let u = (qx * dy - qy * dx) / denom;
            if t >= 0.0 && t < distance && (0.0..=1.0).contains(&u) {
                distance = t;
            }
        }
        distance
    }

    fn collided(&self, x: f64, y: f64, cos: f64, sin: f64, hx: f64, hy: f64) -> bool {
        let wx = cos.abs() * hx + sin.abs() * hy;
        let wy = sin.abs() * hx + cos.abs() * hy;
        for wall in &self.walls {
            if !wall.overlaps(x - wx, x + wx, y - wy, y + wy) {
                continue;
            }
            let transform = |p: Point| {
                [
                    (p.x - x) * cos + (p.y - y) * sin,
                    -(p.x - x) * sin + (p.y - y) * cos,
                ]
            };
            let a = transform(wall.a);
            let b = transform(wall.b);
            let (mut lo, mut hi) = (0.0f64, 1.0f64);
            for (start, delta, half) in [(a[0], b[0] - a[0], hx), (a[1], b[1] - a[1], hy)] {
                if delta.abs() < 1e-12 {
                    if start < -half || start > half {
                        hi = -1.0;
                        break;
                    }
                } else {
                    let a = (-half - start) / delta;
                    let b = (half - start) / delta;
                    lo = lo.max(a.min(b));
                    hi = hi.min(a.max(b));
                    if lo > hi {
                        break;
                    }
                }
            }
            if lo <= hi {
                return true;
            }
        }
        false
    }
}

fn inside(ring: &[Point], x: f64, y: f64) -> bool {
    let mut result = false;
    for (a, b) in ring.iter().zip(ring.iter().cycle().skip(1)) {
        if (a.y > y) != (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x {
            result = !result;
        }
    }
    result
}

pub fn build(ctx: Ctx<'_>, json: String) -> Result<Object<'_>> {
    let geometry = Rc::new(serde_json::from_str::<Geometry>(&json).map_err(|_| {
        rquickjs::Exception::throw_message(&ctx, "Geometria del circuito non valida")
    })?);
    let object = Object::new(ctx.clone())?;
    let track = geometry.clone();
    object.set(
        "locate",
        Function::new(ctx.clone(), move |x, y| track.locate(x, y))?,
    )?;
    let track = geometry.clone();
    object.set(
        "onRoad",
        Function::new(ctx.clone(), move |x, y| {
            inside(&track.outer, x, y) && !inside(&track.inner, x, y)
        })?,
    )?;
    let track = geometry.clone();
    object.set(
        "raycast",
        Function::new(ctx.clone(), move |x, y, dx, dy, limit| {
            track.raycast(x, y, dx, dy, limit)
        })?,
    )?;
    object.set(
        "collided",
        Function::new(ctx, move |x, y, cos, sin, hx, hy| {
            geometry.collided(x, y, cos, sin, hx, hy)
        })?,
    )?;
    Ok(object)
}
