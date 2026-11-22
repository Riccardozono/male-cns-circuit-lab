'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const bridge = fs.readFileSync(path.join(__dirname, 'src/bridge.js'), 'utf8');
const lap = (id) => ({
  id, laps: 2, alive: false, diagnosticVehicle: false, bestProgress: 2000,
  lapTimes: [41, 43], lastLapStartTime: 84, reason: 'limite 2 giri',
});
const active = (id) => ({id, laps: 0, alive: true, bestProgress: 0, lapTimes: []});

function episode(steps) {
  let clock = 0;
  let next = 0;
  class Simulation {
    constructor() {
      this.cars = [active(0), active(1)];
      this.track = {
        pixelsPerMeter: 1, total: 1000, halfWidth: 5,
        outer: [], inner: [], center: [{x:0, y:0}], widthStations: [],
      };
      this.circuit = {name: 'Fixture'};
      this.graph = {n:1, edgeCount:1};
      this.generation = 1;
      this.elapsed = 0;
      this.ticks = 0;
      this.history = [];
      this.running = true;
    }
    tick() {
      const {time, cars} = steps[next++];
      clock += time;
      this.elapsed += 1/60;
      this.ticks++;
      this.cars = cars;
      this.onTrialTick(this);
    }
  }

  const ctx = vm.createContext({
    nativeCircuits: '{}', nativeReducedGraph: '{}',
    nativeWallNow: () => clock,
    MaleCNSLegacy: {buildV2: () => ({})},
    MaleCNSVehicle: {Terrain: {forTrack: () => ({sample: () => ({height: 0})})}},
    FlySim: {Simulation, compareAgents: () => 0, sensorDistances: () => []},
  });
  vm.runInContext(bridge, ctx, {filename: 'native/src/bridge.js'});
  const vehicle = {speedMps:0, rpm:0, gear:1, absEnabled:true, tcEnabled:true};
  for (const step of steps) for (const car of step.cars) car.vehicle = vehicle;
  ctx.nativeStart('v2', 'lab', 2, 7717, 0.32, 'connectome');
  ctx.nativeTrackTrial();
  return (wall = 0, limit = 0) => JSON.parse(ctx.nativeAdvance(steps.length, wall, limit)).trial;
}

test('Due giri restano in corso fino alla fine naturale della generazione', () => {
  const result = episode([
    {time:0.01, cars:[lap(0), active(1)]},
    {time:0.01, cars:[lap(0), {...active(1), alive:false}]},
  ])();
  assert.equal(result.hit.twoLapSimSeconds, 84);
  assert.equal(result.ticks, 2);
  assert.equal(result.generations, 1);
  assert.equal(result.limitReached, false);
  assert.equal(result.done, true);
});

test('Il secondo giro dopo il limite reale non conta', () => {
  const result = episode([
    {time:0.10, cars:[lap(0), {...active(1), alive:false}]},
  ])(59.99,60);
  assert.equal(result.limitReached,true);
  assert.equal(result.hit,null);
  assert.equal(result.done,true);
});

test('Il limite prevale anche se i due giri precedono la fine della generazione', () => {
  const result = episode([
    {time:0.01, cars:[lap(0), active(1)]},
    {time:0.30, cars:[lap(0), {...active(1), alive:false}]},
  ])(59.80,60);
  assert.equal(result.hit.twoLapSimSeconds,84);
  assert.equal(result.limitReached,true);
  assert.equal(result.generations,0);
});
