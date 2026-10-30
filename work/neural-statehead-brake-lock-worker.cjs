'use strict';
// Reuse the verified native worker and arena, adding only the isolated reward
// overlay to each real physical environment before the first episode.
const Model=require('./neural-statehead-cuda-model.cjs');
const Overlay=require('./neural-statehead-brake-lock-overlay.cjs');
const create=Model.createFromLoaded;
Model.createFromLoaded=function(...args){return Overlay.attach(create.apply(this,args));};
const Arena=require('./neural-statehead-cuda-arena.cjs');
const createArena=Arena.create;
Arena.create=function(...args){
  const arena=createArena(...args),results=arena.results;
  arena.results=function(){
    return results.call(this).map((result,index)=>{
      const env=arena.agents[index].env,car=env.currentCar(),lock=env.brakeLockSnapshot(),snapshot=env.stateHeadSnapshot?.();
      const terminalSlow=['troppo lenta / senza progresso','ferma / senza progresso'].includes(result.reason)&&
        Math.abs(car.vehicle?.speedMps??car.speed??0)<2&&Number(car.outputs?.[1])<=.05&&lock.totalPenalty>0&&
        Number.isFinite(snapshot?.gate)&&snapshot.gate>0&&Array.isArray(snapshot.features)&&snapshot.features.length===9;
      return {...result,brakeLockPenalty:lock.totalPenalty,brakeLockSeconds:lock.seconds,brakeLockIntervals:lock.intervals,
        ...(terminalSlow?{terminalSlow:true,terminalContextFeatures:snapshot.features.slice(),terminalGate:snapshot.gate}:{})};
    });
  };
  return arena;
};
require('./neural-statehead-cuda-worker.cjs');
