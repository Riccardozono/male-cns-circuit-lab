'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const F=require(workerData.simulationPath),Original=F.Simulation;let instance;
F.Simulation=class extends Original{
  constructor(...args){super(...args);instance=this;}
};
parentPort.on('message',m=>{
  if(m.type!=='observe-learning-cache'||!instance)return;
  const observed=instance.cars.filter(c=>c.brain.policyExperience?.samples>0);
  parentPort.postMessage({type:'learning-cache-proof',workerIndex:workerData.index,
    modelId:instance.modelId,generation:instance.generation,neuralInterval:instance.neuralInterval,
    observedAgents:observed.length,maxCentres:Math.max(0,...observed.map(c=>c.brain.policyExperience.centres.length)),
    episodes:instance.optimizer?.episodes,practiceEvaluations:instance.practiceEvaluations||0,
    graphNodes:instance.graph.n,graphEdges:instance.graph.edgeCount,
    overlap:instance.cars.some(c=>Math.min(...c.outputs.slice(1))>1e-9),
    finite:instance.cars.every(c=>[c.x,c.y,c.heading,c.speed,...c.outputs].every(Number.isFinite))});
});
require(workerData.nativeLearningOriginalWorker);
