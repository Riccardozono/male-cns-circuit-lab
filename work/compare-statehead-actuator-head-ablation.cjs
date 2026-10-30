'use strict';
// Causal, same-seed physical ablation of the two learned motor heads.
// No policy is trained or saved; only temporary inference weights differ.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-actuator-head-ablation-20261020-01');
const hash=()=>crypto.createHash('sha256');
const MAX_CONTROLS=12000;
function summarize(env){const s=env.state(),c=s.car;return {progress:s.bestProgress,laps:s.laps,lapTimes:s.lapTimes,reason:s.complete?s.reason:'censored at diagnostic control limit',seconds:s.totalSimulationSeconds,complete:s.complete,fitness:s.fitness,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),gate:env.stateHeadSnapshot().gate};}
function makeAgent(loaded,name,weights,topology){const env=Model.createFromLoaded(loaded,{weights,id:0,sharedTopology:topology});return {name,weights,env,trace:hash(),controls:0,segments:[],trackLength:null,previousLaps:0};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing actuator-head ablation');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),full=loaded.data.weights.slice();
  if(full.length!==18||!/^[0-9a-f]{64}$/.test(selected.actionTraceSha256))throw Error('The exact protected 18-weight V3 parent is required');
  const variants=[
    {name:'learned-full',weights:full},
    {name:'steering-head-zeroed',weights:full.map((v,i)=>i%2===0?0:v)},
    {name:'longitudinal-head-half',weights:full.map((v,i)=>i%2===1?v*.5:v)},
    {name:'longitudinal-head-quarter',weights:full.map((v,i)=>i%2===1?v*.25:v)},
    {name:'longitudinal-head-zeroed',weights:full.map((v,i)=>i%2===1?0:v)},
    {name:'zero-head-parent',weights:Array(18).fill(0)},
  ];
  let topology=null;const agents=variants.map(v=>{const a=makeAgent(loaded,v.name,v.weights,topology);topology=a.env.topology;return a;});
  const startedAt=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents.some(a=>a.env.currentCar().alive)){
      control++;
      for(const a of agents){const car=a.env.currentCar();if(!car.alive)continue;const s=a.env.step();const c=s.car;a.controls++;
        a.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
        if(c.laps>a.previousLaps&&a.trackLength===null)a.trackLength=s.bestProgress;
        a.previousLaps=c.laps;
        if(control%10===0){const lap=c.laps,along=s.bestProgress-lap*(a.trackLength??5793.245039732817);
          if(along>=650&&along<=900)a.segments.push({control,lap,progress:s.bestProgress,along,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),gate:a.env.stateHeadSnapshot().gate,lateralG:c.lateralG,longitudinalG:c.longitudinalG});}
      }
      if(control%2000===0)console.log('STATEHEAD_HEAD_ABLATION_PROGRESS '+JSON.stringify({control,agents:agents.map(a=>({name:a.name,...summarize(a.env)}))}));
    }
    const results=agents.map(a=>({name:a.name,weightsSha256:crypto.createHash('sha256').update(JSON.stringify(a.weights)).digest('hex'),result:summarize(a.env),controls:a.controls,actionTraceSha256:a.trace.copy().digest('hex'),samples650to900m:a.segments}));
    const fullResult=results.find(r=>r.name==='learned-full');
    if(fullResult.actionTraceSha256!==selected.actionTraceSha256)throw Error('Full-head branch did not reproduce the protected reference action trace');
    const report={format:'male-cns-statehead-actuator-head-ablation-v1',appVersion:'5.6.0',passed:results.length===variants.length,model:{sha256:loaded.sha256,file:selected.file,referenceTrace: selected.actionTraceSha256},
      method:'Six same-seed, lockstep V3/Monza physical replays. The comparison independently zeros the interleaved steering coefficients (even indices), tests longitudinal-head gains 0.5 and 0.25, zeros the longitudinal coefficients (odd indices), and includes the full learned model and zero-head V3 controls. No reward, physics, sensors, actions, or saved weights are modified.',
      controlsPerEpisode:control,results,gpu:Model.stats(),elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'One deterministic seed isolates the contribution of each learned motor head for this replay only. It does not train a model, establish two-lap completion, or prove generalization. All source models and user saves remain unchanged.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_HEAD_ABLATION_RESULT '+JSON.stringify({passed:report.passed,controls:control,results:results.map(r=>({name:r.name,result:r.result,trace:r.actionTraceSha256,traceMatchesReference:r.actionTraceSha256===selected.actionTraceSha256,samples:r.samples650to900m.length,terminalSamples:r.samples650to900m.slice(-2)})),gpu:report.gpu,report:path.join(out,'report.json')}));
  }finally{for(const a of agents)a.env.close?.();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);Model.closeCuda();process.exitCode=1;});
