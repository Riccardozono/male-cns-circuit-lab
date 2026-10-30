'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const output=path.join(ROOT,'.impeccable/review/learning-ml/statehead-gatefloor-best-fraction-20261026-14');
fs.mkdirSync(output,{recursive:false});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),hash=file=>sha(fs.readFileSync(file));
const sourceDir=path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-20261026-12');
const training=JSON.parse(fs.readFileSync(path.join(sourceDir,'report.json'),'utf8'));
const selected=training.events.find(e=>e.update===6).candidates.find(c=>c.fraction===.03);
if(!selected?.surrogateEligible)throw Error('Expected PPO-screen-eligible update6 fraction0.03');
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expectedSave='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const Model=require('./neural-statehead-cuda-model.cjs'),Env=require('./statehead-reward-gate-env.cjs');
const started=Date.now();let env=null;const runs=[];
function progress(phase,extra={}){const p={phase,elapsedSeconds:(Date.now()-started)/1000,...extra};fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(p,null,2));process.stdout.write('STATEHEAD_BEST_FRACTION '+JSON.stringify(p)+'\n');}
try{
  env=Env.create();const meta=env.metadata();if(meta.parentSha256!=='5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35')throw Error('Unexpected protected parent');
  for(let repetition=1;repetition<=2;repetition++){
    const result=env.evaluate(selected.weights,{gateFloor:.001});const row={update:6,fraction:.03,repetition,result,expected:repetition===1?JSON.parse(fs.readFileSync(path.join(ROOT,'.impeccable/review/learning-ml/statehead-gatefloor-candidate-fractions-20261026-13/report.json'),'utf8')).results.find(r=>r.update===6&&r.fraction===.03).result:null};
    runs.push(row);progress('candidate-replay',row);
  }
  if(JSON.stringify(runs[0].result)!==JSON.stringify(runs[1].result))throw Error('Candidate physical replay is not repeatable');
  const saveSha256=hash(save);if(saveSha256!==expectedSave)throw Error('Original save checksum changed');
  const report={format:'private-statehead-gatefloor-best-fraction-v1',passed:true,learningSucceeded:false,approvedForApp:false,
    appVersion:require('../package.json').version,gateFloor:.001,sourceTrainingReportSha256:hash(path.join(sourceDir,'report.json')),
    candidateUpdate:6,candidateFraction:.03,candidateWeights:selected.weights,candidateExploration:selected.exploration,screen:selected.screen,
    originalSaveSha256:saveSha256,parentSha256:meta.parentSha256,runs,cuda:env.stats(),wallSeconds:(Date.now()-started)/1000,
    sourceHashes:{runner:hash(__filename),environment:hash(path.join(__dirname,'statehead-reward-gate-env.cjs')),
      stateHead:hash(path.join(__dirname,'neural-statehead-gate.cjs')),motor:hash(path.join(__dirname,'neural-command-residual.cjs'))},
    boundary:'Research-only repeated deterministic physical proof for one previously eligible PPO candidate. No new learning update, app/source promotion, save mutation, package, commit, tag or release.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));progress('finished',{passed:true,result:runs[0].result});
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),runs},null,2));throw error;}
finally{if(env)Model.closeCuda();}
