'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const output=path.join(ROOT,'.impeccable/review/learning-ml/statehead-gatefloor-candidate-fractions-20261026-13');
fs.mkdirSync(output,{recursive:false});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const sourceDir=path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-20261026-12');
const training=JSON.parse(fs.readFileSync(path.join(sourceDir,'report.json'),'utf8'));
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expectedSave='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const Model=require('./neural-statehead-cuda-model.cjs'),Env=require('./statehead-reward-gate-env.cjs');
const started=Date.now();let env=null;const runs=[];
function rank(r){return [r.laps,r.bestProgress,r.fitness];}
function greater(a,b){const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function progress(phase,extra={}){const p={phase,elapsedSeconds:(Date.now()-started)/1000,...extra};fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(p,null,2));process.stdout.write('STATEHEAD_CANDIDATE_FRACTIONS '+JSON.stringify(p)+'\n');}
try{
  env=Env.create();const meta=env.metadata();
  if(meta.parentSha256!=='5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35')throw Error('Unexpected protected parent');
  const baseline=training.bestFull.result;
  const control=env.evaluate(training.bestFull.weights,{gateFloor:.001});
  if(JSON.stringify(control)!==JSON.stringify(baseline))throw Error('Current gate-floor policy no longer reproduces');
  progress('control-verified',{control});
  for(const event of training.events){
    for(const candidate of event.candidates){
      if(candidate.fraction===1||!candidate.surrogateEligible)continue;
      const result=env.evaluate(candidate.weights,{gateFloor:.001});
      const row={update:event.update,fraction:candidate.fraction,screen:candidate.screen,result,beatsControl:greater(result,control),safe:result.complete&&!['urto','fuori pista','progresso non valido'].includes(result.reason)};
      runs.push(row);progress('candidate-replayed',row);
    }
  }
  const saveSha256=hash(save);if(saveSha256!==expectedSave)throw Error('Original save checksum changed');
  const improvements=runs.filter(r=>r.safe&&r.beatsControl).sort((a,b)=>greater(a.result,b.result)?-1:greater(b.result,a.result)?1:0);
  const report={format:'private-statehead-gatefloor-candidate-fractions-v1',passed:true,learningSucceeded:false,approvedForApp:false,
    appVersion:require('../package.json').version,gateFloor:.001,sourceTrainingReportSha256:hash(path.join(sourceDir,'report.json')),
    originalSaveSha256:saveSha256,parentSha256:meta.parentSha256,control,results:runs,verifiedImprovements:improvements,
    cuda:env.stats(),wallSeconds:(Date.now()-started)/1000,
    sourceHashes:{runner:hash(__filename),environment:hash(path.join(__dirname,'statehead-reward-gate-env.cjs')),
      stateHead:hash(path.join(__dirname,'neural-statehead-gate.cjs')),motor:hash(path.join(__dirname,'neural-command-residual.cjs'))},
    boundary:'Research-only deterministic from-line replay of the PPO-eligible fractions omitted by the original one-candidate proof. No new learning update, app/source promotion, save mutation, package, commit, tag or release.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));progress('finished',{passed:true,control,verifiedImprovements:improvements.map(r=>({update:r.update,fraction:r.fraction,result:r.result}))});
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),runs},null,2));throw error;}
finally{if(env)Model.closeCuda();}
