'use strict';
// Same-seed lockstep replay: protected V3 state-head vs its identical zero-head parent.
// Reports actual motor commands in the same lap-distance windows; no training/actions injected.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-zero-vs-learned-20261020-01');
const hash=()=>crypto.createHash('sha256');
function summarize(env){const c=env.currentCar();return {progress:c.bestProgress,laps:c.laps,lapTimes:c.lapTimes,reason:c.alive?'':c.reason,seconds:c.lifetime,fitness:c.fitness};}
function snapshot(env,lap,trackLength){const c=env.currentCar(),head=env.stateHeadSnapshot(),v=c.vehicle||{};return {control:c.lifetime*10,lap,progress:c.bestProgress,along:c.bestProgress-lap*trackLength,x:c.x,y:c.y,heading:c.heading,speedMps:v.speedMps??0,outputs:c.outputs.slice(),gate:head.gate,longitudinalG:c.longitudinalG,lateralG:c.lateralG};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite previous comparison');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),zero=Array(18).fill(0);
  const learned=Model.createFromLoaded(loaded,{weights:loaded.data.weights,id:0});
  const parent=Model.createFromLoaded(loaded,{weights:zero,id:0,sharedTopology:learned.topology});
  const agents=[{name:'learned',env:learned,trace:hash(),laps:0,trackLength:null,segments:{lap1:[],lap2:[]},overlap:0,firstDivergence:null},
    {name:'zero-head',env:parent,trace:hash(),laps:0,trackLength:null,segments:{lap1:[],lap2:[]},overlap:0,firstDivergence:null}];
  let control=0;
  try{
    while(control<12000&&agents.some(a=>a.env.currentCar().alive)){
      control++;
      for(const a of agents){if(!a.env.currentCar().alive)continue;const s=a.env.step(),c=s.car;
        a.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,c.outputs])+'\n');
        a.overlap+=Number(c.outputs[1]>1e-9&&c.outputs[2]>1e-9);
        if(a.trackLength===null&&c.laps>0){a.trackLength=c.bestProgress;a.laps=c.laps;}
        const lap=c.laps,along=a.trackLength===null?c.bestProgress:c.bestProgress-lap*a.trackLength;
        const key=lap===0?'lap1':lap===1?'lap2':null;
        if(key&&control%5===0&&along>=650&&along<=900)a.segments[key].push(snapshot(a.env,lap,a.trackLength||Infinity));
      }
      if(control%2000===0)console.log('STATEHEAD_ZERO_COMPARE_PROGRESS '+JSON.stringify({control,learned:summarize(learned),zero:summarize(parent)}));
    }
    const reports=agents.map(a=>({name:a.name,result:summarize(a.env),actionTraceSha256:a.trace.digest('hex'),throttleBrakeOverlapTicks:a.overlap,
      segments:{lap1:a.segments.lap1,lap2:a.segments.lap2},gate:a.env.stateHeadSnapshot().gate}));
    const report={format:'male-cns-statehead-zero-vs-learned-lockstep-v1',appVersion:'5.6.0',modelSha256:loaded.sha256,
      method:'Two identical V3/Monza environments, same seed and shared compiled topology, stepped in lockstep. One uses all 18 verified coefficients; the other uses exactly zero coefficients. Captures every fifth control in matching 650–900 m windows on laps 1 and 2.',
      controlsPerEpisode:control,results:reports,gpu:Model.stats(),boundary:'One deterministic paired replay; separates the measured correction from its frozen V3 parent for this seed only. No application, save or training state changed.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_ZERO_COMPARE '+JSON.stringify({controls:control,results:reports.map(r=>({name:r.name,result:r.result,trace:r.actionTraceSha256,overlap:r.throttleBrakeOverlapTicks,gate:r.gate,lap1Samples:r.segments.lap1.length,lap2Samples:r.segments.lap2.length,lap2First:r.segments.lap2[0],lap2Last:r.segments.lap2.at(-1)})),gpu:report.gpu,report:path.join(out,'report.json')}));
  }finally{Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);Model.closeCuda();process.exitCode=1;});
