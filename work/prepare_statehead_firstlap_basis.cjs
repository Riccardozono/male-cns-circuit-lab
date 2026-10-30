'use strict';
// Build a research-only local support basis from actual early-lap neural inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Context=require('./neural-context-readout.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-firstlap-gated-basis-20261026-27');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function atomic(file,value){const tmp=file+'.pending';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{encoding:'utf8'});fs.renameSync(tmp,file);}
fs.mkdirSync(out,{recursive:false});
const traceFile=path.join(root,'.impeccable/review/learning-ml/statehead-gatefloor-first-divergence-20261026-23/trace-gate-0-001.private.json');
const modelFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json');
const trace=JSON.parse(fs.readFileSync(traceFile,'utf8')),envelope=JSON.parse(fs.readFileSync(modelFile,'utf8')),data=JSON.parse(envelope.payloadJson);
if(sha(Buffer.from(envelope.payloadJson))!==envelope.sha256||trace.gateFloor!==.001)throw Error('Pinned input trace or selected model identity mismatch');
const selected=trace.rows.filter(r=>r.before.bestProgress>=650&&r.before.bestProgress<=900);
const observations=selected.map(r=>r.control.neuralInputVector);
if(observations.length<100||observations.some(v=>!Array.isArray(v)||v.length!==516))throw Error('Actual 516-value observations in the target window are required');
const protectedFraction=.55,basis=Context.grow(observations,{limit:6,protectedFraction});
const activations=selected.map(r=>basis.centres.map(c=>Context.feature(r.control.neuralInputVector,c,basis.scales)));
const gate=activations.map(v=>Math.max(...v)),active=selected.map((r,i)=>({progress:r.before.bestProgress,gate:gate[i]})).filter(v=>v.gate>0);
const centres=basis.centres.map(c=>({radius:c.radius,sourceProgress:selected.find(r=>JSON.stringify(r.control.neuralInputVector)===JSON.stringify(c.values))?.before.bestProgress??null}));
const basisFile=path.join(out,'basis.private.json');atomic(basisFile,basis);
const report={format:'private-statehead-firstlap-gate-basis-preparation-v1',passed:true,learningSucceeded:false,approvedForApp:false,
  selectedModelSha256:sha(fs.readFileSync(modelFile)),traceFile:path.relative(root,traceFile).replaceAll(path.sep,'/'),traceSha256:sha(fs.readFileSync(traceFile)),
  selectedProgressWindow:[650,900],sourceObservations:observations.length,protectedFraction,protectedCount:basis.protectedCount,centreCount:basis.centres.length,centres,
  prefixGateActiveCount:gate.slice(0,basis.protectedCount).filter(v=>v>0).length,windowGateActiveCount:active.length,
  gateActivationProgress:active.length?[Math.min(...active.map(v=>v.progress)),Math.max(...active.map(v=>v.progress))]:null,
  maximumWindowGate:Math.max(...gate),basisFile:path.relative(root,basisFile).replaceAll(path.sep,'/'),basisFileSha256:sha(fs.readFileSync(basisFile)),
  provenance:{trainerSource:'actual 516-value decoder inputs recorded on a deterministic physical trace',noRouteOrClockInputs:true,initialCorrectionsMustBeZero:true},
  originalSaveSha256:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',boundary:'Preparation and held-window support audit only; no policy update, physical evaluation, app change, or promotion.'};
atomic(path.join(out,'report.json'),report);atomic(path.join(out,'progress.json'),{phase:'finished',passed:true});
process.stdout.write(JSON.stringify(report));
