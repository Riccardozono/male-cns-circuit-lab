'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),
  data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json'),{fullRollout,outcome}=require('./practice-full-rollout.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-fine-motor-heading-probe-20261024-01');if(fs.existsSync(out))throw Error('Preserve previous heading probe');
  const fineDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-fine-motor-10gen-20261024-01'),fine=JSON.parse(fs.readFileSync(path.join(fineDir,'report.json'),'utf8')),
    radiusDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-motor-radius-screen-20261024-01'),radius=JSON.parse(fs.readFileSync(path.join(radiusDir,'report.json'),'utf8')),
    raw=fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'),original=await P.decode(raw.toString('utf8'),'5.6.0'),
    checkpointBytes=fs.readFileSync(path.join(fineDir,fine.checkpoint.filename)),checkpoint=await P.decode(checkpointBytes.toString('utf8'),'5.6.0');
  if(!fine.passed||!radius.passed||sha(raw)!==fine.save.sha256||sha(checkpointBytes)!==fine.checkpoint.sha256)throw Error('Verified input reports/checkpoints required');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:1,circuitId:'monza',circuits,seed:7717});
  P.validatePayload(checkpoint.payload,{graph:sim.graph,circuits:sim.circuits});
  P.restore(sim,checkpoint.payload.workers[0].state);
  const independentRestoreExact=JSON.stringify(P.capture(sim))===JSON.stringify(checkpoint.payload.workers[0].state);
  if(!independentRestoreExact)throw Error('Copied checkpoint independent restore differs');
  const trainedHash=fine.rows.at(-1).leader.genomeSha256,trained=checkpoint.payload.workers[0].state.genomes.find(g=>sha(JSON.stringify(g))===trainedHash);
  if(!trained)throw Error('Evaluated safe leader missing from copied checkpoint');
  const radiusGenome=JSON.parse(fs.readFileSync(path.join(radiusDir,'candidate.private.json'),'utf8')).genome;
  if(sha(JSON.stringify(radiusGenome))!==radius.bestCase.genomeSha256)throw Error('Radius candidate identity mismatch');
  const models=[{id:'original-gen64',genome:original.payload.workers[0].state.genomes[3],expected:fine.control.perGeneration[0].leader},
    {id:'radius-candidate',genome:radiusGenome,expected:radius.confirmation},
    {id:'fine-trained',genome:trained,expected:fine.rows.at(-1).leader}],offsets=[-.002,-.001,0,.001,.002],results=[],started=Date.now();
  const sources=Object.fromEntries(['outputs/simulation.js','outputs/neural-learning.js','outputs/vehicle-992.js','outputs/rewards.js','work/practice-full-rollout.cjs'].map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
  for(const model of models)for(const offset of offsets){
    const api={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=offset;return car;}},
      replay=fullRollout(api,sim.track,sim.graph,model.genome,{rewardRevision:'progress-3',maxTicks:60000}),r={model:model.id,headingOffsetRad:offset,...outcome(F,replay),progressM:replay.car.bestProgress/(sim.track.pixelsPerMeter||1)};
    if(offset===0&&(r.progressM!==model.expected.progressM||r.fitness!==model.expected.fitness||r.reason!==model.expected.reason))throw Error('Zero-offset physical identity failed: '+model.id);
    results.push(r);console.log('HEADING_PROBE '+JSON.stringify({model:model.id,offset,progressM:r.progressM,safe:r.safe,laps:r.laps}));
  }
  const summaries=models.map(model=>{const rows=results.filter(x=>x.model===model.id),zero=rows.find(x=>x.headingOffsetRad===0);return {model:model.id,baselineM:zero.progressM,
    safe:rows.filter(x=>x.safe).length,cases:rows.length,minProgressM:Math.min(...rows.map(x=>x.progressM)),maxProgressM:Math.max(...rows.map(x=>x.progressM)),
    minProgressRatio:Math.min(...rows.map(x=>x.progressM))/zero.progressM,maxLaps:Math.max(...rows.map(x=>x.laps))};});
  const sourceStable=Object.entries(sources).every(([f,h])=>sha(fs.readFileSync(path.join(root,f)))===h),saveUnchanged=sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'))===sha(raw),
    report={format:'fine-motor-heading-probe-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:sourceStable&&saveUnchanged,
      learningSucceeded:results.some(x=>x.safe&&x.laps>=2),settings:{offsetsRad:offsets,allOtherInitialConditions:'unchanged',maxTicks:60000},
      method:'Natural full episodes under five initial heading offsets for the original, screened and trained genotypes. Neural inference, sensors, reward, road and vehicle physics are unchanged; no teacher or route action is applied.',
      results,summaries,integrity:{sourceStable,saveUnchanged,independentRestoreExact,sources,checkpointSha256:sha(checkpointBytes),fineReportSha256:sha(fs.readFileSync(path.join(fineDir,'report.json')))},
      wallSeconds:(Date.now()-started)/1000,boundary:'A small deterministic perturbation probe, not a general robustness proof or an alternative to completing two laps.'};
  if(!report.passed)throw Error('Probe integrity failed');fs.mkdirSync(out,{recursive:false});const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2),{flag:'wx'});
  fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));console.log('HEADING_RESULT '+JSON.stringify({passed:report.passed,summaries,saveUnchanged,sourceStable,independentRestoreExact,report:target,sha256:sha(fs.readFileSync(target))}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
