'use strict';

// Research-only decoder 9. It retains decoder 8's current and one-step
// temporal features, then adds two exponential traces of real descending
// neuron activity. No track position, route, target speed, or teacher action
// is exposed to the controller. New coefficients start at zero.
const D8=require('./decoder8-temporal-model.cjs');
const POLICY=Object.freeze({...D8.POLICY,version:9,multiscaleTemporalReadout:true});
const FAST_TAU_SECONDS=.25;
const SLOW_TAU_SECONDS=.8;
const NEW_FEATURE_SIGMA=.035;

function expand(oldPolicy){
  if(oldPolicy.version!==8||oldPolicy.actionCount!==3||oldPolicy.featureCount!==oldPolicy.baseFeatureCount*2)
    throw Error('Decoder 9 richiede il readout temporale decoder8.');
  const nodes=oldPolicy.nodes.length,newFeatureCount=nodes*2,
    featureCount=oldPolicy.featureCount+newFeatureCount,
    fastOffset=oldPolicy.featureCount,slowOffset=fastOffset+nodes,
    thresholdOffset=oldPolicy.readoutOffset+featureCount*oldPolicy.readoutStride,
    biasOffset=thresholdOffset+nodes,length=biasOffset+3,
    mean=Array(length).fill(0),scales=Array(length).fill(.1);
  for(let i=0;i<oldPolicy.readoutOffset;i++){mean[i]=oldPolicy.mean[i];scales[i]=oldPolicy.scales[i];}
  for(let feature=0;feature<oldPolicy.featureCount;feature++)for(let action=0;action<3;action++){
    const from=oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action,
      to=oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action;
    mean[to]=oldPolicy.mean[from];scales[to]=oldPolicy.scales[from];
  }
  for(let feature=fastOffset;feature<featureCount;feature++)for(let action=0;action<3;action++)
    scales[oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action]=NEW_FEATURE_SIGMA;
  for(let node=0;node<nodes;node++){
    mean[thresholdOffset+node]=oldPolicy.mean[oldPolicy.thresholdOffset+node];
    scales[thresholdOffset+node]=oldPolicy.scales[oldPolicy.thresholdOffset+node];
  }
  for(let action=0;action<3;action++){
    mean[biasOffset+action]=oldPolicy.mean[oldPolicy.biasOffset+action];
    scales[biasOffset+action]=oldPolicy.scales[oldPolicy.biasOffset+action];
  }
  return {...oldPolicy,version:9,multiscaleTemporalReadout:true,featureCount,
    fastOffset,slowOffset,thresholdOffset,biasOffset,length,mean,scales,
    readoutStride:3};
}

function install(Learning){
  const baseBuild=Learning.build,baseCommands=Learning.commands,
    baseSupportedVersion=Learning.supportedVersion;
  function build(graph){
    const config=graph.policyConfig;
    if(config?.version!==9)return baseBuild(graph);
    if(config.multiscaleTemporalReadout!==true||config.actionHeads!==3||config.nonlinearReadout!==true)
      throw Error('Decoder 9 richiede le due tracce temporali e tre teste.');
    graph.policyConfig={...config,version:8};
    let oldPolicy;
    try{oldPolicy=baseBuild(graph);}finally{graph.policyConfig=config;}
    const policy=expand(oldPolicy);graph.learning=policy;return policy;
  }
  function commands(graph,brain,genome,enabled=true,edgesEnabled=true){
    const p=graph.learning;
    if(p?.version!==9)return baseCommands(graph,brain,genome,enabled,edgesEnabled);
    if(!enabled||!edgesEnabled)return [0,0,0];
    const values=genome?.policyWeights;
    if(genome?.adapterVersion!==9||!Learning.valid(graph,values))throw Error('Policy Decoder 9 incompatibile.');
    const nodeCount=p.nodes.length,baseCount=p.baseFeatureCount,
      features=brain.policyFeatures?.length===p.featureCount?brain.policyFeatures:(brain.policyFeatures=new Float64Array(p.featureCount)),
      current=brain.temporalReadoutCurrent?.length===baseCount?brain.temporalReadoutCurrent:(brain.temporalReadoutCurrent=new Float64Array(baseCount));
    let signal=0;
    for(let node=0;node<nodeCount;node++){
      const activity=Number(brain.activity[p.nodes[node]])||0;signal=Math.max(signal,Math.abs(activity));
      current[node]=Math.tanh(8*activity);
      current[nodeCount+node]=Math.tanh(32*(activity-values[p.thresholdOffset+node]));
    }
    const previous=brain.temporalReadoutPrevious;
    for(let index=0;index<baseCount;index++){
      features[index]=current[index];
      features[p.temporalOffset+index]=previous?current[index]-previous[index]:0;
    }
    brain.temporalReadoutPrevious=current.slice();
    let fast=brain.decoder9FastTrace,slow=brain.decoder9SlowTrace;
    if(fast?.length!==nodeCount)fast=brain.decoder9FastTrace=new Float64Array(nodeCount);
    if(slow?.length!==nodeCount)slow=brain.decoder9SlowTrace=new Float64Array(nodeCount);
    const rate=p.controlRateHz||10,alphaFast=Math.exp(-1/(rate*FAST_TAU_SECONDS)),
      alphaSlow=Math.exp(-1/(rate*SLOW_TAU_SECONDS));
    for(let node=0;node<nodeCount;node++){
      const value=current[node];
      fast[node]=alphaFast*fast[node]+(1-alphaFast)*value;
      slow[node]=alphaSlow*slow[node]+(1-alphaSlow)*value;
      features[p.fastOffset+node]=fast[node];
      features[p.slowOffset+node]=slow[node];
    }
    if(signal<1e-7)return [0,0,0];
    let steering=0,gasLogit=0,brakeLogit=0;
    for(let feature=0;feature<p.featureCount;feature++){
      const offset=p.readoutOffset+feature*p.readoutStride,
        value=features[feature]*p.featureNorm;
      steering+=value*values[offset];gasLogit+=value*values[offset+1];brakeLogit+=value*values[offset+2];
    }
    return [Math.tanh(steering+values[p.biasOffset]),
      Math.max(0,Math.tanh(gasLogit+values[p.biasOffset+1])),
      Math.max(0,Math.tanh(brakeLogit+values[p.biasOffset+2]))];
  }
  Learning.build=build;Learning.commands=commands;
  Learning.supportedVersion=version=>version===9||baseSupportedVersion(version);
  return ()=>{Learning.build=baseBuild;Learning.commands=baseCommands;Learning.supportedVersion=baseSupportedVersion;};
}

function transfer(values,oldPolicy,newPolicy,{sigma=false}={}){
  if(!Array.isArray(values)||values.length!==oldPolicy.length||oldPolicy.version!==8||newPolicy.version!==9||
     oldPolicy.readoutOffset!==newPolicy.readoutOffset||oldPolicy.featureCount!==newPolicy.featureCount-newPolicy.nodes.length*2||
     JSON.stringify(Array.from(oldPolicy.nodes))!==JSON.stringify(Array.from(newPolicy.nodes)))
    throw Error('Trasferimento decoder 8→9 non supportato.');
  const result=newPolicy.scales.slice();
  for(let index=0;index<oldPolicy.readoutOffset;index++)result[index]=values[index];
  for(let feature=0;feature<oldPolicy.featureCount;feature++)for(let action=0;action<3;action++){
    const from=oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action,
      to=newPolicy.readoutOffset+feature*newPolicy.readoutStride+action;
    result[to]=values[from];
  }
  for(let feature=oldPolicy.featureCount;feature<newPolicy.featureCount;feature++)for(let action=0;action<3;action++){
    const index=newPolicy.readoutOffset+feature*newPolicy.readoutStride+action;
    result[index]=sigma?newPolicy.scales[index]:0;
  }
  for(let node=0;node<oldPolicy.nodes.length;node++)result[newPolicy.thresholdOffset+node]=values[oldPolicy.thresholdOffset+node];
  for(let action=0;action<3;action++)result[newPolicy.biasOffset+action]=values[oldPolicy.biasOffset+action];
  return result;
}

function migratePayload(payload,oldPolicy,newPolicy,newGraph,Progress){
  if(oldPolicy.version!==8||newPolicy.version!==9)throw Error('Migrazione decoder 8→9 non supportata.');
  const copy=JSON.parse(JSON.stringify(payload));
  const migrateGenome=genome=>genome===null?null:{...genome,adapterVersion:9,policyWeights:transfer(genome.policyWeights,oldPolicy,newPolicy)};
  for(const worker of copy.workers){
    const state=worker.state;
    state.genomes=state.genomes.map(migrateGenome);
    state.champion=migrateGenome(state.champion);
    state.externalChampion=migrateGenome(state.externalChampion);
    state.hallOfFame=state.hallOfFame.map(entry=>({...entry,genome:migrateGenome(entry.genome)}));
    state.optimizer={...state.optimizer,mean:transfer(state.optimizer.mean,oldPolicy,newPolicy),sigma:transfer(state.optimizer.sigma,oldPolicy,newPolicy,{sigma:true})};
    state.history=[];
  }
  if(copy.globalChampion)copy.globalChampion.genome=migrateGenome(copy.globalChampion.genome);
  copy.graph=Progress.compatibleGraph(newGraph);
  return copy;
}

module.exports={POLICY,FAST_TAU_SECONDS,SLOW_TAU_SECONDS,NEW_FEATURE_SIGMA,expand,install,transfer,migratePayload};
