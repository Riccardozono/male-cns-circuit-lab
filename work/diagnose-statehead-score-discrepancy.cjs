'use strict';
// Diagnostic-only parity run: same verified parent, weights, reward overlay,
// and physical controls through direct and arena scheduling paths.
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Overlay=require('./neural-statehead-brake-lock-overlay.cjs');
const Arena=require('./neural-statehead-cuda-arena.cjs');
const selected=Model.defaultChoice();
const loaded=Model.load(selected.file);
const weights=loaded.data.weights.slice();
const direct=Overlay.attach(Model.createFromLoaded(loaded,{weights,id:0,previousLapTime:null}));
const create=Model.createFromLoaded;
Model.createFromLoaded=function(...args){return Overlay.attach(create.apply(this,args));};
const arena=Arena.create(loaded,[{id:0,weights}],{previousLapTime:null});
const trace=crypto.createHash('sha256');
let controls=0;
function carSummary(car){return {fitness:car.fitness,baseFitness:car.baseFitness,reward:car.reward,
  penalty:car.penalty,rewardBreakdown:structuredClone(car.rewardBreakdown),rewardState:structuredClone(car.rewardState),
  lapRegressionPenalty:car.lapRegressionPenalty,previousGenerationLapTime:car.previousGenerationLapTime,
  laps:car.laps,lapTimes:car.lapTimes.slice(),progress:car.progress,bestProgress:car.bestProgress,
  reason:car.reason,alive:car.alive};}
try{
  while(controls<12000&&!direct.state().complete&&!arena.complete()){
    const directState=direct.step();arena.stepOne();controls++;
    trace.update(JSON.stringify([directState.bestProgress,directState.totalSimulationSeconds,directState.car.outputs])+'\n');
  }
  const state=direct.state(),result=arena.results()[0],directCar=direct.currentCar(),arenaCar=arena.agents[0].env.currentCar();
  console.log(JSON.stringify({format:'male-cns-statehead-score-parity-v1',controls,
    direct:{state:{fitness:state.fitness,progress:state.bestProgress,laps:state.laps,reason:state.reason,
      seconds:state.totalSimulationSeconds,complete:state.complete},car:carSummary(directCar),overlay:direct.brakeLockSnapshot()},
    arena:{result,car:carSummary(arenaCar),overlay:arena.agents[0].env.brakeLockSnapshot()},
    sameDirectVsArenaTrace:directCar.bestProgress===arenaCar.bestProgress&&directCar.laps===arenaCar.laps&&
      directCar.lifetime===arenaCar.lifetime&&JSON.stringify(directCar.outputs)===JSON.stringify(arenaCar.outputs),
    expectedTraceSha256:selected.actionTraceSha256,directTraceSha256:trace.digest('hex')},null,2));
}finally{Model.closeCuda();}
