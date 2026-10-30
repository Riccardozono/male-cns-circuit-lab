'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const output=path.join(ROOT,'.impeccable/review/learning-ml/statehead-gatefloor-repeatability-20261026-11');
fs.mkdirSync(output,{recursive:false});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const trainDir=path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-20261026-10');
const training=JSON.parse(fs.readFileSync(path.join(trainDir,'report.json'),'utf8'));
const identity=JSON.parse(fs.readFileSync(path.join(trainDir,'identity.json'),'utf8'));
const previous=JSON.parse(fs.readFileSync(path.join(ROOT,'.impeccable/review/learning-ml/statehead-gate-floor-sweep-20261026-09/report.json'),'utf8'));
const sourceCheckpoint=JSON.parse(fs.readFileSync(path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-mixed-context-20261026-05/checkpoint.private.json'),'utf8'));
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expectedSave='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const Model=require('./neural-statehead-cuda-model.cjs'),Env=require('./statehead-reward-gate-env.cjs');
const started=Date.now();let env=null;const runs=[];
function progress(phase,extra={}){const p={phase,elapsedSeconds:(Date.now()-started)/1000,...extra};fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(p,null,2));process.stdout.write('STATEHEAD_GATE_REPEAT '+JSON.stringify(p)+'\n');}
try{
  env=Env.create();const meta=env.metadata();
  if(meta.parentSha256!=='5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35')throw Error('Unexpected protected parent');
  const cases=[
    {name:'starting-accepted-weights',weights:sourceCheckpoint.currentWeights,priorResults:[...previous.runs.filter(r=>r.gateFloor===.001).map(r=>r.result),identity.initialGateFloorResult]},
    {name:'trained-best-weights',weights:training.bestFull.weights,priorResults:[training.bestFull.result]}
  ];
  progress('environment-ready',{baseline:meta.baseline.observed,originalSaveSha256:hash(save)});
  for(const item of cases){
    for(let repetition=1;repetition<=3;repetition++){
      const result=env.evaluate(item.weights,{gateFloor:.001});const row={name:item.name,repetition,gateFloor:.001,result};runs.push(row);
      progress('replay-finished',row);
    }
  }
  const saveSha256=hash(save);if(saveSha256!==expectedSave)throw Error('Original save checksum changed');
  const compact=Object.fromEntries(cases.map(item=>[item.name,runs.filter(r=>r.name===item.name).map(r=>({progress:r.result.bestProgress,laps:r.result.laps,reason:r.result.reason,simSeconds:r.result.totalSimulationSeconds}))]));
  const report={format:'private-statehead-gatefloor-repeatability-v1',passed:true,learningSucceeded:false,approvedForApp:false,
    appVersion:require('../package.json').version,gateFloor:.001,sourceTrainingReportSha256:hash(path.join(trainDir,'report.json')),
    sourceSweepReportSha256:hash(path.join(ROOT,'.impeccable/review/learning-ml/statehead-gate-floor-sweep-20261026-09/report.json')),
    originalSaveSha256:saveSha256,parentSha256:meta.parentSha256,results:compact,runs,cuda:env.stats(),wallSeconds:(Date.now()-started)/1000,
    sourceHashes:{runner:hash(__filename),environment:hash(path.join(__dirname,'statehead-reward-gate-env.cjs')),
      stateHead:hash(path.join(__dirname,'neural-statehead-gate.cjs')),motor:hash(path.join(__dirname,'neural-command-residual.cjs'))},
    boundary:'Research-only repeated from-line evaluation of the same weights and gate floor. Measures physical replay repeatability; no learning updates, app/source promotion, save mutation, package, commit, tag or release.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));progress('finished',{passed:true,results:compact});
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),runs},null,2));throw error;}
finally{if(env)Model.closeCuda();}
