'use strict';

const F=require('../outputs/simulation.js');
const ModelTest=require('../outputs/model-test.js');
const {REFINEMENT_BOUNDS,createDecoder}=require('./imitation-trial.cjs');
const INITIAL=Object.freeze({steeringScale:1,pedalScale:1,accelerationBias:0});

function nextPopulation(elite, generation) {
  const random=F.rng(40719+generation);
  const perturb=(name,value,delta)=>F.clamp(value+delta,...REFINEMENT_BOUNDS[name]);
  const children=Array.from({length:ModelTest.REFINEMENT_POPULATION-1},(_,index)=>({
    steeringScale:perturb('steeringScale',elite.steeringScale,.018*(random()*2-1)),
    pedalScale:perturb('pedalScale',elite.pedalScale,.035*(random()*2-1)),
    accelerationBias:perturb('accelerationBias',elite.accelerationBias,index===0?.012:.018*(random()*2-1)),
  }));
  return [elite,...children];
}

function summarize(car,parameters,ppm) {
  const lapTimes=car.lapTimes.slice();
  const safe=F.isSafeLearningOutcome(car)&&!car.diagnosticVehicle;
  const completed=safe&&car.laps===2&&car.reason==='limite 2 giri'&&lapTimes.length===2&&
    lapTimes.every(time=>Number.isFinite(time)&&time>0)&&Number.isFinite(car.fitness);
  return {agentId:car.id,parameters,completed,safe,laps:car.laps,reason:car.reason,
    progressMeters:car.bestProgress/ppm,fitness:car.fitness,lapTimes,
    twoLapSimSeconds:completed?lapTimes[0]+lapTimes[1]:null};
}

class ActuatorTrial extends ModelTest.Trial {
  constructor(options,now,bundle,sim) {
    super(options,now);
    this.decoderSha256=bundle.sha256;
    this.genome=bundle.genome;
    this.elite=bundle.actor.actuatorRefinement??INITIAL;
    this.parameters=nextPopulation(this.elite,1);
    this.rounds=[];
    this.baseline=null;
    this.finishTimes=new Map();
    sim.motorDecoder=createDecoder(bundle.actor,sim.graph,car=>this.parameters[car.id]);
  }

  observe(sim,now,dt) {
    if(this.done)return;
    const candidates=this.recordTick(sim,dt);
    if(this.checkLimit(now))return;
    for(const car of candidates){
      if(car.laps===2&&car.reason==='limite 2 giri'&&!this.finishTimes.has(car.id))this.finishTimes.set(car.id,Math.max(0,(now-this.started)/1000));
    }
    if(sim.cars.some(car=>car.alive))return;

    const results=candidates.map(car=>summarize(car,this.parameters[car.id],sim.track.pixelsPerMeter||1));
    const winner=results.filter(row=>row.completed).sort((a,b)=>b.fitness-a.fitness||a.twoLapSimSeconds-b.twoLapSimSeconds||a.agentId-b.agentId)[0]??null;
    if(!this.rounds.length)this.baseline=results.find(row=>row.agentId===0)??null;
    this.generations++;
    this.rounds.push({generation:sim.generation,simSeconds:sim.elapsed,candidates:results,selected:winner?.agentId??null});
    this.hit=winner?{generation:sim.generation,agentId:winner.agentId,lapTimes:winner.lapTimes,
      twoLapSimSeconds:winner.twoLapSimSeconds,wallToTwoLapsSeconds:this.finishTimes.get(winner.agentId)}:null;
    if(winner)this.elite=winner.parameters;
    if(this.generations>=ModelTest.REFINEMENT_UPDATES){
      this.generationSimSeconds=sim.elapsed;
      this.finish(winner?'completed':'failed',now,winner?null:'Nessun affinamento ha concluso due giri in sicurezza nell’ultima generazione.');
      return;
    }

    sim.generation++;
    this.currentGeneration=sim.generation;
    this.parameters=nextPopulation(this.elite,sim.generation);
    this.finishTimes.clear();
    sim.spawn(this.parameters.map(()=>this.genome));
    if(winner)for(const car of sim.cars)car.previousGenerationLapTime=Math.min(...winner.lapTimes);
  }

  snapshot(now){
    const last=this.rounds.at(-1);
    const selected=last?.candidates.find(row=>row.agentId===last.selected)??null;
    return {...super.snapshot(now),rewardTraining:{
      targetUpdates:ModelTest.REFINEMENT_UPDATES,
      baseline:this.baseline,
      rounds:this.rounds,
      selected,
      improvementSeconds:this.baseline?.completed&&selected?this.baseline.twoLapSimSeconds-selected.twoLapSimSeconds:null,
    }};
  }
}

module.exports={ActuatorTrial,nextPopulation};
