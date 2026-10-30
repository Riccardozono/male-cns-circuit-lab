'use strict';
// Dedicated private file; no pose, action tape, practice checkpoint or normal
// .malecns-save import. A restored generation restarts physically at the line.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-frontier-model.cjs'),{Archive}=require('./neural-native-archive.cjs');
const root=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sources=['work/neural-native-save.cjs','work/neural-native-coordinator.cjs','work/neural-native-worker.cjs','work/neural-native-arena.cjs','work/neural-native-archive.cjs','work/neural-frontier-model.cjs','work/neural-context-live.cjs','work/neural-context-stack.cjs','work/neural-context-readout.cjs','work/neural-json-head.cjs','work/exact-coo.cjs','work/exact-dense.cjs','.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/neural-learning.js','.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js','outputs/legacy-models.js','outputs/simulation.js','outputs/data/circuits.json','outputs/data/connectome.json'];
function identity(){return sha(JSON.stringify(sources.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])));}
const bounded=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max,integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function validateState(raw){
  const s=structuredClone(raw),fail=()=>{throw Error('Stato privato incompatibile o incompleto. Usa un file creato dalla stessa copia sperimentale.');};
  const only=(object,keys)=>object&&typeof object==='object'&&Object.keys(object).every(k=>keys.includes(k));
  if(!only(s,['population','mutation','speedMultiplier','randomState','generation','history','completedEpisodes','updates','previousLapTime','archive','entries']))fail();
  if(!s||!integer(s.population,4,100)||!bounded(s.mutation,0,.35)||!bounded(s.speedMultiplier,.5,30)||!integer(s.randomState,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)||!integer(s.generation,1,Number.MAX_SAFE_INTEGER)||!integer(s.updates,0,Number.MAX_SAFE_INTEGER)||s.generation!==s.updates+1||!integer(s.completedEpisodes,s.updates*4,s.updates*100)||!(s.previousLapTime===null||bounded(s.previousLapTime,Number.MIN_VALUE,1000000)))fail();
  if(!Array.isArray(s.entries)||s.entries.length!==s.population||s.entries.some((r,id)=>!only(r,['id','weights'])||r.id!==id||!Array.isArray(r.weights)||r.weights.length!==10||r.weights.some(v=>!bounded(v,-8,8))))fail();
  if(!Array.isArray(s.history)||s.history.length!==Math.min(100,s.updates))fail();
  for(let i=0;i<s.history.length;i++){
    const h=s.history[i];if(!only(h,['generation','best','mean','bestProgress','meanProgress','maxLaps','laps','bestLapTime','elapsed','actualEpisodes','genesHash','rewardRevision'])||h.generation!==s.generation-s.history.length+i||!integer(h.actualEpisodes,4,100)||![h.best,h.mean,h.bestProgress,h.meanProgress,h.elapsed].every(Number.isFinite)||!bounded(h.bestProgress,0,12000)||!bounded(h.meanProgress,0,h.bestProgress)||!integer(h.maxLaps,0,2)||!integer(h.laps,0,h.maxLaps)||!bounded(h.elapsed,0,1000000)||!(h.bestLapTime===null||bounded(h.bestLapTime,Number.MIN_VALUE,1000000))||!/^[0-9a-f]{64}$/.test(h.genesHash)||h.rewardRevision!=='progress-5-crash-safety-experiment')fail();
  }
  if(!only(s.archive,['dimensions','binMetres','maxProgress','population','evaluations','champion','cells'])||!Array.isArray(s.archive.cells))fail();
  for(const r of [...s.archive.cells,s.archive.champion])if(!only(r,['key','weights','fitness','baseFitness','progress','laps','reason','censored','overlap','lapTimes','comparisonPenalty']))fail();
  const archive=Archive.restore(s.archive);if(archive.dimensions!==10||archive.population!==s.population)fail();
  for(const r of [...archive.cells.values(),archive.champion]){if(!Number.isFinite(r.baseFitness??r.fitness)||!Array.isArray(r.lapTimes||[])||(r.lapTimes||[]).length!==r.laps||(r.lapTimes||[]).some(v=>!bounded(v,Number.MIN_VALUE,1000000)))fail();}
  return s;
}
function encode(modelText,state){
  const parsed=Model.parse(modelText);if(parsed.data.decoderRevision!=='learned-projected-frontier-v2')throw Error('Decoder di allenamento privato richiesto');
  const payloadJson=JSON.stringify({appVersion:'5.6.0',protocol:'native-from-line-v1',numericRuntime:'24.19.0',engineIdentity:identity(),modelSha256:sha(modelText),modelText,state:validateState(state)});
  if(Buffer.byteLength(payloadJson)>32*1024*1024)throw Error('File privato troppo grande');
  return JSON.stringify({format:'male-cns-private-native-learning-save',schema:1,payloadJson,sha256:sha(payloadJson)});
}
function parse(text,expectedModelSha256){
  if(typeof text!=='string'||Buffer.byteLength(text)>40*1024*1024)throw Error('File privato non valido o troppo grande');
  const e=JSON.parse(text);if(e.format!=='male-cns-private-native-learning-save'||e.schema!==1||typeof e.payloadJson!=='string'||sha(e.payloadJson)!==e.sha256)throw Error('Formato o checksum del salvataggio privato non valido');
  const p=JSON.parse(e.payloadJson);if(p.appVersion!=='5.6.0'||p.protocol!=='native-from-line-v1'||p.numericRuntime!=='24.19.0'||p.engineIdentity!==identity()||p.modelSha256!==sha(p.modelText)||p.modelSha256!==expectedModelSha256)throw Error('Questo file richiede la stessa copia sperimentale e lo stesso modello. Il salvataggio normale non è compatibile.');
  const model=Model.parse(p.modelText);if(model.data.decoderRevision!=='learned-projected-frontier-v2')throw Error('Decoder privato incompatibile');return {...p,state:validateState(p.state)};
}
module.exports={encode,parse,identity,validateState};
