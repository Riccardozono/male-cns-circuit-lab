use rquickjs::{Ctx, Exception, Function, TypedArray};
use std::f64::consts::TAU;

const G: f64 = 9.80665;
const RPM: f64 = 60.0 / TAU;
const WHEELBASE: f64 = 2.507;
const FRONT_WEIGHT: f64 = 0.40;
const FRONT_TRACK: f64 = 1.68;
const REAR_TRACK: f64 = 1.66;
const FRONT_RADIUS: f64 = 0.34;
const REAR_RADIUS: f64 = 0.355;
const CG: f64 = 0.32;
const IDLE: f64 = 1200.;
const MAX_RPM: f64 = 9250.;
const BRAKE_TORQUE: f64 = 5500.;
const FUEL_DENSITY: f64 = 0.745;
const AMBIENT: f64 = 25.;
const INERTIA: f64 = 1.65;

// The JS adapter uses this field order. Numeric flags preserve the JSON
// vehicle state used by replay, telemetry and the shareable save codec.
macro_rules! state_fields {
    ($name:ident { $($field:ident),+ $(,)? }) => {
        struct $name { $( $field: f64, )+ }
        impl $name {
            fn read(source: &mut impl Iterator<Item = f64>) -> Option<Self> {
                Some(Self { $( $field: source.next()?, )+ })
            }
            fn write(&self, output: &mut Vec<f64>) {
                output.extend([$( self.$field, )+]);
            }
        }
    };
}

state_fields!(Body {
    u,
    v,
    r,
    rpm,
    gear,
    target_gear,
    automatic,
    shift_remaining,
    shift_cooldown,
    shifts,
    shift_rejected,
    fuel,
    mass,
    abs_enabled,
    tc_enabled,
    tc_factor,
    tc_active,
    abs_active,
    brake_bias,
    steering,
    ax,
    ay,
    torque,
    power,
    clutch,
    limiter,
    drag,
    downforce,
    pitch,
    roll,
    pitch_rate,
    roll_rate,
    distance,
    speed,
    seconds,
    elevation,
    grade,
    road_pitch,
    road_roll,
    gravity_x,
    gravity_y,
    gravity_normal,
    support,
    normal_g,
    vertical_speed,
});

state_fields!(Wheel {
    omega,
    slip,
    angle,
    fx,
    fy,
    fz,
    grip,
    temperature,
    wear,
    pressure,
    brake_temp,
    abs_factor,
    abs_active,
    travel,
});

state_fields!(Motion {
    x,
    y,
    heading,
    distance,
    lifetime,
    scale,
});

fn ratio(gear: f64) -> f64 {
    if gear == -1. {
        -3.0
    } else {
        [0., 2.77, 2.10, 1.68, 1.39, 1.19, 1.03]
            .get(gear as usize)
            .copied()
            .unwrap_or_default()
    }
}

fn wheel_rpm(wheels: &[Wheel; 4], gear: f64) -> f64 {
    ((wheels[2].omega + wheels[3].omega) * 0.5 * ratio(gear) * 3.9 * RPM).abs()
}

fn request_gear(s: &mut Body, wheels: &[Wheel; 4], target: f64) {
    if (target == -1. || s.gear == -1.) && s.u.abs() > 1.
        || target > 0. && wheel_rpm(wheels, target) > MAX_RPM - 150.
    {
        s.shift_rejected += 1.;
        return;
    }
    s.target_gear = target;
    s.shift_remaining = 0.085;
    s.shift_cooldown = 0.085 + 0.18;
    s.shifts += 1.;
}

fn torque(rpm: f64) -> f64 {
    const CURVE: [(f64, f64); 8] = [
        (0., 0.),
        (1200., 230.),
        (3000., 405.),
        (5000., 510.),
        (6500., 550.),
        (8000., 520.),
        (9250., 420.),
        (10000., 0.),
    ];
    let x = rpm.clamp(0., 10000.);
    let t = CURVE.windows(2).find(|r| x <= r[1].0).map_or(0., |r| {
        r[0].1 + (r[1].1 - r[0].1) * (x - r[0].0) / (r[1].0 - r[0].0)
    });
    t.min(416000. / (x / RPM).max(1.))
}

fn normal_loads(s: &Body) -> [f64; 4] {
    let weight = s.mass * s.support;
    let static_front = weight * FRONT_WEIGHT + s.downforce * 0.43;
    let longitudinal = s.mass * (s.ax - s.gravity_x) * CG / WHEELBASE;
    let front =
        (static_front - longitudinal).clamp(weight * 0.06, weight + s.downforce - weight * 0.06);
    let rear = weight + s.downforce - front;
    let transfer = s.mass * (s.ay - s.gravity_y) * CG;
    let ft = (transfer * 0.48 / FRONT_TRACK).clamp(-front * 0.47, front * 0.47);
    let rt = (transfer * 0.52 / REAR_TRACK).clamp(-rear * 0.47, rear * 0.47);
    [
        front * 0.5 + ft,
        front * 0.5 - ft,
        rear * 0.5 + rt,
        rear * 0.5 - rt,
    ]
}

fn sign(x: f64) -> f64 {
    if x != 0. { x.signum() } else { 0. }
}

fn solve_wheel(
    w: &mut Wheel,
    vx: f64,
    vy: f64,
    radius: f64,
    fz: f64,
    drive: f64,
    brake: f64,
    dt: f64,
) {
    let direction = if vx.abs() > 0.1 {
        sign(vx)
    } else {
        let torque = if drive != 0. { drive } else { w.omega };
        if torque == 0. { 1. } else { sign(torque) }
    };
    let forward = vx * direction;
    let old = w.omega * direction;
    let drive = drive * direction;
    let denom = vx.abs().max(1.2);
    let angle = vy.atan2(denom);
    let relax = 1. - (-dt * vx.abs().max(3.) / 0.35).exp();
    let angle = w.angle + (angle - w.angle) * relax;
    let heat = 0.70 + 0.30 * (-((w.temperature - 85.) / 42.).powi(2)).exp();
    let pressure = (1. - (w.pressure - 1.9).abs() * 0.12).clamp(0.7, 1.);
    let capacity =
        1.65 * heat * pressure * (1. - 0.35 * w.wear) * (fz / 3500.).max(0.1).powf(-0.10) * fz;
    let fy = -20. * fz * angle.clamp(-1.3, 1.3).tan();
    let tyre_force = |q: f64| {
        let fx = 18. * fz * ((q * radius - forward) / denom);
        let magnitude = fx.hypot(fy);
        let scale = if magnitude > 1e-9 {
            capacity * (magnitude / capacity.max(1.)).tanh() / magnitude
        } else {
            0.
        };
        (fx * scale, fy * scale)
    };
    let residual = |q| INERTIA * (q - old) / dt - drive + brake + tyre_force(q).0 * radius;
    let mut q = 0.;
    if residual(0.) < 0. {
        let (mut lo, mut hi) = (
            0.,
            (old + drive.max(0.) * dt / INERTIA + vx.abs() / radius).max(1.),
        );
        for _ in 0..15 {
            let mid = (lo + hi) * 0.5;
            if residual(mid) > 0. {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        q = (lo + hi) * 0.5;
    }
    let force = tyre_force(q);
    w.omega = q * direction;
    w.slip = (q * radius - forward) / denom;
    w.angle = angle;
    w.fx = force.0 * direction;
    w.fy = force.1;
    w.fz = fz;
    w.grip = capacity;
    let slip = (w.fx * (w.omega * radius - vx)).abs() + (w.fy * vy).abs();
    let cooling = (12. + vx.abs() * 2.5) * (w.temperature - AMBIENT);
    w.temperature = (w.temperature
        + (slip * 0.65 + (w.fx * vx).abs() * 0.018 - cooling) * dt / 14500.)
        .clamp(AMBIENT, 180.);
    w.wear = (w.wear + slip * dt / 8e8).clamp(0., 1.);
    w.travel += vx.abs() * dt;
    w.pressure = (1.45 + 1.01325) * (w.temperature + 273.15) / (AMBIENT + 273.15) - 1.01325;
    w.brake_temp = (w.brake_temp
        + (brake * w.omega.abs() - (8. + vx.abs() * 1.2) * (w.brake_temp - AMBIENT)) * dt / 4800.)
        .clamp(AMBIENT, 1200.);
}

fn substep(s: &mut Body, wheels: &mut [Wheel; 4], commands: [f64; 3], dt: f64) -> bool {
    let [steer, throttle, brake] = commands;
    s.mass = 1265. + 75. + s.fuel * FUEL_DENSITY;
    let speed = s.u.hypot(s.v);
    let dynamic_pressure = 0.5 * 1.225 * speed * speed;
    s.downforce = dynamic_pressure * 3.2;
    s.drag = dynamic_pressure * 1.05;
    s.steering += (steer * 0.58 - s.steering).clamp(-1.8 * dt, 1.8 * dt);
    s.shift_cooldown = (s.shift_cooldown - dt).max(0.);
    if s.shift_remaining > 0. {
        s.shift_remaining = (s.shift_remaining - dt).max(0.);
        if s.shift_remaining == 0. {
            s.gear = s.target_gear;
        }
    }
    if s.automatic != 0. && s.gear > 0. && s.shift_remaining == 0. && s.shift_cooldown == 0. {
        let revs = wheel_rpm(wheels, s.gear);
        if revs > 8750. && s.gear < 6. {
            request_gear(s, wheels, s.gear + 1.);
        } else if revs < 4200. && s.gear > 1. && wheel_rpm(wheels, s.gear - 1.) < MAX_RPM - 1000. {
            request_gear(s, wheels, s.gear - 1.);
        }
    }
    let coupled = wheel_rpm(wheels, s.gear);
    let launch = IDLE + throttle * (2600. - IDLE);
    let target = IDLE
        .max(coupled)
        .max(if s.u.abs() < 7. { launch } else { 0. });
    s.rpm += (target - s.rpm).clamp(-30000. * dt, 30000. * dt);
    s.rpm = s.rpm.clamp(IDLE, 12000.);
    s.clutch = if s.gear == 0. || s.shift_remaining > 0. {
        0.
    } else {
        (s.u.abs() / 5. + 0.2 + throttle * 0.8).clamp(0., 1.)
    };
    s.limiter = u8::from(s.rpm >= MAX_RPM) as f64;
    let rear_slip = wheels[2].slip.max(wheels[3].slip);
    s.tc_active = u8::from(s.tc_enabled != 0. && throttle > 0. && rear_slip > 0.12) as f64;
    let target = if s.tc_active != 0. {
        (0.12 / rear_slip.max(0.12)).clamp(0.06, 1.)
    } else {
        1.
    };
    s.tc_factor += (target - s.tc_factor) * (dt / 0.045).min(1.);
    s.torque = if s.fuel > 0. && s.limiter == 0. && s.shift_remaining == 0. {
        torque(s.rpm) * throttle * s.tc_factor
    } else {
        0.
    };
    s.power = s.torque * s.rpm / RPM / 1000.;
    let engine_brake = if throttle == 0. && coupled > IDLE {
        60. * (coupled / MAX_RPM)
    } else {
        0.
    };
    let shaft = (s.torque - engine_brake) * ratio(s.gear) * 3.9 * 0.94 * s.clutch;
    let lock = 65. + shaft.abs() * 0.28;
    let diff = ((wheels[3].omega - wheels[2].omega) * 30.).clamp(-lock, lock);
    let loads = normal_loads(s);
    let (mut fx, mut fy, mut moment) = (0., 0., 0.);
    s.abs_active = 0.;
    let tangent = s.steering.tan();
    for (i, w) in wheels.iter_mut().enumerate() {
        let front = i < 2;
        let x = if front {
            WHEELBASE * (1. - FRONT_WEIGHT)
        } else {
            -WHEELBASE * FRONT_WEIGHT
        };
        let y =
            if i % 2 == 0 { -1. } else { 1. } * if front { FRONT_TRACK } else { REAR_TRACK } * 0.5;
        let delta = if front {
            (WHEELBASE * tangent).atan2(WHEELBASE - y * tangent)
        } else {
            0.
        };
        let (sin, cos) = delta.sin_cos();
        let body_x = s.u - s.r * y;
        let body_y = s.v + s.r * x;
        let vx = cos * body_x + sin * body_y;
        let vy = -sin * body_x + cos * body_y;
        let abs = s.abs_enabled != 0. && brake > 0. && vx.abs() > 2. && w.slip < -0.10;
        w.abs_active = u8::from(abs) as f64;
        w.abs_factor = (w.abs_factor + dt * if abs { -20. } else { 5. }).clamp(0.12, 1.);
        s.abs_active = s.abs_active.max(w.abs_active);
        let fade = (1. - (w.brake_temp - 750.).max(0.) / 800.).clamp(0.4, 1.);
        let bias = if front {
            s.brake_bias
        } else {
            1. - s.brake_bias
        };
        let brake_nm = brake
            * BRAKE_TORQUE
            * bias
            * 0.5
            * fade
            * if s.abs_enabled != 0. {
                w.abs_factor
            } else {
                1.
            };
        let wheel_drive = if front {
            0.
        } else {
            shaft * 0.5 + if i == 2 { diff } else { -diff }
        };
        solve_wheel(
            w,
            vx,
            vy,
            if front { FRONT_RADIUS } else { REAR_RADIUS },
            loads[i],
            wheel_drive,
            brake_nm,
            dt,
        );
        let bx = w.fx * cos - w.fy * sin;
        let by = w.fx * sin + w.fy * cos;
        fx += bx;
        fy += by;
        moment += x * by - y * bx;
    }
    let rolling = 0.012 * s.mass * s.gravity_normal * (s.u / 0.4).tanh();
    let (drag_x, drag_y) = if speed > 1e-6 {
        (s.drag * s.u / speed, s.drag * s.v / speed)
    } else {
        (0., 0.)
    };
    s.ax = (fx - rolling - drag_x) / s.mass + s.gravity_x;
    s.ay = (fy - drag_y) / s.mass + s.gravity_y;
    let du = s.ax + s.v * s.r;
    let dv = s.ay - s.u * s.r;
    s.u += du * dt;
    s.v += dv * dt;
    s.r += moment / 1700. * dt;
    let static_brake = brake * BRAKE_TORQUE / (REAR_RADIUS * s.mass);
    let static_gravity = s.gravity_x.hypot(s.gravity_y);
    if throttle == 0.
        && s.u.abs() < 0.08
        && s.v.abs() < 0.04
        && s.r.abs() < 0.04
        && (static_gravity == 0. || static_brake > static_gravity && brake > 0.05)
    {
        s.u = 0.;
        s.v = 0.;
        s.r = 0.;
        for wheel in wheels {
            wheel.omega = 0.;
        }
    }
    s.pitch_rate +=
        (s.mass * (s.ax - s.gravity_x) * CG - 140000. * s.pitch - 9000. * s.pitch_rate) / 600. * dt;
    s.roll_rate +=
        (s.mass * (s.ay - s.gravity_y) * CG - 110000. * s.roll - 7500. * s.roll_rate) / 420. * dt;
    s.pitch += s.pitch_rate * dt;
    s.roll += s.roll_rate * dt;
    s.fuel = (s.fuel - dt * (0.0007 + s.power * 1000. / (0.30 * 43e6 * FUEL_DENSITY))).max(0.);
    s.speed = s.u.hypot(s.v);
    s.distance += s.speed * dt;
    s.seconds += dt;
    [s.u, s.v, s.r, s.rpm, s.ax, s.ay]
        .into_iter()
        .all(f64::is_finite)
        && s.speed <= 150.
        && s.r.abs() <= 15.
}

#[derive(Clone, Copy)]
struct Road {
    height: f64,
    forward: [f64; 3],
    side: [f64; 3],
    normal_y: f64,
    pitch: f64,
    roll: f64,
    hessian: [f64; 3],
}

impl Road {
    fn sample(sample: &Function<'_>, x: f64, y: f64, heading: f64) -> rquickjs::Result<Self> {
        let values: Vec<f64> = sample.call((x, y))?;
        let [height, gx, gy, hxx, hxy, hyy, _] =
            values.try_into().map_err(|_| rquickjs::Error::Unknown)?;
        let (sin, cos) = heading.sin_cos();
        let p = gx * cos + gy * sin;
        let l = 1f64.hypot(p);
        let n = (1. + gx * gx + gy * gy).sqrt();
        let forward = [cos / l, p / l, sin / l];
        let normal = [-gx / n, 1. / n, -gy / n];
        let side = [
            forward[1] * normal[2] - forward[2] * normal[1],
            forward[2] * normal[0] - forward[0] * normal[2],
            forward[0] * normal[1] - forward[1] * normal[0],
        ];
        Ok(Self {
            height,
            forward,
            side,
            normal_y: normal[1],
            pitch: p.atan(),
            roll: (-gx * sin + gy * cos).atan(),
            hessian: [hxx, hxy, hyy],
        })
    }

    fn update(self, s: &mut Body) {
        let (vx, vy) = self.velocity(s);
        s.elevation = self.height;
        s.road_pitch = self.pitch;
        s.road_roll = self.roll;
        s.grade = self.pitch.tan() * 100.;
        s.gravity_x = -G * self.forward[1];
        s.gravity_y = -G * self.side[1];
        s.gravity_normal = G * self.normal_y;
        let [hxx, hxy, hyy] = self.hessian;
        let normal = (hxx * vx * vx + 2. * hxy * vx * vy + hyy * vy * vy) * self.normal_y;
        s.support = (s.gravity_normal + normal).max(0.);
        s.normal_g = s.support / G;
        s.vertical_speed = self.forward[1] * s.u + self.side[1] * s.v;
    }

    fn velocity(self, s: &Body) -> (f64, f64) {
        (
            self.forward[0] * s.u + self.side[0] * s.v,
            self.forward[2] * s.u + self.side[2] * s.v,
        )
    }
}

fn ground_velocity(s: &Body, heading: f64) -> (f64, f64) {
    let (sin, cos) = heading.sin_cos();
    (cos * s.u - sin * s.v, sin * s.u + cos * s.v)
}

pub fn advance<'js>(
    ctx: Ctx<'js>,
    packet: TypedArray<'js, f64>,
    commands: Vec<f64>,
    dt: f64,
    terrain: Option<Function<'js>>,
) -> rquickjs::Result<TypedArray<'js, f64>> {
    let mut values = unsafe { packet.as_slice() }.iter().copied();
    let error = || Exception::throw_message(&ctx, "Stato fisico Porsche incompleto");
    let mut s = Body::read(&mut values).ok_or_else(error)?;
    let [Some(fl), Some(fr), Some(rl), Some(rr)] = [
        Wheel::read(&mut values),
        Wheel::read(&mut values),
        Wheel::read(&mut values),
        Wheel::read(&mut values),
    ] else {
        return Err(error());
    };
    let mut wheels = [fl, fr, rl, rr];
    let mut car = Motion::read(&mut values).ok_or_else(error)?;
    let commands: [f64; 3] = commands.try_into().map_err(|_| error())?;
    let n = (dt * 240. - 1e-8).ceil() as usize;
    let h = dt / n as f64;
    let mut dx = 0.;
    let mut dy = 0.;
    let mut heading = car.heading;
    for _ in 0..n {
        let (x, y) = (car.x + dx * car.scale, car.y + dy * car.scale);
        if let Some(sample) = &terrain {
            Road::sample(sample, x, y, heading)?.update(&mut s);
        }
        if !substep(&mut s, &mut wheels, commands, h) {
            return Err(Exception::throw_message(
                &ctx,
                "Stato fisico Porsche non valido",
            ));
        }
        let mid = heading + s.r * h * 0.5;
        let (vx, vy) = if let Some(sample) = &terrain {
            Road::sample(sample, x, y, mid)?.velocity(&s)
        } else {
            ground_velocity(&s, mid)
        };
        dx += vx * h;
        dy += vy * h;
        heading += s.r * h;
    }
    car.x += dx * car.scale;
    car.y += dy * car.scale;
    car.heading = heading % TAU;
    let (vx, vy) = if let Some(sample) = &terrain {
        let road = Road::sample(sample, car.x, car.y, heading)?;
        road.update(&mut s);
        road.velocity(&s)
    } else {
        ground_velocity(&s, heading)
    };
    car.distance += s.speed * dt * car.scale;
    car.lifetime += dt;
    let long = (s.ax - s.gravity_x) / G;
    let lat = (s.ay - s.gravity_y) / G;
    let total = if terrain.is_some() {
        (long * long + lat * lat + (s.normal_g - 1.).powi(2)).sqrt()
    } else {
        s.ax.hypot(s.ay) / G
    };
    let transfer = (lat * CG / FRONT_TRACK + long * CG / WHEELBASE).clamp(-1., 1.);
    let mut output = Vec::with_capacity(128);
    s.write(&mut output);
    for wheel in &wheels {
        wheel.write(&mut output);
    }
    car.write(&mut output);
    output.extend([
        s.steering / 0.58,
        s.u * car.scale,
        s.v * car.scale,
        s.r,
        vx * car.scale,
        vy * car.scale,
        s.speed * car.scale,
        s.ax,
        s.ay,
        long,
        lat,
        total,
        transfer,
        if s.u.abs() < 0.1 {
            0.
        } else {
            s.v.atan2(s.u.abs())
        },
    ]);
    TypedArray::new(ctx, output)
}
