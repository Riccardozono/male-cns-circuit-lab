'use strict';
// Training-only critic signals. NEVER append these to a native driving model.
const clamp=v=>Math.max(-1,Math.min(1,Number.isFinite(v)?v:0));
const labels=[...Array.from({length:28},(_,i)=>'actual-sensor-'+i),'since-progress','since-pace-window','pace-progress-delta','actual-progress','lap-count','checkpoint-count','elapsed','lap-elapsed'];
function features(car){
  if(car.sensorVector?.length!==28||car.sensorVector.some(v=>!Number.isFinite(v)))throw Error('Actual28sensor physical state required for critic');
  const r=car.rewardState||{},t=car.lifetime||0;
  return car.sensorVector.map(clamp).concat([
    clamp((t-(car.lastProgressTime||0))/16),clamp((t-(r.paceTime||0))/16),clamp(((car.progress||0)-(r.paceProgress||0))/100),
    clamp((car.bestProgress||0)/12000),clamp((car.laps||0)/2),clamp(((r.nextCheckpoint||1)-1)/128),clamp(t/2000),clamp((t-(car.lastLapStartTime||0))/2000)
  ]);
}
module.exports={features,labels,ACTOR_DIMENSIONS:521,CRITIC_DIMENSIONS:557};
