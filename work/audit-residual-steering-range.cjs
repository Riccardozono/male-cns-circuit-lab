'use strict';
const fs=require('node:fs'),path=require('node:path'),F=require('../.impeccable/experimental-penalty5/outputs/simulation.js');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.impeccable/review/neural-sacl/frontier-1990/actual-trace.json'),rows=JSON.parse(fs.readFileSync(file,'utf8'));
const row=rows.at(-1),atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v))),gain=2*Math.min(1,Math.hypot(...row.memory)*5);
const interval=scale=>[-1,1].map(delta=>{
  const extra=Math.tanh(atanh(row.action[2])+2*delta*scale),command=Math.tanh(atanh(row.oldMotor[0])+gain*row.action[0]+2*row.authority*extra),angle=command*.58;
  return {delta,command,steadyWheelAngle:angle,lowSpeedKinematicRadiusM:Math.abs(F.Vehicle.SPEC.wheelbaseM/Math.tan(angle))};
});
const report={actualObservationAtProgress:row.progress,oldExperimentalResidual:interval(.05),fullRangeExperimentalResidual:interval(.5),physicalFullLockRadiusM:F.Vehicle.SPEC.wheelbaseM/Math.tan(.58),
  boundary:'Reachable steering envelope calculation at an actually observed neural state. Low-speed kinematic estimate, not a measured corner radius or dynamic turning test. Diagnostic delta values are not expert training actions or applied vehicle controls.'};
const dir=path.join(root,'.impeccable/review/neural-sacl/steering-range-audit');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log('STEERING_RANGE_AUDIT '+JSON.stringify(report));
