'use strict';
// Four-parameter affine calibration of actual parent motor commands. A zero
// neural gate and the identity vector preserve the parent action exactly.
const LIMITS = [[0.25, 2], [-0.25, 0.25], [0.25, 2], [-0.25, 0.25]];
const IDENTITY = Object.freeze([1, 0, 1, 0]);
const atanh = value => Math.atanh(Math.max(-1 + 1e-12, Math.min(1 - 1e-12, value)));

function validate(parameters) {
  if (!Array.isArray(parameters) || parameters.length !== 4 || parameters.some((value, index) =>
    !Number.isFinite(value) || value < LIMITS[index][0] || value > LIMITS[index][1])) {
    throw Error('Four bounded affine motor coefficients required');
  }
}

function compose(parent, gate, parameters) {
  validate(parameters);
  if (!Array.isArray(parent) || parent.length !== 3 || parent.some(value => !Number.isFinite(value) || Math.abs(value) > 1)
    || parent[1] < 0 || parent[2] < 0 || Math.min(parent[1], parent[2]) !== 0
    || !Number.isFinite(gate) || gate < 0 || gate > 1) {
    throw Error('Actual bounded exclusive parent commands and neural gate required');
  }
  if (gate === 0 || parameters.every((value, index) => value === IDENTITY[index])) return parent.slice();

  const steeringLogit = atanh(parent[0]);
  const longitudinal = parent[1] - parent[2];
  const longitudinalLogit = atanh(longitudinal);
  const steering = parameters[0] === 1 && parameters[1] === 0 ? parent[0]
    : Math.tanh(steeringLogit + gate * ((parameters[0] - 1) * steeringLogit + parameters[1]));
  const adjustedLongitudinal = parameters[2] === 1 && parameters[3] === 0 ? longitudinal
    : Math.tanh(longitudinalLogit + gate * ((parameters[2] - 1) * longitudinalLogit + parameters[3]));
  return [steering, Math.max(0, adjustedLongitudinal), Math.max(0, -adjustedLongitudinal)];
}

module.exports = { LIMITS, IDENTITY, validate, compose };
