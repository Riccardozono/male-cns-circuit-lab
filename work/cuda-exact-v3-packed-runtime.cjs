'use strict';
// One lazily created, owned CUDA context per native worker process.
const {CudaPass}=require('./cuda-exact-v3-packed-pass.cjs');let instance=null;
function pass(...args){if(!instance)instance=new CudaPass();return instance.pass(...args);}
function stats(){return instance?instance.stats():{calls:0,gpuCalls:0,kernelLaunches:0,cpuFallbacks:0};}
function identity(){if(!instance)throw Error('CUDA has not actually run');return instance.identity();}
function close(){if(instance){instance.close();instance=null;}}
module.exports={pass,stats,identity,close};
