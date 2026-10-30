'use strict';
// Create a research-only copy whose state gate learns from actual mid-episode
// MaleCNS activity instead of being muted for 97% of the recorded episode.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Context=require('./neural-context-readout.cjs');

async function main(){
  const arg=process.argv.find(value=>value.startsWith('--output='));
  if(!arg)throw Error('An explicit new --output directory is required');
  const out=path.resolve(arg.slice('--output='.length));
  const option=(name,fallback)=>{const value=process.argv.find(item=>item.startsWith(`--${name}=`));return value?value.slice(name.length+3):fallback;};
  const protectedFraction=Number(option('protected-fraction','0.35'));
  const limit=Number(option('centres','12'));
  const radiusRatio=Number(option('radius-ratio','0.95'));
  if(!Number.isFinite(protectedFraction)||protectedFraction<.1||protectedFraction>=.8||!Number.isInteger(limit)||limit<3||limit>12||!Number.isFinite(radiusRatio)||radiusRatio<.5||radiusRatio>=1)throw Error('Use protected fraction 0.1–0.8, 3–12 centers and radius ratio 0.5–1');
  if(await fsp.stat(out).then(()=>true,()=>false))throw Error('Preserve existing research output; choose a new directory');
  const preparedPath=path.resolve('.impeccable/review/neural-sacl/neuronal-clean-6584-statehead-prepared/prepared.json');
  const prepared=JSON.parse(await fsp.readFile(preparedPath,'utf8'));
  const selected=Model.defaultChoice(),clean=Model.parse(await fsp.readFile(selected.file,'utf8'));
  if(prepared.parentSha256!==clean.data.parentSha256||prepared.sourceControls!==clean.data.basis.sourceObservationCount)throw Error('Observed source trace must match the selected model parent and control count');
  const trace=await fsp.readFile(prepared.sourceTrajectoryFile),dimensions=530,neurons=516;
  if(trace.byteLength!==prepared.sourceControls*dimensions*8)throw Error('Actual source trajectory size does not match its recorded control count');
  const values=new Float64Array(trace.buffer,trace.byteOffset,trace.byteLength/8),row=index=>values.subarray(index*dimensions,index*dimensions+neurons),scales=clean.data.basis.scales;
  const protectedCount=Math.floor(prepared.sourceControls*protectedFraction),centres=[],firstAnchor=protectedCount+32,lastAnchor=prepared.sourceControls-1;
  if(firstAnchor>=lastAnchor)throw Error('No actual observed context remains after the protected prefix');
  for(let k=0;k<limit;k++){
    const index=Math.round(firstAnchor+(lastAnchor-firstAnchor)*k/(limit-1)),values=Array.from(row(index));let exactEarly=Infinity;
    for(let prefix=0;prefix<protectedCount;prefix++)exactEarly=Math.min(exactEarly,Context.distance(values,row(prefix),scales));
    if(!Number.isFinite(exactEarly)||exactEarly<=1e-9)throw Error('Actual uniform context has no exact protected-prefix separation');
    centres.push({values,radius:exactEarly*radiusRatio,sourceControl:index,minimumPrefixDistance:exactEarly});
  }
  const basis={scales:scales.slice(),centres,protectedCount,sourceObservationCount:prepared.sourceControls};
  let firstActivatedControl=null,maximumGate=0,activatedControls=0;
  for(let index=0;index<prepared.sourceControls;index++){
    const gate=Math.max(...centres.map(centre=>Context.feature(row(index),centre,basis.scales)));
    if(gate>0){activatedControls++;maximumGate=Math.max(maximumGate,gate);if(firstActivatedControl===null)firstActivatedControl=index;}
    if(index<protectedCount&&gate!==0)throw Error('New observed-neural gate leaked into the protected prefix');
  }
  const firstLapControl=Math.floor(prepared.sourceFullResult.lapTimes[0]/.1);
  if(firstActivatedControl===null||firstActivatedControl>=firstLapControl)throw Error('The actual-neural gate still starts after the first physical lap');
  const data={...clean.data,status:'research-unverified',basis,provenance:{...clean.data.provenance,parentCleanModelSha256:selected.modelSha256,sourceParentTrajectorySha256:crypto.createHash('sha256').update(trace).digest('hex'),earlyGateRevision:'observed-neural-gate-uniform-mid-episode-v1',protectedFraction,gateRadiusRatio:radiusRatio,gateFirstActivatedControl:firstActivatedControl,firstLapControl,sourceResultAppliesOnlyToFrozenParent:true}};
  const payloadJson=JSON.stringify(data),text=JSON.stringify({format:'male-cns-neuronal-state-head-envelope',schema:1,payloadJson,sha256:crypto.createHash('sha256').update(payloadJson).digest('hex')}),parsed=Model.parse(text,{allowResearch:true});
  if(parsed.data.status!=='research-unverified'||parsed.data.basis.protectedCount!==protectedCount)throw Error('Research-only model serialization failed closed');
  await fsp.mkdir(out,{recursive:false});
  const modelFile=path.join(out,'statehead-early-gate-research-only.malecns-statehead.json');
  await fsp.writeFile(modelFile,text,{flag:'wx'});
  const report={passed:true,modelFile,modelSha256:crypto.createHash('sha256').update(text).digest('hex'),parentCleanModelSha256:selected.modelSha256,parentSha256:clean.data.parentSha256,sourceTrajectorySha256:crypto.createHash('sha256').update(trace).digest('hex'),sourceControls:prepared.sourceControls,protectedCount,protectedFraction:protectedCount/prepared.sourceControls,radiusRatio,firstActivatedControl,firstActivatedSimulatedSeconds:firstActivatedControl*.1,firstLapControl,firstLapSeconds:prepared.sourceFullResult.lapTimes[0],activatedSourceControls:activatedControls,activationCoverage:activatedControls/prepared.sourceControls,maximumObservedGate:maximumGate,centres:centres.map(({values:_,...centre})=>centre),sourceResult:{bestProgress:prepared.sourceFullResult.bestProgress,laps:prepared.sourceFullResult.laps,lapTimes:prepared.sourceFullResult.lapTimes},status:'research-unverified',interpretation:'Gate centres come from the actual source MaleCNS neuronal trajectory. The first protected prefix receives exactly zero correction; activation is verified before the measured first lap. This is only a candidate preparation, not a driving improvement.'};
  await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_EARLY_GATE_PREPARED '+JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
