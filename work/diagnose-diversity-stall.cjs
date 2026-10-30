'use strict';
// A complete real from-line diagnostic. Body/geometry fields are observed for
// diagnosis only; they are never fed to the learned neuronal controller.
const fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-model.cjs'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/diversity-stall-3298');
if(fs.existsSync(path.join(out,'report.json')))throw Error('Preserve existing diagnosis');fs.mkdirSync(out,{recursive:true});
const modelFile=path.join(root,'.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json'),reportFile=path.join(root,'.impeccable/review/neural-sacl/neural-diversity-resume-40/report.json');
const prior=JSON.parse(fs.readFileSync(reportFile,'utf8'));if(!prior.passed||JSON.stringify(prior.fullChampion.result)!==JSON.stringify(prior.independentChampionRepeat.result))throw Error('A fully verified own learned champion is required');
const loaded=Model.load(modelFile),env=Model.createFromLoaded(loaded,{weights:prior.state.champion.weights}),rows=[],p=loaded.data.projection;
const features=obs=>{const normalized=p.mean.map((v,j)=>(obs[j]-v)/p.scales[j]);return [1,...p.components.map((r,k)=>Math.tanh(r.reduce((s,v,j)=>s+v*normalized[j],0)/p.componentStd[k]))];};
let s=env.state(),controls=0,overlap=0;
while(!s.complete&&controls<10000){
  const observation=s.observation.slice(),old=Stack.action(loaded.model,observation),f=features(observation),before=s.bestProgress;
  s=env.step();controls++;const c=s.car;overlap+=Number(c.outputs[1]>0&&c.outputs[2]>0);
  rows.push({observation,features:f,oldAction:old,progress:c.bestProgress,deltaProgress:c.bestProgress-before,seconds:s.totalSimulationSeconds,
    x:c.x,y:c.y,heading:c.heading,inputs:c.inputs.slice(),physicsInputs:c.physicsInputs.slice(),outputs:c.outputs.slice(),
    speedKmh:c.vehicle.speedMps*3.6,rpm:c.vehicle.rpm,gear:c.vehicle.gear,lateralG:c.lateralG,steeringAngle:c.vehicle.steeringAngle,
    fitness:c.fitness,penalty:c.penalty,alive:c.alive,reason:c.reason||'',gate:env.frontierState().peak});
}
const expected=prior.fullChampion.result,fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'],matches=fields.every(k=>s[k]===expected[k]);
const tail=rows.filter(r=>r.progress>3200),summary=window=>({samples:window.length,meanGas:window.reduce((t,r)=>t+r.outputs[1],0)/window.length,meanBrake:window.reduce((t,r)=>t+r.outputs[2],0)/window.length,
  meanSpeedKmh:window.reduce((t,r)=>t+r.speedKmh,0)/window.length,featureRanges:Array.from({length:5},(_,k)=>[Math.min(...window.map(r=>r.features[k])),Math.max(...window.map(r=>r.features[k]))])});
const report={passed:matches&&s.complete&&overlap===0,sourceReportSha256:Head.sha(fs.readFileSync(reportFile,'utf8')),modelSha256:loaded.sha256,
  result:Object.fromEntries(fields.map(k=>[k,s[k]])),expected,controls,overlap,after3200:summary(tail),last10Seconds:summary(rows.slice(-100)),
  last:{...rows.at(-1),observation:undefined},boundary:'Actual Node24 native from-line telemetry of the learned champion, no pose/time/route/expert action as controller input; diagnosis does not alter the physics, objective or original save.'};
fs.writeFileSync(path.join(out,'actual-trace.json'),JSON.stringify(rows));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('STALL_DIAGNOSIS '+JSON.stringify(report));if(!report.passed)process.exitCode=1;
