'use strict';
const {performance}=require('node:perf_hooks'),crypto=require('node:crypto'),Model=require('./neural-statehead-cuda-model.cjs'),Arena=require('./neural-statehead-cuda-arena.cjs');
const config=JSON.parse(process.argv[2]);if(process.versions.node!=='24.19.0')throw Error('Numerical runtime Node 24.19.0 required');
const loaded=config.research?Model.loadResearch(config.modelFile):Model.load(config.modelFile);let arena,epoch=null,running=false,speed=1,last=performance.now(),accumulator=0,lastReport=0,doneSent=false,stopped=false,inspected=-1;
const send=m=>{if(process.connected)process.send(m);};
function compact(a){
  const c=a.env.currentCar(),F=a.env.runtime,r={};
  for(const k of ['id','x','y','heading','speed','steer','scale','pixelsPerMeter','alive','reason','distance','progress','bestProgress','fitness','reward','penalty','lastReward','lastPenalty','baseFitness','rewardRevision','previousGenerationLapTime','lapRegressionPenalty','noLapPenalty','laps','lastLapTime','bestLapTime','lifetime','totalG','longitudinalG','lateralG','slipAngle'])r[k]=c[k];
  const selected=c.id===inspected;
  Object.assign(r,{vehicle:F.Vehicle.telemetry(c.vehicle,selected),rewardBreakdown:c.rewardBreakdown,checkpoints:c.rewardState.nextCheckpoint-1,inputs:c.inputs.slice(),physicsInputs:c.physicsInputs.slice(),outputs:c.outputs.slice(),trail:c.trail.slice(-160),brain:selected?{values:Array.from(c.brain.activity),active:[],dense:true,activeCount:c.brain.activity.length}:null});return r;
}
function report(force=false){const now=performance.now();if(arena&&(force||now-lastReport>=100)){lastReport=now;send({type:'snapshot',epoch,cars:arena.agents.map(compact),complete:arena.complete(),running,cuda:Model.stats()});}}
process.on('message',m=>{
  try{
    if(m.type==='begin'){
      const sharedTopology=arena?.topology;epoch=m.epoch;arena=Arena.create(loaded,m.entries,{previousLapTime:m.previousLapTime??null,sharedTopology});running=false;speed=m.speed;accumulator=0;last=performance.now();doneSent=false;inspected=m.inspected;
      send({type:'begun',epoch,graph:{nodes:arena.topology.graph.n,edges:arena.topology.graph.edgeCount},genesHash:crypto.createHash('sha256').update(JSON.stringify(m.entries)).digest('hex')});report(true);
    }else if(m.type==='pause'){running=Boolean(m.value);accumulator=0;last=performance.now();send({type:'ack',request:m.request,running});report(true);}
    else if(m.type==='setSpeed'){if(!Number.isFinite(m.value)||m.value<.5||m.value>30)throw Error('Requested speed out of range');speed=m.value;send({type:'ack',request:m.request});}
    else if(m.type==='inspectAgent'){inspected=Number(m.value);report(true);}
    else if(m.type==='stop'){stopped=true;Model.closeCuda();process.disconnect();return;}else throw Error('Unsupported native generation command');
  }catch(error){send({type:'error',epoch,message:error.stack});}
});
process.on('disconnect',()=>{stopped=true;Model.closeCuda();process.exit(0);});
function loop(){
  if(stopped)return;const now=performance.now();accumulator+=running?Math.min(.25,(now-last)/1000)*speed:0;last=now;
  if(running&&arena){const began=performance.now();while(accumulator>=.1&&!arena.complete()&&performance.now()-began<12){const round=arena.rounds();arena.stepOne();if(arena.rounds()!==round)accumulator-=.1;}
    if(arena.complete()&&!doneSent){doneSent=true;running=false;send({type:'done',epoch,results:arena.results()});report(true);}
  }else accumulator=0;
  report();setTimeout(loop,running?accumulator>=.1?0:Math.min(25,Math.max(1,Math.ceil((.1-accumulator)*1000/speed))):30);
}
send({type:'ready',nodeVersion:process.versions.node,modelSha256:loaded.sha256});loop();
