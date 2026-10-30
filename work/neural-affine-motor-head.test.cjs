'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IDENTITY, LIMITS, compose } = require('./neural-affine-motor-head.cjs');
const { Search } = require('./neural-affine-head-cma.cjs');

test('identity calibration returns the exact parent commands for every neural gate', () => {
  for (const parent of [[0, 0, 0], [-1, 0, 1], [1, 1, 0], [0.237, 0.681, 0]]) {
    for (const gate of [0, 1e-9, 0.5, 1]) assert.deepStrictEqual(compose(parent, gate, IDENTITY), parent);
  }
});

test('no neural context preserves the parent exactly for non-identity coefficients', () => {
  const parent = [-0.438, 0.127, 0];
  assert.deepStrictEqual(compose(parent, 0, [2, 0.25, 0.25, -0.25]), parent);
});

test('steering and longitudinal affine channels are independent and pedals stay exclusive', () => {
  const parent = [0.2, 0.4, 0];
  const steerOnly = compose(parent, 1, [1, 0.2, 1, 0]);
  assert.ok(steerOnly[0] > parent[0]);
  assert.equal(steerOnly[1], parent[1]);
  assert.equal(steerOnly[2], 0);
  const lowThrottleParent = [parent[0], 0.1, 0];
  const brakeOnly = compose(lowThrottleParent, 1, [1, 0, 1, -0.25]);
  assert.equal(brakeOnly[0], lowThrottleParent[0]);
  assert.equal(brakeOnly[1], 0);
  assert.ok(brakeOnly[2] > 0);
  for (const value of [...steerOnly, ...brakeOnly]) assert.ok(Number.isFinite(value) && Math.abs(value) <= 1);
});

test('invalid coefficients, non-exclusive pedals and gates are rejected', () => {
  assert.throws(() => compose([0, 0, 0], 0, [1, 0, 1]), /Four bounded/);
  assert.throws(() => compose([0, 0.1, 0.1], 0, IDENTITY), /exclusive/);
  assert.throws(() => compose([0, 0, 0], 1.1, IDENTITY), /neural gate/);
  assert.throws(() => compose([0, 0, 0], 1, [3, 0, 1, 0]), /Four bounded/);
});

test('CMA scores the exact bounded four-dimensional vectors and retains identity as the first candidate', () => {
  const search = new Search({ mean: IDENTITY.slice(), sigma: 0.2, population: 16, seed: 15102116 });
  const rows = search.ask(IDENTITY.slice());
  assert.equal(rows.length, 16);
  assert.deepStrictEqual(rows[0], IDENTITY);
  for (const row of rows) {
    assert.equal(row.length, 4);
    row.forEach((value, index) => assert.ok(value >= LIMITS[index][0] && value <= LIMITS[index][1]));
  }
  assert.deepStrictEqual(search.pending.map(candidate => candidate.x), rows);
  const result = search.tell(rows.map((_, index) => -index));
  assert.equal(result.generation, 1);
  assert.throws(() => search.tell(rows.map(() => 0)), /Actual complete fitness batch required/);
});
