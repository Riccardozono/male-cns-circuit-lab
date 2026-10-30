'use strict';
// Reachability calculation on actual neuronal states only. Extremal diagnostic
// values are NEVER applied to a car or inserted into a training replay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),at=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function interval(row,axis,{allowWholeResidual=false}={}){
  const o=row.observation,a=row.inference.old,g=row.inference.gate,amplitude=Math.min(1,Math.hypot(o[512]*2,o[513]*2)*5),centre=at(o[514+axis])+2*amplitude*a[axis];
  // Retained authority is not recorded in this sampled diagnostic. Bound it
  // optimistically between current amplitude and its mathematical maximum1.
  // Exclusions in this OUTER range hold for any physically possible authority.
  const extremes=[amplitude,1].flatMap(authority=>[-1,1].map(q=>{
    const residual=allowWholeResidual?q:Math.tanh(at(a[2+axis])+g*q*(axis===0?1:2));return Math.tanh(centre+2*authority*residual);
  }));return [Math.min(...extremes),Math.max(...extremes)];
}
const records=[];
for(const mode of ['baseline','sac-final']){
  const file=path.join(base,'projected-sensory-information',mode+'.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.collectionRevision!=='precontrol-aligned-v2')throw Error('Actual aligned data required');
  const rows=data.rows.filter(r=>Math.abs(r.inference.gate-1)<1e-12),details=rows.map(row=>({seconds:row.seconds,progress:row.progress,steering:interval(row,0),longitudinal:interval(row,1),wholeResidualSteering:interval(row,0,{allowWholeResidual:true}),wholeResidualLongitudinal:interval(row,1,{allowWholeResidual:true})}));
  records.push({mode,sourceSha256:sha(fs.readFileSync(file)),fullyActivatedControls:rows.length,
    oldBoundedCorrector:{cannotReachNeutralSteer:details.filter(r=>r.steering[0]>0||r.steering[1]<0).length,cannotReleaseThrottle:details.filter(r=>r.longitudinal[0]>0).length,cannotReachHalfBrake:details.filter(r=>r.longitudinal[0]>-.5).length,cannotReleaseBrake:details.filter(r=>r.longitudinal[1]<0).length},
    unconstrainedOldResidualOuterRange:{cannotReachNeutralSteer:details.filter(r=>r.wholeResidualSteering[0]>0||r.wholeResidualSteering[1]<0).length,cannotReleaseThrottle:details.filter(r=>r.wholeResidualLongitudinal[0]>0).length,cannotReleaseBrake:details.filter(r=>r.wholeResidualLongitudinal[1]<0).length},
    examples:details.filter(r=>r.longitudinal[0]>.5||r.steering[0]>.2||r.steering[1]<-.2).slice(0,6)});
}
const out=path.join(base,'command-authority-audit');fs.mkdirSync(out,{recursive:true});const report={completed:true,sourceSha256:sha(fs.readFileSync(__filename)),records,
  boundary:'Instantaneous optimistic actuator reachability of the NEW bounded SAC residual on actual states, not a proof of the cause of every learning failure or a physical brake defect. Full old residual bounds are shown separately: the frozen parent/Windows projected18 model is not claimed to have this same restriction. No route, target controls, counterfactual trajectory or invented training example. Only contexts within1e-12of full activation are counted; protected-prefix limits are excluded.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('COMMAND_AUTHORITY_AUDIT '+JSON.stringify(report));
