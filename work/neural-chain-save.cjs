'use strict';
// Dedicated private file; no pose, action tape, practice checkpoint or normal
// .malecns-save import. A restored generation restarts physically at the line.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-chain-desktop-model.cjs'),{Archive}=require('./neural-chain-archive.cjs');
const root=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sources=['work/neural-chain-main.cjs','work/neural-chain-save.cjs','work/neural-chain-coordinator.cjs','work/neural-chain-worker.cjs','work/neural-chain-arena.cjs','work/neural-chain-archive.cjs','work/neural-chain-desktop-model.cjs','work/preflight-chain-model.cjs','work/neural-chain-ui.js','work/neural-chain-index.html','work/neural-grown-preload.cjs','work/neural-grown-app.js','outputs/styles.css','outputs/ui-theme.js','outputs/desktop-runtime.js','outputs/desktop-state.js','outputs/brain-atlas.js','outputs/session-ui.js','outputs/circuit-3d.mjs','outputs/car-3d.mjs','outputs/supplied-car-3d.mjs','outputs/track-renderer.js','outputs/terrain.js','outputs/data/terrain.js','outputs/legacy-models.js','outputs/data/circuits.json','outputs/data/connectome.json','.impeccable/runtime-node24/node.exe'];
function sourceFiles(){
  // Include the complete local static-require closure, not only the older
  // model's shorter fingerprint: vehicle, physical terrain and decoder helpers
  // must participate too. Dynamic worker/renderer entries are explicit above.
  const seen=new Set(),visit=file=>{const full=path.resolve(root,file),relative=path.relative(root,full).replaceAll('\\','/');if(relative.startsWith('../')||path.isAbsolute(relative))throw Error('Local engine sources required');if(seen.has(relative))return;seen.add(relative);
    if(!/\.(?:cjs|js|mjs)$/.test(full))return;const text=fs.readFileSync(full,'utf8');for(const m of text.matchAll(/\brequire\(\s*(['"])(\.[^'"]+)\1\s*\)/g)){const dependency=require.resolve(path.resolve(path.dirname(full),m[2]));visit(path.relative(root,dependency));}};
  sources.forEach(visit);return [...seen].sort();
}
function identity(){return sha(JSON.stringify(sourceFiles().map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])));}
const bounded=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max,integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function validateState(raw,dimensions){
  const s=structuredClone(raw),fail=()=>{throw Error('Stato privato incompatibile o incompleto. Usa un file creato dalla stessa copia sperimentale.');};
  const only=(object,keys)=>object&&typeof object==='object'&&Object.keys(object).every(k=>keys.includes(k));
  if(!only(s,['population','mutation','speedMultiplier','randomState','generation','history','completedEpisodes','updates','previousLapTime','archive','entries']))fail();
  if(!s||!integer(s.population,4,100)||!bounded(s.mutation,0,.35)||!bounded(s.speedMultiplier,.5,30)||!integer(s.randomState,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)||!integer(s.generation,1,Number.MAX_SAFE_INTEGER)||!integer(s.updates,0,Number.MAX_SAFE_INTEGER)||s.generation!==s.updates+1||!integer(s.completedEpisodes,s.updates*4,s.updates*100)||!(s.previousLapTime===null||bounded(s.previousLapTime,Number.MIN_VALUE,1000000)))fail();
  if(dimensions!==2||!Array.isArray(s.entries)||s.entries.length!==s.population||s.entries.some((r,id)=>!only(r,['id','weights'])||r.id!==id||!Array.isArray(r.weights)||r.weights.length!==dimensions||r.weights.some(v=>!bounded(v,-8,8))))fail();
  if(!Array.isArray(s.history)||s.history.length!==Math.min(100,s.updates))fail();
  for(let i=0;i<s.history.length;i++){
    const h=s.history[i];if(!only(h,['generation','best','mean','bestProgress','meanProgress','maxLaps','laps','bestLapTime','elapsed','actualEpisodes','genesHash','rewardRevision'])||h.generation!==s.generation-s.history.length+i||!integer(h.actualEpisodes,4,100)||![h.best,h.mean,h.bestProgress,h.meanProgress,h.elapsed].every(Number.isFinite)||!bounded(h.bestProgress,0,12000)||!bounded(h.meanProgress,0,h.bestProgress)||!integer(h.maxLaps,0,2)||!integer(h.laps,0,h.maxLaps)||!bounded(h.elapsed,0,1000000)||!(h.bestLapTime===null||bounded(h.bestLapTime,Number.MIN_VALUE,1000000))||!/^[0-9a-f]{64}$/.test(h.genesHash)||h.rewardRevision!=='progress-5-crash-safety-experiment')fail();
  }
  if(!only(s.archive,['dimensions','binMetres','maxProgress','population','evaluations','champion','cells'])||!Array.isArray(s.archive.cells))fail();
  for(const r of [...s.archive.cells,s.archive.champion])if(!only(r,['key','weights','fitness','baseFitness','progress','laps','reason','censored','overlap','lapTimes','comparisonPenalty']))fail();
  const archive=Archive.restore(s.archive);if(archive.dimensions!==dimensions||archive.population!==s.population||archive.evaluations!==s.completedEpisodes+1||archive.binMetres!==25||archive.maxProgress!==11586.000000259404||s.previousLapTime!==(s.history.at(-1)?.bestLapTime??null))fail();
  for(const r of [...archive.cells.values(),archive.champion]){if(!Number.isFinite(r.baseFitness??r.fitness)||!Array.isArray(r.lapTimes||[])||(r.lapTimes||[]).length!==r.laps||(r.lapTimes||[]).some(v=>!bounded(v,Number.MIN_VALUE,1000000)))fail();}
  return s;
}
function encode(modelText,state){
  const parsed=Model.parse(modelText);
  const payloadJson=JSON.stringify({appVersion:'5.6.0',protocol:'neuronal-chain-from-line-v1',numericRuntime:'24.19.0',engineIdentity:identity(),modelSha256:sha(modelText),modelText,state:validateState(state,parsed.data.weights.length)});
  if(Buffer.byteLength(payloadJson)>32*1024*1024)throw Error('File privato troppo grande');
  return JSON.stringify({format:'male-cns-private-neuronal-chain-save',schema:1,payloadJson,sha256:sha(payloadJson)});
}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>40*1024*1024)throw Error('File privato non valido o troppo grande');
  const e=JSON.parse(text);if(e.format!=='male-cns-private-neuronal-chain-save'||e.schema!==1||typeof e.payloadJson!=='string'||sha(e.payloadJson)!==e.sha256)throw Error('Formato o checksum non valido: usa un file .malecns-chain-dev creato da questa copia.');
  const p=JSON.parse(e.payloadJson);if(p.appVersion!=='5.6.0'||p.protocol!=='neuronal-chain-from-line-v1'||p.numericRuntime!=='24.19.0'||p.engineIdentity!==identity()||typeof p.modelText!=='string'||p.modelSha256!==sha(p.modelText))throw Error('Questo file richiede lo stesso motore neurale sperimentale. Salvataggi standard, native-v1, grown e proiezioni18 restano separati.');
  const model=Model.parse(p.modelText);return {...p,state:validateState(p.state,model.data.weights.length)};
}
async function materialize(parsed,directory){
  // The numeric decoder is part of the shareable file, not the current warm start.
  const safe=parse(encode(parsed.modelText,parsed.state)),file=path.join(directory,safe.modelSha256+'.json');
  await fs.promises.mkdir(directory,{recursive:true});
  try{await fs.promises.writeFile(file,safe.modelText,{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(sha(await fs.promises.readFile(file,'utf8'))!==safe.modelSha256)throw Error('Modello memorizzato non corrispondente al checksum');}
  // Electron has a different Node version: preflight in the pinned numerical
  // runtime before the active coordinator is interrupted.
  await require('node:util').promisify(require('node:child_process').execFile)(path.join(root,'.impeccable/runtime-node24/node.exe'),[path.join(__dirname,'preflight-chain-model.cjs'),file],{cwd:root,windowsHide:true,timeout:200000,maxBuffer:8192});
  return file;
}
module.exports={encode,parse,identity,sourceFiles,validateState,materialize};
