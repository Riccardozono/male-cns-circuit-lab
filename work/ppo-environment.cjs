'use strict';
// Actual simulator environment for PPO. Curriculum snapshots were physically
// reached by the incumbent; no projection or desired actions are used.
const X=require('./context8-model.cjs'),PPO=require('./ppo-neural.cjs'),{F,L}=X;
function place(track,graph,genome,state){
  const car=F.makeCar(track,0,F.cloneGenome(genome));car.brain=F.makeBrain(graph);
  if(state){Object.assign(car,{x:state.x,y:state.y,heading:state.heading,speed:state.speed,_physicsSpeed:state.speed},state.physics);car.vehicle=JSON.parse(JSON.stringify(state.vehicle));car.brain.activity.set(state.activity);F.Rewards.initialise(track,car);car.rewardState.along=state.along;}
  return car;
}
function observe(track,graph,car){
  car.inputs=F.sense(track,car);car.physicsInputs=F.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
  F.neuralStep(graph,car.brain,car.genome,car.sensorVector);
  return PPO.neuralFeatures(graph,car.brain,car.genome.policyWeights,L);
}
function collect(track,graph,genome,bank,prefix,criticSnapshot,seed,steps=512,maxRollout=240){
  const random=F.rng(seed),critic=PPO.Critic.restore(criticSnapshot),actor=new PPO.Actor(graph.learning,genome.policyWeights),rows=[],episodes=[],trajectories=[];
  while(rows.length<steps){
    const state=bank[Math.floor(random()*bank.length)],car=place(track,graph,genome,state);let observation=observe(track,graph,car),noise=[0,0],trajectory=[];
    for(let tick=0;car.alive&&tick<maxRollout&&rows.length<steps;tick++){
      const criticFeatures=observation.features.concat(noise),value=critic.forward(criticFeatures).value,
        sampled=PPO.sampleAction(actor,observation,random,PPO.exploration(observation.raw,prefix),noise),before=car.fitness;
      for(let k=0;k<L.CONTROL_INTERVAL&&car.alive;k++)F.drive(track,car,sampled.controls,F.DT);
      const terminal=!car.alive;noise=sampled.noise;
      let nextValue=0;if(!terminal){observation=observe(track,graph,car);nextValue=critic.forward(observation.features.concat(noise)).value;}
      const row={features:criticFeatures.slice(0,actor.dimension),criticFeatures,sample:sampled.sample,shift:sampled.shift,std:sampled.std,logp:sampled.logp,active:sampled.active,
        reward:(car.fitness-before)/1000,value,nextValue,terminal};trajectory.push(row);rows.push(row);
    }
    // A rollout cutoff is censored and bootstrapped, never finalized as a
    // successful generation or assigned invented no-lap/terminal rewards.
    PPO.gae(trajectory);trajectories.push(trajectory.length);episodes.push({progress:car.bestProgress,fitness:car.fitness,laps:car.laps,terminal:!car.alive,reason:car.alive?'truncated rollout':car.reason});
  }
  return {rows,episodes,trajectories,seed,steps:rows.length};
}
function evaluate(track,graph,genome,maxTicks=120000){
  const car=place(track,graph,genome,null);let commands=[0,0,0],ticks=0,maxBrake=0,maxSteer=0;
  while(car.alive&&ticks<maxTicks){if(ticks%L.CONTROL_INTERVAL===0){observe(track,graph,car);commands=L.commands(graph,car.brain,car.genome);}
    maxBrake=Math.max(maxBrake,commands[2]);maxSteer=Math.max(maxSteer,Math.abs(commands[0]));F.drive(track,car,commands,F.DT);ticks++;}
  return {bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'evaluation censored':car.reason,complete:!car.alive,simulationSeconds:ticks*F.DT,maxBrake,maxSteer,lapTimes:car.lapTimes.slice()};
}
module.exports={X,F,L,place,observe,collect,evaluate};
