'use strict';
// One independently loaded, actually completed native episode under V8's CPU
// sampler. Profiling observations are not uninstrumented performance timings.
const fs=require('node:fs'),path=require('node:path'),Identity=require('./neural-research-source-identity.cjs'),Native=require('./statehead-model-io.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/neuronal-native-cpu-profile');
if(fs.existsSync(out))throw Error('Preserve any existing CPU profile');fs.mkdirSync(out,{recursive:false});
const modelFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json');
const identity={format:'male-cns-actual-native-cpu-profile-v1',pid:process.pid,modelFile,modelSha256:Identity.sha(fs.readFileSync(modelFile)),execArgv:process.execArgv,
  sourceHashes:Identity.collect(['work/profile-neural-native.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe']),
  boundary:'One V3/Monza warm-start native full episode with V8 CPU profiling. Another owned learner may run concurrently. Not app FPS, uninstrumented wall timing, GPU comparison or general bottleneck proof.'};
fs.writeFileSync(path.join(out,'identity.json'),JSON.stringify(identity,null,2));
const proof=Native.execute({file:modelFile});fs.writeFileSync(path.join(out,'native-proof.json'),JSON.stringify(proof,null,2));
process.stdout.write(JSON.stringify({passed:proof.passed,result:proof.result,actionTraceSha256:proof.actionTraceSha256})+'\n');if(!proof.passed)process.exitCode=1;
