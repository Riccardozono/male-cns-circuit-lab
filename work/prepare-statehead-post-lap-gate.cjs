'use strict';
// Build a research-only gate that is exactly silent through the measured first lap.
// The gate is derived from the actual recorded V3 parent trajectory, not a route.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Core=require('./neural-statehead-model.cjs');
const Context=require('./neural-context-readout.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use pinned Node 24.19.0');
  const option=(name,fallback)=>{const arg=process.argv.find(value=>value.startsWith(`--${name}=`));return arg?arg.slice(name.length+3):fallback;};
  const protectedFraction=Number(option('protected-fraction','0.876'));
  const radiusRatio=Number(option('radius-ratio','0.95'));
  const motorCorrectionGain=Number(option('motor-gain','0.2'));
  const physicsSafety=option('physics-safety','false')==='true';
  const limit=Number(option('centres','12'));
  const output=path.resolve(option('output','.impeccable/review/neural-sacl/statehead-cuda-post-lap-gate-20261019-01'));
  if(!Number.isFinite(protectedFraction)||protectedFraction<.85||protectedFraction>=.99||!Number.isFinite(radiusRatio)||radiusRatio<.5||radiusRatio>=1||!Number.isInteger(limit)||limit<3||limit>12||![.2,.02].includes(motorCorrectionGain)||physicsSafety&&motorCorrectionGain!==.2)throw Error('Use protected fraction 0.85–0.99, radius 0.5–1, 3–12 centres, and motor gain 0.2 or 0.02; physics safety requires gain 0.2');
  if(await fs.stat(output).then(()=>true,()=>false))throw Error('Choose a new output folder; previous research evidence is preserved');
  const preparedPath=path.resolve('.impeccable/review/neural-sacl/neuronal-clean-6584-statehead-prepared/prepared.json'),prepared=JSON.parse(await fs.readFile(preparedPath,'utf8'));
  const selected=Model.defaultChoice(),clean=Model.parse(await fs.readFile(selected.file,'utf8'));
  if(prepared.parentSha256!==clean.data.parentSha256||prepared.sourceControls!==clean.data.basis.sourceObservationCount)throw Error('Recorded neural activity must match the verified model parent and controls');
  const trace=await fs.readFile(prepared.sourceTrajectoryFile),dimensions=530,neurons=516;
  if(trace.byteLength!==prepared.sourceControls*dimensions*8)throw Error('Source trace size does not match its recorded controls');
  const values=new Float64Array(trace.buffer,trace.byteOffset,trace.byteLength/8),row=index=>values.subarray(index*dimensions,index*dimensions+neurons),scales=clean.data.basis.scales;
  const firstLapControl=Math.floor(prepared.sourceFullResult.lapTimes[0]/.1),protectedCount=Math.max(Math.floor(prepared.sourceControls*protectedFraction),firstLapControl+1),firstAnchor=protectedCount+32,lastAnchor=prepared.sourceControls-1;
  if(firstAnchor>=lastAnchor)throw Error('Not enough measured post-lap neuronal trajectory remains for this gate');
  const centres=[];
  for(let k=0;k<limit;k++){
    const sourceControl=Math.round(firstAnchor+(lastAnchor-firstAnchor)*k/(limit-1)),centre=Array.from(row(sourceControl));let minimumPrefixDistance=Infinity;
    for(let prefix=0;prefix<protectedCount;prefix++)minimumPrefixDistance=Math.min(minimumPrefixDistance,Context.distance(centre,row(prefix),scales));
    if(!Number.isFinite(minimumPrefixDistance)||minimumPrefixDistance<=1e-9)throw Error('A post-lap context cannot be separated from the protected first-lap prefix');
    centres.push({values:centre,radius:minimumPrefixDistance*radiusRatio,sourceControl,minimumPrefixDistance});
  }
  const basis={scales:scales.slice(),centres,protectedCount,sourceObservationCount:prepared.sourceControls};
  let firstActivatedControl=null,activationCoverage=0;
  for(let index=0;index<prepared.sourceControls;index++){
    const gate=Math.max(...centres.map(centre=>Context.feature(row(index),centre,basis.scales)));
    if(gate>0){activationCoverage++;if(firstActivatedControl===null)firstActivatedControl=index;}
    if(index<=firstLapControl&&gate!==0)throw Error('Post-lap gate leaked into the measured first lap');
    if(index<protectedCount&&gate!==0)throw Error('Gate leaked into its explicitly protected source prefix');
  }
  if(firstActivatedControl===null||firstActivatedControl<=firstLapControl)throw Error('Gate must first activate strictly after the measured first lap');
  const earlyGateRevision=physicsSafety?'observed-neural-gate-post-lap-v3-physics-safety':motorCorrectionGain===.2?'observed-neural-gate-post-lap-v1':'observed-neural-gate-post-lap-v2-ultra-low-gain';
  const physicsSafetyRevision=physicsSafety?require('./neural-statehead-cuda-safety.cjs').revision:null;
  const data={...clean.data,status:'research-unverified',basis,provenance:{...clean.data.provenance,parentCleanModelSha256:selected.modelSha256,sourceParentTrajectorySha256:sha(trace),earlyGateRevision,motorCorrectionGain,...(physicsSafetyRevision?{physicsSafety:physicsSafetyRevision}:{}),protectedFraction:protectedCount/prepared.sourceControls,gateRadiusRatio:radiusRatio,gateFirstActivatedControl:firstActivatedControl,firstLapControl,sourceResultAppliesOnlyToFrozenParent:true}};
  const modelText=Core.encode(data),verified=Core.parse(modelText,{allowResearch:true});
  if(verified.data.status!=='research-unverified'||verified.data.provenance.gateFirstActivatedControl<=verified.data.provenance.firstLapControl)throw Error('Research-only post-lap model serialization failed');
  await fs.mkdir(output,{recursive:false});
  const modelFile=path.join(output,`statehead-post-lap-gain-${String(motorCorrectionGain).replace('.','-')}-research-only.malecns-statehead.json`);
  await fs.writeFile(modelFile,modelText,{encoding:'utf8',flag:'wx'});
  const report={passed:true,status:'research-unverified',modelFile,modelSha256:sha(modelText),parentCleanModelSha256:selected.modelSha256,parentSha256:clean.data.parentSha256,sourceTrajectorySha256:sha(trace),sourceControls:prepared.sourceControls,protectedCount,protectedFraction:protectedCount/prepared.sourceControls,firstLapControl,firstLapSeconds:prepared.sourceFullResult.lapTimes[0],firstActivatedControl,firstActivatedSeconds:firstActivatedControl*.1,postLapGateCoverage:activationCoverage,centres:centres.map(({values:_,...centre})=>centre),motorCorrectionGain,physicsSafety:physicsSafetyRevision,baseline:{bestVerifiedV3:selected.expected,researchZeroCorrection:prepared.sourceFullResult},interpretation:'The gate is verified to be exactly zero through the complete measured first lap and first activates afterward. It is based on actual frozen-parent neural activity. The experimental residual is attenuated using measured G forces and slip only when the declared physics safety filter is enabled. Any resulting model remains research-unverified.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_POST_LAP_GATE_PREPARED '+JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
