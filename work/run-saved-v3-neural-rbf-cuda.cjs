'use strict';
// Run the existing isolated saved-V3 radial neural gate replay through the
// verified exact CUDA neural pass. This wrapper does not change app sources.
const path=require('node:path'),root=path.resolve(__dirname,'..');
const Dense=require(path.join(root,'outputs/dense-neural.js'));
const Cuda=require('./cuda-exact-v3-runtime.cjs');
const originalStep=Dense.step;
Dense.step=(...args)=>Cuda.pass(...args);
process.env.MALECNS_V3_GATE_TAG='saved-v3-neural-rbf-joint-steering-cuda-20261022-01';
process.env.MALECNS_V3_GATE_DELTAS='.10';
process.env.MALECNS_V3_GATE_STEERING_DELTAS='-.16,-.08,.08,.16';
process.once('beforeExit',()=>{
  const stats=Cuda.stats();
  console.log('V3_NEURAL_RBF_CUDA_STATS '+JSON.stringify(stats));
  Dense.step=originalStep;
  Cuda.close();
  if(stats.gpuCalls===0||stats.cpuFallbacks!==0)process.exitCode=1;
});
require('./benchmark-saved-v3-brake-onset-rbf.cjs');
