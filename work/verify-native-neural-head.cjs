'use strict';
// Actual Node closed-loop inference, not a replay of saved control actions.
const fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs'),Bridge=require('./neural-rl-bilateral.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.impeccable/review/neural-sacl/native-neural-head');
const file=path.join(output,'learned-head.malecns-neural-exp.json'),p=Head.load(file),env=Bridge.create();Head.validateEnvironment(p,env.metadata());
function replay(){
  let s=env.reset('full'),overlap=0,controls=0;
  while(true){
    s=env.step(Head.action(p,s.observation));const c=env.inspect().lastCommands;
    overlap+=Number(c[1]>0&&c[2]>0);controls++;
    if(s.terminated||s.truncated)return {result:s.info,censored:s.truncated,controls,gasBrakeOverlapSteps:overlap};
  }
}
const first=replay(),second=replay();
if(JSON.stringify(first)!==JSON.stringify(second)||first.gasBrakeOverlapSteps||first.censored)throw Error('Native neural head replay is invalid');
const report={passed:true,first,independentRepeat:second,cudaReference:p.verifiedCudaReference,
  progressDifference:first.result.bestProgress-p.verifiedCudaReference.bestProgress,
  fitnessDifference:first.result.fitness-p.verifiedCudaReference.fitness,
  inferenceRevision:'js-f32-layer-output-f64-dot-v1',environment:env.metadata(),checkpointSha256:Head.sha(fs.readFileSync(file,'utf8')),
  boundary:'Real physical from-line inference using learned coefficient arrays. No recorded actions, pose/time inputs or route driver. This verifies Node, not Electron UI integration or convergence.'};
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));
console.log('NATIVE_NEURAL_HEAD_DONE '+JSON.stringify({...report,environment:undefined}));
