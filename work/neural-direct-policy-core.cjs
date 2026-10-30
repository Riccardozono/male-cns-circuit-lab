'use strict';
// Actual MaleCNS reservoir + a directly trainable single motor readout.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),G=require('./guard-memory-runtime.cjs'),H=require('./causal-checkpoint.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
const F=require('../.impeccable/experimental-penalty5/outputs/simulation.js'),L=require('../.impeccable/experimental-penalty5/outputs/neural-learning.js');
function createFrame(){
 if(process.versions.node!=='24.19.0')throw Error('Pinned runtime required');
 const source=path.join(G.root,'.impeccable/review/neural-local-rbf/causal-single-axis-guard4/checkpoint.json'),{saved}=H.load(source),sim=new F.Simulation(G.X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')}),graph=sim.graph,genome=F.cloneGenome(saved.baseGenome),p=graph.learning;
 assert.equal(graph.n,7721);assert.equal(graph.edgeCount,242486);assert.equal(p.nodes.length,64);assert.equal(p.contextCount,12);for(const node of p.nodes)assert.equal(graph.classNames[graph.classCodes[node]],'descending_neuron');
 const initial=[];for(let j=0;j<p.nodes.length+p.contextCount;j++)initial.push(genome.policyWeights[p.readoutOffset+2*j],genome.policyWeights[p.readoutOffset+2*j+1]);initial.push(genome.policyWeights.at(-2),genome.policyWeights.at(-1));
 return {graph,track:sim.track,genome,policy:p,initialWeights:initial,dimension:p.nodes.length+p.contextCount+1,source,sourceSha256:G.C.hashFile(source),gains:F.synapticGains(graph,genome)};
}
function observe(frame,car){
 const {graph,genome,gains}=frame;car.inputs=F.sense(frame.track,car);car.physicsInputs=F.physicsSense(car,frame.track);car.sensorVector=car.inputs.concat(car.physicsInputs);
 // Deliberately do not call the frozen decoder or any RBF motor controller.
 car.brain.injection.fill(0);graph.inputs.forEach((node,k)=>{car.brain.injection[node]=F.sensorDrive(graph,genome,car.sensorVector,k,F.PHYSICS_ADAPTER_GAIN);});Cuda.pass(graph,car.brain,4,true,gains);
 const raw=Array.from(frame.policy.nodes,i=>Math.tanh(8*car.brain.activity[i])),contexts=L.contextVector(graph,genome.policyWeights,raw),norm=1/Math.sqrt(raw.length);
 return {x:[...raw.map(v=>v*norm),...contexts.map(v=>v*norm),1],active:Array.from(frame.policy.nodes).some(i=>Math.abs(car.brain.activity[i])>=1e-7)};
}
function validate(weights,dimension){if(!Array.isArray(weights)||weights.length!==dimension*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded direct-neuronal readout weights required');}
function mean(x,weights){validate(weights,x.length);if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal features required');const result=[0,0];for(let j=0;j<x.length;j++)for(let a=0;a<2;a++)result[a]+=x[j]*weights[2*j+a];return result;}
function commands(latent,active){if(!Array.isArray(latent)||latent.length!==2||latent.some(v=>!Number.isFinite(v)||Math.abs(v)>1000))throw Error('Finite bounded latent motor sample required');if(!active)return [0,0,0];const steering=Math.tanh(latent[0]),longitudinal=Math.tanh(latent[1]);return [steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];}
function metadata(frame){return {format:'male-cns-direct-from-line-policy-v1',modelId:'v3',circuitId:'monza',appVersion:'5.6.0',graph:G.X.P.compatibleGraph(frame.graph),sourceSha256:frame.sourceSha256,dimension:frame.dimension,initialWeights:frame.initialWeights,readoutNodes:Array.from(frame.policy.nodes),readoutBodyIds:Array.from(frame.policy.nodes,i=>frame.graph.bodyIds[i]),sensors:F.SENSOR_COUNT,objectiveRevision:F.Rewards.REVISION,vehicleRevision:F.Vehicle.REVISION,controlInterval:L.CONTROL_INTERVAL,dt:F.DT,boundary:'Frozen previously learned sensory injection/synaptic gains and twelve neuronal context basis functions. All154motorreadoutweights trainable directly, no fixed previous motor command/correction cascade or prefix projection. Every episode starts at the line. Not full coldstart or physiological fly reproduction.'};}
module.exports={F,L,createFrame,observe,mean,validate,commands,metadata,stats:Cuda.stats,close:Cuda.close};
