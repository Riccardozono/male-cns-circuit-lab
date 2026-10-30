'use strict';
// Attenuate only the experimental residual; the verified MaleCNS motor output
// remains untouched. Uses measured vehicle physics, never track position.
const revision='g-slip-clearance-attenuation-v2';
const envelope=(value,soft,hard)=>value<=soft?1:value>=hard?0:1-(value-soft)/(hard-soft);
const clearance=(value,soft,hard)=>value>=soft?1:value<=hard?0:(value-hard)/(soft-hard);
function scale(car){
  if(!car||![car.lateralG,car.slipAngle,car.totalG,car.longitudinalG].every(Number.isFinite)||!Array.isArray(car.inputs)||car.inputs.length<7||car.inputs.some(v=>!Number.isFinite(v))||!Array.isArray(car.physicsInputs)||car.physicsInputs.length<17||car.physicsInputs.some(v=>!Number.isFinite(v)))return 0;
  const nearestSide=Math.min(car.inputs[1],car.inputs[2],car.inputs[4],car.inputs[5]);
  return Math.min(
    envelope(Math.abs(car.lateralG),1,1.5),
    envelope(Math.abs(car.slipAngle),.07,.14),
    envelope(car.totalG,1.5,2),
    envelope(Math.abs(car.longitudinalG),1.5,2.2),
    clearance(nearestSide,.28,.07),
    clearance(car.inputs[3],.1,.015),
    envelope(Math.abs(car.physicsInputs[7]),.35,.85)
  );
}
module.exports={revision,scale};
