'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const output=path.join(ROOT,'.impeccable/review/learning-ml/statehead-gate-floor-replay-20261026-08');
fs.mkdirSync(output,{recursive:false});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const fileHash=file=>sha(fs.readFileSync(file));
const baselineReport=JSON.parse(fs.readFileSync(path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-safegate-20261026-04/report.json'),'utf8'));
const expectedMetadata=JSON.parse(fs.readFileSync(path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-safegate-20261026-04/metadata.private.json'),'utf8'));
const sourceWeights=baselineReport.finalResearchWeights;
const reference=baselineReport.finalResearchFullResult;
const savedFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expectedSaveSha256='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const Motor=require('./neural-command-residual.cjs');
const Model=require('./neural-statehead-cuda-model.cjs');
let gateFloor=0;
const nativeCompose=Motor.compose;
Motor.compose=(prior,gate,residual)=>nativeCompose(prior,gateFloor>0&&gate===0?gateFloor:gate,residual);
const Env=require('./statehead-reward-env.cjs');
const started=Date.now();let env=null;const runs=[];
function progress(phase,extra={}){
  const row={phase,elapsedSeconds:(Date.now()-started)/1000,...extra};
  fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(row,null,2));
  process.stdout.write('STATEHEAD_GATE_FLOOR '+JSON.stringify(row)+'\n');
}
try{
  env=Env.create();
  const meta=env.metadata();
  if(meta.parentSha256!==expectedMetadata.parentSha256)throw Error('Unexpected protected state-head parent');
  progress('environment-ready',{parentSha256:meta.parentSha256,baseline:meta.baseline.observed});
  for(const floor of [0,.05]){
    gateFloor=floor;
    const result=env.evaluate(sourceWeights);
    const row={gateFloor:floor,result,safe:result.complete&&!['urto','fuori pista','progresso non valido'].includes(result.reason)};
    runs.push(row);
    progress('replay-finished',{gateFloor:floor,result});
    if(floor===0&&JSON.stringify(result)!==JSON.stringify(reference))throw Error('Zero-floor policy did not reproduce the protected current-policy replay');
  }
  const saveSha256=fileHash(savedFile);
  if(saveSha256!==expectedSaveSha256||saveSha256!==baselineReport.originalSaveSha256)throw Error('Original save checksum changed');
  const report={format:'private-statehead-gate-floor-replay-v1',passed:true,learningSucceeded:false,approvedForApp:false,
    policySourceReportSha256:fileHash(path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-safegate-20261026-04/report.json')),
    originalSaveSha256:saveSha256,appVersion:require('../package.json').version,parentSha256:meta.parentSha256,
    trainerGateFloor:'Use the fixed minimum only when the brain has neuronal activity and the existing radial basis gate is zero; preserve the original gate otherwise.',
    sourceWeights,safePolicyReference:reference,runs,globalProtectedBest:baselineReport.bestFull.result,
    cuda:env.stats(),wallSeconds:(Date.now()-started)/1000,
    sourceHashes:{runner:fileHash(__filename),environment:fileHash(path.join(__dirname,'statehead-reward-env.cjs')),
      stateHead:fileHash(path.join(__dirname,'neural-statehead.cjs')),motor:fileHash(path.join(__dirname,'neural-command-residual.cjs'))},
    boundary:'Research-only deterministic replay. No learning update, app/source promotion, save mutation, package, commit, tag or release. Gate floor applies only when the actual neural signal is present; no route, pose, target action or teacher data.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  progress('finished',{passed:true,results:runs.map(r=>({gateFloor:r.gateFloor,result:r.result}))});
}catch(error){
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),runs},null,2));
  throw error;
}finally{if(env)Model.closeCuda();}
