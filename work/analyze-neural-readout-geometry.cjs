'use strict';

// Analysis of observed recurrent features only. No action is installed in a car.
const fs=require('node:fs'),crypto=require('node:crypto');
const arg=key=>process.argv.find(value=>value.startsWith(key+'='))?.slice(key.length+1);
const input=arg('--input'),output=arg('--output');
if(!input||!output)throw Error('Specify --input=<replay.json> and a new --output=<summary.json>.');
const raw=fs.readFileSync(input),replay=JSON.parse(raw),p=replay.readoutProbe;
if(!p||!Array.isArray(p.weights)||!replay.trace?.length||!(p.featureNorm>0)||p.readoutStride!==3)throw Error('A recorded decoder7 readout inspection is required.');
const frames=replay.trace.filter(frame=>frame.features?.length>0&&frame.features.every(Number.isFinite));
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0),norm=v=>Math.sqrt(dot(v,v));
const vector=features=>[...features.map(value=>value*p.featureNorm),1];
const project=(v,basis)=>{
  const result=v.slice();
  for(let pass=0;pass<2;pass++)for(const b of basis){const d=dot(result,b);for(let j=0;j<result.length;j++)result[j]-=d*b[j];}
  return result;
};
const firstAt=metres=>frames.find(frame=>frame.progress>=metres)||frames.at(-1);
const protectedFrames=[100,300,500,650].map(firstAt),basis=[];
for(const frame of protectedFrames){const row=project(vector(frame.features),basis),length=norm(row);if(length>1e-8)basis.push(row.map(value=>value/length));}
const steeringWeights=Array.from({length:frames[0].features.length},(_,j)=>p.weights[p.readoutOffset+j*p.readoutStride]);steeringWeights.push(p.weights[p.biasOffset]);
const targets=[700,750,780,790,798].map(metres=>{
  const frame=firstAt(metres),v=vector(frame.features),residual=project(v,basis),length=norm(residual);
  const anchorError=Math.max(0,...basis.map(b=>Math.abs(dot(residual,b))));
  if(anchorError>1e-8)throw Error('Context projection lost orthogonality.');
  // A hypothetical 0.1 preactivation change measures expressiveness. It does
  // not prescribe a turn or run a counterfactual physical trajectory.
  const delta=length>1e-12?residual.map(value=>value*.1/(length*length)):null;
  let boundedScale=1;
  if(delta)for(let j=0;j<delta.length;j++)if(delta[j])boundedScale=Math.min(boundedScale,(8-Math.abs(steeringWeights[j]))/Math.abs(delta[j]));
  return {requestedProgress:metres,observedProgress:frame.progress,speedKmh:frame.speedKmh,steering:frame.steering,frontSensor:frame.sensors[3],residualNorm:length,minWeightL2ForLogitDeltaPoint1:delta?norm(delta):null,maximumBoundedDelta:delta ? 0.1*Math.max(0,boundedScale) : 0,anchorOrthogonalityError:anchorError};
});
const centres=p.experience?.centres||[],dominant=centres.slice().sort((a,b)=>b.count-a.count)[0];
let memory=null;
if(dominant){
  const anchor=vector(dominant.values),length=norm(anchor),unit=anchor.map(value=>value/length);
  memory={samples:p.experience.samples,centres:centres.length,counts:centres.map(c=>c.count),contrasts:centres.map(c=>({count:c.count,residualNorm:norm(project(vector(c.values),[unit]))})),frontierResidualNorm:norm(project(vector(firstAt(790).features),[unit]))};
}
const summary={format:'male-cns-observed-readout-geometry-v1',sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),frames:frames.length,features:frames[0].features.length,protectedProgress:protectedFrames.map(f=>f.progress),protectedRank:basis.length,targets,memory,terminal:replay.terminal,gpu:replay.gpu,inputIntegrity:replay.inputIntegrity,limits:'Single observed V3/Monza policy. Linear readout geometry only; no weight update, prescribed action, teacher trajectory or proof of driving improvement.'};
fs.writeFileSync(output,JSON.stringify(summary,null,2),{flag:'wx'});
console.log(JSON.stringify({output,targets,memory}));
