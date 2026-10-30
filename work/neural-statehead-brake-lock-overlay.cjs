'use strict';

// Isolated scoring overlay for the state-head training copy. It observes the
// physical result of each existing drive tick and never changes a command,
// sensor, neural state, vehicle parameter, or physics step.
const BrakeRewards = require('../outputs/rewards.js');
const BrakeRules = BrakeRewards.RULES;
const BaseRules = require('../.impeccable/experimental-penalty5/outputs/rewards.js').RULES;

const REVISION = 'progress-5-brake-lock-overlay-v1';
const managersByRuntime = new WeakMap();
const RULES = Object.freeze({
  revision: REVISION,
  graceSeconds: BrakeRules.brakeLockGraceSeconds,
  penaltyPerSecond: BrakeRules.brakeLockPenaltyPerSecond,
  speedFloorMps: BrakeRules.brakeLockSpeedFloorMps,
  motionLimitMps: BrakeRules.brakeLockMotionMps,
  minPaceFraction: BaseRules.minPaceFraction,
  highWaterMeters: 20,
  minimumBrake: 0.5,
  maximumThrottle: 0.05,
});

if (!Object.entries(RULES).filter(([key]) => key !== 'revision').every(([, value]) => Number.isFinite(value)) || RULES.penaltyPerSecond <= 0 ||
    RULES.graceSeconds < 0 || RULES.minPaceFraction <= 0) {
  throw Error('A complete, finite brake-lock rule set is required');
}

function advanceLock(seconds, input) {
  if (!Number.isFinite(seconds) || seconds < 0 || !input ||
      !Number.isFinite(input.dt) || input.dt <= 0) {
    throw Error('Finite brake-lock state and positive physics dt required');
  }
  const locked = input.safe === true && input.continuous === true &&
    input.highWaterMeters > RULES.highWaterMeters &&
    Number.isFinite(input.minimumPaceMps) && input.minimumPaceMps > 0 &&
    Number.isFinite(input.speedMps) && Math.abs(input.speedMps) < input.minimumPaceMps &&
    Number.isFinite(input.motionMps) && Math.abs(input.motionMps) <= RULES.motionLimitMps &&
    Number.isFinite(input.brake) && input.brake >= RULES.minimumBrake &&
    Number.isFinite(input.throttle) && input.throttle <= RULES.maximumThrottle;
  const nextSeconds = locked ? seconds + input.dt : 0;
  const chargedSeconds = locked
    ? Math.max(0, nextSeconds - RULES.graceSeconds) - Math.max(0, seconds - RULES.graceSeconds)
    : 0;
  return { locked, seconds: nextSeconds, penalty: RULES.penaltyPerSecond * chargedSeconds };
}

function applyPenalty(car, amount) {
  if (!(amount > 0)) return;
  const penalties = car.rewardBreakdown?.penalties;
  if (!penalties || !Number.isFinite(penalties.stall) ||
      !Number.isFinite(car.reward) || !Number.isFinite(car.penalty) ||
      !Number.isFinite(car.fitness) || !Number.isFinite(car.baseFitness)) {
    throw Error('The existing physical reward ledger is required for brake-lock scoring');
  }
  penalties.stall += amount;
  car.penalty += amount;
  car.fitness = car.reward - car.penalty;
  car.baseFitness -= amount;
  car.lastPenalty = amount;
}

function attach(env) {
  if (!env?.runtime || typeof env.runtime.drive !== 'function' ||
      typeof env.currentCar !== 'function' || typeof env.reset !== 'function') {
    throw Error('An actual live state-head physical environment is required');
  }
  let manager = managersByRuntime.get(env.runtime);
  if (!manager) {
    const originalDrive = env.runtime.drive;
    const stateByCar = new WeakMap();
    manager = { stateByCar };
    env.runtime.drive = function brakeLockScoredDrive(track, car, commands, dt) {
      const beforeProgress = car.progress;
      const result = originalDrive.call(this, track, car, commands, dt);
      const rewardState = car.rewardState;
      const state = stateByCar.get(car);
      if (!rewardState || !state || !Number.isFinite(beforeProgress)) return result;
      const vehicle = car.vehicle || {};
      const speedMps = Math.abs(vehicle.speedMps ?? car.speed ?? 0);
      const ppm = track.pixelsPerMeter || 1;
      const safe = car.alive || !['urto', 'fuori pista', 'progresso non valido'].includes(car.reason);
      const minimumPaceMps = Math.max(
        RULES.speedFloorMps,
        track.total / BrakeRewards.referenceLapTime(track) * RULES.minPaceFraction,
      );
      const lock = advanceLock(state.seconds, {
        safe,
        continuous: rewardState.invalidSteps === 0,
        highWaterMeters: rewardState.highWater / ppm,
        minimumPaceMps,
        speedMps,
        motionMps: Math.abs(car.progress - beforeProgress) / (ppm * dt),
        brake: Number(commands?.[2]),
        throttle: Number(commands?.[1]),
        dt,
      });
      if (lock.locked && state.seconds === 0) state.intervals++;
      state.seconds = lock.seconds;
      if (lock.penalty > 0) {
        applyPenalty(car, lock.penalty);
        state.totalPenalty += lock.penalty;
      }
      rewardState.brakeLockSeconds = state.seconds;
      return result;
    };
    managersByRuntime.set(env.runtime, manager);
  }
  const { stateByCar } = manager;
  const reset = env.reset;
  env.reset = function resetWithBrakeLockState(...args) {
    const state = reset.apply(this, args);
    const car = env.currentCar();
    if (car) stateByCar.set(car, { seconds: 0, totalPenalty: 0, intervals: 0 });
    return state;
  };
  env.brakeLockSnapshot = () => {
    const car = env.currentCar();
    const state = car && stateByCar.get(car);
    return { revision: REVISION, seconds: state?.seconds || 0,
      totalPenalty: state?.totalPenalty || 0, intervals: state?.intervals || 0 };
  };
  // The constructor's initial reset predates the drive wrapper. Reinitialize
  // once so the first evaluated episode uses the exact same reset path.
  env.reset();
  return env;
}

module.exports = { REVISION, RULES, advanceLock, applyPenalty, attach };
