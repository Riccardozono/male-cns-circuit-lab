'use strict';
// Scoring-only synthetic circle. NOT a controller, training demonstration or
// claim that a neural agent completed a real circuit. No production import.
const R=require('../../rewards.js');
function fixture({total=1000,ppm=1,referenceMps=25,previousLap=null}={}){
  const track={total:total*ppm,pixelsPerMeter:ppm,lapReferenceSpeed:referenceMps*ppm};
  const car={x:0,y:0,speed:0,vehicle:{speedMps:0},alive:true,reason:'',lifetime:0,lastProgressTime:0,
    reward:0,penalty:0,fitness:0,progress:0,bestProgress:0,lastAlong:0,laps:0,lapTimes:[],lastLapStartTime:0,
    lastLapTime:null,bestLapTime:Infinity,lapRegressionPenalty:0,noLapPenalty:0,slipAngle:0};
  R.initialise(track,car,previousLap);let path=0;
  function move(metres,seconds,extra={}){
    const ticks=Math.max(1,Math.ceil(seconds*60)),dt=seconds/ticks,step=metres*ppm/ticks,radius=track.total/(2*Math.PI);
    for(let i=0;i<ticks&&car.alive;i++){
      path+=step;const theta=path/radius;car.x=radius*Math.sin(theta);car.y=radius*(1-Math.cos(theta));
      car.lifetime+=dt;car.speed=car.vehicle.speedMps=Math.abs(step)/dt/ppm;
      R.step(track,car,{along:((path%track.total)+track.total)%track.total,onRoad:true,dt,...extra});
    }
    return car;
  }
  return {track,car,move,end:reason=>R.finish(track,car,reason)};
}
module.exports={fixture};
