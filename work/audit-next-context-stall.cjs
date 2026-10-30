'use strict';
// Read-only observation of a real complete drive; never a source of actions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Native=require('./neural-next-instant-native.cjs'),Core=require('./neural-instant-context.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),dir=path.join(base,'neuronal-next-instant256-first'),out=path.join(dir,'stall-observation.json');
if(fs.existsSync(out))throw Error('Preserve existing diagnostic');
try{
 const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8')),p=JSON.parse(fs.readFileSync(report.identity.preparedFile,'utf8')),parent=JSON.parse(JSON.parse(fs.readFileSync(report.identity.originFile,'utf8')).payloadJson),old=JSON.parse(parent.preparedText);
 assert(report.passed&&report.bestClean&&report.eligibleForIndependentNativeProof);
 const env=Native.create({modelFile:p.modelFile,preparedFile:report.identity.preparedFile,weights:report.bestClean.genes}),trace=crypto.createHash('sha256'),last=[];let state=env.state(),controls=0,active=0,positive=0,braking=0;
 while(!state.complete){
  const row={control:controls,progress:state.bestProgress,speed:state.car.speed,oldFeatures:Core.features(state.observation,old.basis),newFeatures:Core.features(state.observation,p.basis)};
  state=env.step();controls++;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');row.commands=state.car.outputs.slice();
  if(row.newFeatures.some(v=>v>0)){active++;positive+=Number(row.commands[1]>0);braking+=Number(row.commands[2]>0);}
  last.push(row);if(last.length>80)last.shift();
 }
 assert.equal(trace.digest('hex'),report.bestClean.episode.actionTraceSha256);
 const r=report.bestClean.episode.result;for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'])assert.deepEqual(state[k],r[k]);
 const proof={passed:true,reportSha256:I.sha(fs.readFileSync(path.join(dir,'report.json'))),controls,activeNewContextControls:active,positivePedalDuringNewSupport:positive,brakingPedalDuringNewSupport:braking,lastControls:last,result:Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'].map(k=>[k,state[k]])),cuda:Native.stats(),sourceHashes:I.collect(['work/audit-next-context-stall.cjs','work/neural-next-instant-native.cjs']),boundary:'Actual observed features and commands only. Does not prove the cause of a stall, physical obstruction or that a different action would improve it. No command override or training target.'};
 fs.writeFileSync(out,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,controls,active,positive,braking,last:last.at(-1),result:proof.result}));
}finally{Native.close();}
