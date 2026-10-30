'use strict';
// Diagnostic second-stall RBF sweep on the exact V3/Monza save, using the
// verified CUDA neural pass. Only neural-state residuals are varied.
const path=require('node:path'),root=path.resolve(__dirname,'..');
const Dense=require(path.join(root,'outputs/dense-neural.js'));
const Cuda=require('./cuda-exact-v3-runtime.cjs');
const originalStep=Dense.step;
Dense.step=(...args)=>Cuda.pass(...args);
process.env.MALECNS_V3_GATE_TAG='saved-v3-stall-actuator-diagnostic-cuda-20261022-01';
process.env.MALECNS_V3_GATE_SECOND_STAGE='1';
process.env.MALECNS_V3_GATE_FIRST_DELTA='.113';
process.env.MALECNS_V3_GATE_DELTAS='.4';
process.env.MALECNS_V3_GATE_STEERING_DELTAS='.16';
process.env.MALECNS_V3_GATE_CAPTURE_DELTA='.4';
process.env.MALECNS_V3_GATE_CAPTURE_STEERING='.16';
process.env.MALECNS_V3_GATE_SECOND_CAPTURE='1';
process.once('beforeExit',()=>{
  const stats=Cuda.stats();
  console.log('V3_SECOND_STALL_RBF_CUDA_STATS '+JSON.stringify(stats));
  Dense.step=originalStep;
  Cuda.close();
  if(stats.gpuCalls===0||stats.cpuFallbacks!==0)process.exitCode=1;
});
require('./benchmark-saved-v3-brake-onset-rbf.cjs');
