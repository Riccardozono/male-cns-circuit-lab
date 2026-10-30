'use strict';
// A distinct private save protocol for the changed reward revision. The
// original state-head format remains readable only by its original copy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Base=require('./neural-statehead-cuda-save.cjs');
const {Archive}=require('./neural-statehead-brake-lock-archive.cjs');
const Overlay=require('./neural-statehead-brake-lock-overlay.cjs');
const root=path.resolve(__dirname,'..');
const FORMAT='male-cns-private-neuronal-statehead-brake-lock-save';
const PROTOCOL='neuronal-statehead-cuda-brake-lock-v1';
const BASE_REVISION='progress-5-crash-safety-experiment';
const REVISION=Overlay.REVISION;
const REPORT='.impeccable/review/learning-ml/statehead-brake-lock-cuda-20261020/report.json';
const SOURCES=['work/neural-statehead-brake-lock-main.cjs','work/neural-statehead-brake-lock-coordinator.cjs',
  'work/neural-statehead-brake-lock-worker.cjs','work/neural-statehead-brake-lock-save.cjs','work/neural-statehead-brake-lock-archive.cjs',
  'work/neural-statehead-brake-lock-ui.js','work/neural-statehead-brake-lock-overlay.cjs',
  'outputs/rewards.js','.impeccable/experimental-penalty5/outputs/rewards.js',REPORT];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function identity(){
  const extras=SOURCES.map(file=>{const full=path.resolve(root,file);if(!fs.existsSync(full))throw Error('Brake-lock private engine source missing: '+file);return [file,sha(fs.readFileSync(full))];});
  return sha(JSON.stringify({base:Base.identity(),protocol:PROTOCOL,rewardRevision:REVISION,extras}));
}
function withoutRewardDirectedContext(raw){
  const state=structuredClone(raw),archive=state?.archive;
  if(archive?.champion)delete archive.champion.rewardDirectedContext;
  for(const cell of archive?.cells||[])delete cell.rewardDirectedContext;
  return state;
}
function toBaseState(raw){
  const state=withoutRewardDirectedContext(raw);
  if(!Array.isArray(state?.history)||state.history.some(h=>h.rewardRevision!==REVISION))
    throw Error('Salvataggio non appartenente alla revisione anti-freno-bloccato.');
  for(const row of state.history)row.rewardRevision=BASE_REVISION;
  return state;
}
function validateState(raw,dimensions){
  const state=structuredClone(raw);
  if(!Array.isArray(state?.history)||state.history.some(h=>h.rewardRevision!==REVISION))
    throw Error('Storico privo della revisione di ricompensa anti-freno-bloccato.');
  const archive=Archive.restore(state.archive);
  const checked=Base.validateState(toBaseState(state),dimensions);
  checked.history=state.history;checked.archive=archive.snapshot();
  return checked;
}
function encode(modelText,state){
  const checked=validateState(state,require('./neural-statehead-cuda-model.cjs').parse(modelText).data.weights.length);
  const legacy=JSON.parse(Base.encode(modelText,toBaseState(checked)));
  const payload=JSON.parse(legacy.payloadJson);
  payload.protocol=PROTOCOL;payload.engineIdentity=identity();payload.rewardRevision=REVISION;payload.state=checked;
  const payloadJson=JSON.stringify(payload);
  if(Buffer.byteLength(payloadJson)>32*1024*1024)throw Error('Salvataggio state-head brake-lock troppo grande.');
  return JSON.stringify({format:FORMAT,schema:1,payloadJson,sha256:sha(payloadJson)});
}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>40*1024*1024)throw Error('File privato brake-lock non valido o troppo grande.');
  const envelope=JSON.parse(text);
  if(envelope.format!==FORMAT||envelope.schema!==1||typeof envelope.payloadJson!=='string'||sha(envelope.payloadJson)!==envelope.sha256)
    throw Error('Formato/checksum errato: seleziona un file della copia anti-freno-bloccato.');
  const payload=JSON.parse(envelope.payloadJson);
  if(payload.appVersion!=='5.6.0'||payload.protocol!==PROTOCOL||payload.rewardRevision!==REVISION||
     payload.numericRuntime!=='24.19.0'||payload.engineIdentity!==identity()||typeof payload.modelText!=='string'||
     payload.modelSha256!==sha(payload.modelText))
    throw Error('Il file richiede la stessa copia DEV 5.6.0 e la stessa revisione della ricompensa.');
  const model=require('./neural-statehead-cuda-model.cjs').parse(payload.modelText);
  const state=validateState(payload.state,model.data.weights.length);
  const legacyPayload={...payload,protocol:'neuronal-statehead-cuda-from-line-v1',engineIdentity:Base.identity(),state:toBaseState(state)};
  delete legacyPayload.rewardRevision;
  const payloadJson=JSON.stringify(legacyPayload);
  const legacy=Base.parse(JSON.stringify({format:'male-cns-private-neuronal-statehead-cuda-save',schema:1,payloadJson,sha256:sha(payloadJson)}));
  return {...legacy,...payload,state};
}
async function materialize(parsed,directory){
  const safe=parse(encode(parsed.modelText,parsed.state));
  return Base.materialize({...safe,state:toBaseState(safe.state)},directory);
}
module.exports={FORMAT,PROTOCOL,REVISION,identity,validateState,encode,parse,materialize,toBaseState};
