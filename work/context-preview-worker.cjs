'use strict';
const {parentPort,workerData}=require('node:worker_threads'),{performance}=require('node:perf_hooks'),Live=require('./neural-context-live.cjs');
const port=parentPort||{on:(event,fn)=>process.on(event,fn),postMessage:m=>process.send(m)},configuration=workerData||JSON.parse(process.argv[2]);
const env=(configuration.frontier?require('./neural-frontier-model.cjs'):Live).create(configuration.modelFile);let running=false,speed=Math.max(.5,Math.min(30,Number(configuration.speedMultiplier)||1)),trial=1,last=performance.now(),accumulator=0,lastReport=0,stopped=false;
if(!parentPort)process.on('disconnect',()=>{stopped=true;process.exit(0);});
function snapshot(){
  const s=env.state(),c=s.car,F=env.runtime,car={};
  for(const k of ['id','x','y','heading','speed','steer','scale','pixelsPerMeter','alive','reason','distance','progress','bestProgress','fitness','reward','penalty','lastReward','lastPenalty','baseFitness','rewardRevision','previousGenerationLapTime','lapRegressionPenalty','noLapPenalty','laps','lastLapTime','bestLapTime','lifetime','totalG','longitudinalG','lateralG','slipAngle'])car[k]=c[k];
  Object.assign(car,{vehicle:F.Vehicle.telemetry(c.vehicle,true),rewardBreakdown:c.rewardBreakdown,checkpoints:c.rewardState.nextCheckpoint-1,
    inputs:Array.from(c.inputs||[]),physicsInputs:Array.from(c.physicsInputs||[]),outputs:Array.from(c.outputs||[]),trail:(c.trail||[]).slice(-160),brain:{active:[],values:Array.from(c.brain.activity),dense:true,activeCount:c.brain.activity.length}});
  return {circuitId:'monza',population:1,mutation:0,speedMultiplier:speed,mode:'connectome',running,generation:trial,elapsed:s.totalSimulationSeconds,history:[],bestEver:c.fitness,champion:null,championStats:null,learningStats:null,cars:[car],workerIndex:0,
    experiment:{mode:'inference-only',stageCount:env.model.data.stages.length,modelSha256:env.modelSha256}};
}
function report(force=false){const now=performance.now();if(force||now-lastReport>=100){lastReport=now;port.postMessage({type:'snapshot',snapshot:snapshot()});}}
port.on('message',m=>{
  try{
    if(m.type==='pause'){running=Boolean(m.value)&&env.state().car.alive;accumulator=0;last=performance.now();}
    else if(m.type==='setSpeed'){if(!Number.isFinite(m.value)||m.value<.5||m.value>30)throw Error('Velocità richiesta fuori intervallo');speed=m.value;}
    else if(m.type==='reset'){env.reset();trial++;running=false;accumulator=0;last=performance.now();}
    else if(m.type==='inspectAgent'){if(Number(m.value)!==0)throw Error('Una sola auto nella verifica');}
    else if(m.type==='stop'){stopped=true;if(!parentPort)process.disconnect();return;}
    else throw Error('Comando non disponibile nella verifica del campione');
    report(true);
  }catch(error){port.postMessage({type:'error',message:error.message});}
});
function loop(){
  if(stopped)return;
  const now=performance.now(),elapsed=Math.min(.25,(now-last)/1000);last=now;
  if(running){
    accumulator+=elapsed*speed;const started=performance.now();
    while(accumulator>=.1&&running&&performance.now()-started<12){env.step();accumulator-=.1;if(!env.state().car.alive)running=false;}
  }else accumulator=0;
  report();setTimeout(loop,running?(accumulator>=.1?0:Math.min(25,Math.max(1,Math.ceil((.1-accumulator)*1000/speed)))):40);
}
port.postMessage({type:'ready',nodeVersion:process.versions.node,graph:{nodes:env.graph.n,edges:env.graph.edgeCount,policyVersion:env.graph.learning.version},stageCount:env.model.data.stages.length,modelSha256:env.modelSha256,verifiedResult:env.verificationExpected||env.model.data.stages.at(-1).provenance.verifiedFullResult});report(true);loop();
