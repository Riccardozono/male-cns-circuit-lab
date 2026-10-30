'use strict';
// Grow from a fresh actual parent episode, never from a route/action example.
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks'),Model=require('./neural-grown-model.cjs'),Context=require('./neural-context-readout.cjs'),Head=require('./neural-json-head.cjs');
const cfg=JSON.parse(process.argv[2]),out=path.resolve(cfg.out),parent=Model.load(path.resolve(cfg.parentModelFile));
if(fs.existsSync(path.join(out,'prepared.json')))throw Error('Preserve existing preparation');fs.mkdirSync(out,{recursive:true});
const limit=cfg.centres??6,fraction=cfg.protectedFraction??.8;
if(!Number.isInteger(limit)||limit<1||limit>12||!Number.isFinite(fraction)||fraction<.5||fraction>=.95)throw Error('Bounded observed growth configuration required');
const env=Model.createFromLoaded(parent),rows=[],started=performance.now();let s=env.state(),overlap=0;
while(!s.complete){
  if(performance.now()-started>180000)throw Error('Parent replay exceeded wall-clock budget; no partial episode accepted');
  const observation=s.observation.slice();s=env.step();overlap+=Number(s.car.outputs[1]>0&&s.car.outputs[2]>0);
  rows.push({observation,progress:s.bestProgress,seconds:s.totalSimulationSeconds,outputs:s.car.outputs.slice(),speedKmh:s.car.vehicle.speedMps*3.6,fitness:s.fitness,reason:s.reason});
}
const fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
if(overlap||!fields.every(k=>s[k]===parent.data.verifiedFullResult[k]))throw Error('Actual parent result differs from independently verified model');
const observations=rows.map(r=>r.observation),sampled=observations.filter((_,i)=>i%4===0),basis=Context.grow(sampled,{limit,protectedFraction:fraction}),protectedCount=Math.floor(observations.length*fraction),prefix=observations.slice(0,protectedCount);
for(const c of basis.centres)c.radius=.75*Math.min(...prefix.map(row=>Context.distance(row,c.values,basis.scales)));
if(prefix.some(row=>basis.centres.some(c=>Context.feature(row,c,basis.scales)!==0)))throw Error('Full observed prefix not protected');
const firstActiveControl=observations.findIndex(row=>basis.centres.some(c=>Context.feature(row,c,basis.scales)>0));
if(firstActiveControl<protectedCount)throw Error('Observed activation preceded protected prefix');
basis.protectedCount=protectedCount;basis.sourceObservationCount=observations.length;
const traceText=JSON.stringify(rows);fs.writeFileSync(path.join(out,'parent-actual-trace.json'),traceText);
const prepared={format:'male-cns-observed-grown-basis',schema:1,basis,parentModelFile:path.resolve(cfg.parentModelFile),parentModelSha256:parent.sha256,
  parentResult:Object.fromEntries(fields.map(k=>[k,s[k]])),parentStages:parent.data.stages.length,sourceTraceSha256:Head.sha(traceText),firstActiveControl,
  maxProgress:env.track.total*2,scorePixelsPerMeter:env.track.pixelsPerMeter||1,wallSeconds:(performance.now()-started)/1000,
  boundary:'New compact artificial features from an actual full parent episode. Chronology protects observed training states only; runtime activation is neural distance, not location/time. No teacher/recorded action/body input, unchanged biological graph/physics/rewards.'};
fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(prepared,null,2));console.log('GROWTH_PREPARED '+JSON.stringify({centres:basis.centres.length,protectedCount,firstActiveControl,parent:prepared.parentResult,wallSeconds:prepared.wallSeconds}));
