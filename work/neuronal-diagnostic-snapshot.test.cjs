'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Snapshot=require('./neuronal-diagnostic-snapshot.cjs');
test('Diagnostic sensory targets and neurons are copied at the same instant, never after the mutable physics step',()=>{
  // Isolated aliasing fixture, never an optimizer example or vehicle action.
  const state={totalSimulationSeconds:1,bestProgress:2,observation:[.1,.2],car:{sensorVector:[.3,.4],vehicle:{speedMps:30}}},extra=[.5,.6],sample=Snapshot.capture(state,extra);
  state.totalSimulationSeconds=1.1;state.bestProgress=3;state.observation[0]=.9;state.car.sensorVector[0]=.9;state.car.vehicle.speedMps=90;extra[0]=.9;
  assert.deepEqual(sample,{seconds:1,progress:2,observation:[.1,.2],additionalNeuronalHistory:[.5,.6],sensors:[.3,.4],speedMps:30});
});
