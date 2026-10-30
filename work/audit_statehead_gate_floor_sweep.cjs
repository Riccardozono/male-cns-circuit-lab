'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const output=path.join(ROOT,'.impeccable/review/learning-ml/statehead-gate-floor-sweep-20261026-09');
fs.mkdirSync(output,{recursive:false});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const fileHash=file=>sha(fs.readFileSync(file));
const sourceReport=path.join(ROOT,'.impeccable/review/learning-ml/statehead-reward-cuda4-safegate-20261026-04/report.json');
const baselineReport=JSON.parse(fs.readFileSync(sourceReport,'utf8'));
const savedFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expectedSaveSha256='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const Motor=require('./neural-command-residual.cjs');
const Model=require('./neural-statehead-cuda-model.cjs');
let gateFloor=0,activeFloor=null,trace=[];
const nativeCompose=Motor.compose;
Motor.compose=(prior,gate,residual)=>{
  const applied=gateFloor>0&&gate===0?gateFloor:gate;
  const result=nativeCompose(prior,applied,residual);
  if(activeFloor!==null&&gate===0&&trace.length<20)trace.push({gate,appliedGate:applied,prior:prior.slice(),residual:residual.slice(),result:result.slice()});
  return result;
};
const Env=require('./statehead-reward-env.cjs');
const started=Date.now();let env=null;const runs=[];
function progress(phase,extra={}){const row={phase,elapsedSeconds:(Date.now()-started)/1000,...extra};fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(row,null,2));process.stdout.write('STATEHEAD_GATE_SWEEP '+JSON.stringify(row)+'\n');}
try{
  env=Env.create();
  const meta=env.metadata();
  if(meta.parentSha256!=='5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35')throw Error('Unexpected protected parent');
  if(JSON.stringify(meta.baseline.observed)!==JSON.stringify(meta.originalExpected))throw Error('Protected parent replay differs');
  progress('environment-ready',{parentSha256:meta.parentSha256,baseline:meta.baseline});
  for(const floor of [0,.001,.0025,.005,.01]){
    gateFloor=floor;activeFloor=floor;trace=[];
    const result=env.evaluate(baselineReport.finalResearchWeights);
    if(floor===0&&JSON.stringify(result)!==JSON.stringify(baselineReport.finalResearchFullResult))throw Error('Zero-floor current policy did not reproduce the protected comparison');
    const row={gateFloor:floor,result,zeroGateCommandSamples:trace};runs.push(row);
    progress('replay-finished',{gateFloor:floor,result,zeroGateCommandSamples:trace});
  }
  const saveSha256=fileHash(savedFile);
  if(saveSha256!==expectedSaveSha256||saveSha256!==baselineReport.originalSaveSha256)throw Error('Original save checksum changed');
  const report={format:'private-statehead-gate-floor-sweep-v1',passed:true,learningSucceeded:false,approvedForApp:false,
    sourceReportSha256:fileHash(sourceReport),originalSaveSha256:saveSha256,appVersion:require('../package.json').version,parentSha256:meta.parentSha256,
    testedGateFloors:[0,.001,.0025,.005,.01],runs,cuda:env.stats(),wallSeconds:(Date.now()-started)/1000,
    sourceHashes:{runner:fileHash(__filename),environment:fileHash(path.join(__dirname,'statehead-reward-env.cjs')),
      stateHead:fileHash(path.join(__dirname,'neural-statehead.cjs')),motor:fileHash(path.join(__dirname,'neural-command-residual.cjs'))},
    boundary:'Research-only deterministic replay of the same frozen weights, from the start, at four fixed gate floors. This is a sensitivity diagnostic, not training or proof of learning. No route, pose, desired action or teacher data. No app/source promotion, save mutation, package, commit, tag or release.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  progress('finished',{passed:true,results:runs.map(({gateFloor,result})=>({gateFloor,result}))});
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),runs},null,2));throw error;}
finally{activeFloor=null;if(env)Model.closeCuda();}
