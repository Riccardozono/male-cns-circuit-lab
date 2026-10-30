'use strict';
// Dedicated private file; no pose, action tape, practice checkpoint or normal
// .malecns-save import. A restored generation restarts physically at the line.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-grown-model.cjs'),{Archive}=require('./neural-grown-archive.cjs');
const root=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sources=['work/neural-grown-save.cjs','work/neural-grown-coordinator.cjs','work/neural-grown-worker.cjs','work/neural-grown-native-arena.cjs','work/neural-grown-archive.cjs','work/neural-grown-model.cjs','work/neural-frontier-model.cjs','work/neural-context-live.cjs','work/neural-context-stack.cjs','work/neural-context-readout.cjs','work/neural-json-head.cjs','work/exact-coo.cjs','work/exact-dense.cjs','.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/neural-learning.js','.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js','outputs/legacy-models.js','outputs/simulation.js','outputs/data/circuits.json','outputs/data/connectome.json'];
sources.push('work/neural-retained-features.cjs','work/preflight-grown-model.cjs');
function identity(){return sha(JSON.stringify(sources.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])));}
const bounded=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max,integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function validateState(raw,dimensions){
  const s=structuredClone(raw),fail=()=>{throw Error('Stato privato incompatibile o incompleto. Usa un file creato dalla stessa copia sperimentale.');};
  const only=(object,keys)=>object&&typeof object==='object'&&Object.keys(object).every(k=>keys.includes(k));
  if(!only(s,['population','mutation','speedMultiplier','randomState','generation','history','completedEpisodes','updates','previousLapTime','archive','entries']))fail();
  if(!s||!integer(s.population,4,100)||!bounded(s.mutation,0,.35)||!bounded(s.speedMultiplier,.5,30)||!integer(s.randomState,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)||!integer(s.generation,1,Number.MAX_SAFE_INTEGER)||!integer(s.updates,0,Number.MAX_SAFE_INTEGER)||s.generation!==s.updates+1||!integer(s.completedEpisodes,s.updates*4,s.updates*100)||!(s.previousLapTime===null||bounded(s.previousLapTime,Number.MIN_VALUE,1000000)))fail();
  if(!integer(dimensions,2,24)||!Array.isArray(s.entries)||s.entries.length!==s.population||s.entries.some((r,id)=>!only(r,['id','weights'])||r.id!==id||!Array.isArray(r.weights)||r.weights.length!==dimensions||r.weights.some(v=>!bounded(v,-8,8))))fail();
  if(!Array.isArray(s.history)||s.history.length!==Math.min(100,s.updates))fail();
  for(let i=0;i<s.history.length;i++){
    const h=s.history[i];if(!only(h,['generation','best','mean','bestProgress','meanProgress','maxLaps','laps','bestLapTime','elapsed','actualEpisodes','genesHash','rewardRevision'])||h.generation!==s.generation-s.history.length+i||!integer(h.actualEpisodes,4,100)||![h.best,h.mean,h.bestProgress,h.meanProgress,h.elapsed].every(Number.isFinite)||!bounded(h.bestProgress,0,12000)||!bounded(h.meanProgress,0,h.bestProgress)||!integer(h.maxLaps,0,2)||!integer(h.laps,0,h.maxLaps)||!bounded(h.elapsed,0,1000000)||!(h.bestLapTime===null||bounded(h.bestLapTime,Number.MIN_VALUE,1000000))||!/^[0-9a-f]{64}$/.test(h.genesHash)||h.rewardRevision!=='progress-5-crash-safety-experiment')fail();
  }
  if(!only(s.archive,['dimensions','binMetres','maxProgress','population','evaluations','champion','cells'])||!Array.isArray(s.archive.cells))fail();
  for(const r of [...s.archive.cells,s.archive.champion])if(!only(r,['key','weights','fitness','baseFitness','progress','laps','reason','censored','overlap','lapTimes','comparisonPenalty']))fail();
  const archive=Archive.restore(s.archive);if(archive.dimensions!==dimensions||archive.population!==s.population)fail();
  for(const r of [...archive.cells.values(),archive.champion]){if(!Number.isFinite(r.baseFitness??r.fitness)||!Array.isArray(r.lapTimes||[])||(r.lapTimes||[]).length!==r.laps||(r.lapTimes||[]).some(v=>!bounded(v,Number.MIN_VALUE,1000000)))fail();}
  return s;
}
function encode(modelText,state){
  const parsed=Model.parse(modelText);
  const payloadJson=JSON.stringify({appVersion:'5.6.0',protocol:'grown-from-line-v1',numericRuntime:'24.19.0',engineIdentity:identity(),modelSha256:sha(modelText),modelText,state:validateState(state,parsed.data.stages.at(-1).weights.length)});
  if(Buffer.byteLength(payloadJson)>32*1024*1024)throw Error('File privato troppo grande');
  return JSON.stringify({format:'male-cns-private-grown-learning-save',schema:1,payloadJson,sha256:sha(payloadJson)});
}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>40*1024*1024)throw Error('File privato non valido o troppo grande');
  const e=JSON.parse(text);if(e.format!=='male-cns-private-grown-learning-save'||e.schema!==1||typeof e.payloadJson!=='string'||sha(e.payloadJson)!==e.sha256)throw Error('Formato o checksum del salvataggio privato non valido');
  const p=JSON.parse(e.payloadJson);if(p.appVersion!=='5.6.0'||p.protocol!=='grown-from-line-v1'||p.numericRuntime!=='24.19.0'||p.engineIdentity!==identity()||typeof p.modelText!=='string'||p.modelSha256!==sha(p.modelText))throw Error('Questo file richiede la stessa copia sperimentale. I salvataggi normali e native-v1 non sono compatibili.');
  const model=Model.parse(p.modelText);return {...p,state:validateState(p.state,model.data.stages.at(-1).weights.length)};
}
async function materialize(parsed,directory){
  // The numeric decoder is part of the shareable file, not the current warm start.
  const safe=parse(encode(parsed.modelText,parsed.state)),file=path.join(directory,safe.modelSha256+'.json');
  await fs.promises.mkdir(directory,{recursive:true});
  try{await fs.promises.writeFile(file,safe.modelText,{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(sha(await fs.promises.readFile(file,'utf8'))!==safe.modelSha256)throw Error('Modello memorizzato non corrispondente al checksum');}
  // Electron has a different Node version: preflight in the pinned numerical
  // runtime before the active coordinator is interrupted.
  await require('node:util').promisify(require('node:child_process').execFile)(path.join(root,'.impeccable/runtime-node24/node.exe'),[path.join(__dirname,'preflight-grown-model.cjs'),file],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:8192});
  return file;
}
module.exports={encode,parse,identity,validateState,materialize};
