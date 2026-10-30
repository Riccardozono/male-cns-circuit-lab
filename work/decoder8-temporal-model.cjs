'use strict';

// Research-only V3 decoder. It reads current and one-step change features from
// the real descending-neuron activity already computed by the connectome.
// The temporal branch starts at zero, preserving the migrated decoder7 policy.
const Decoder7=require('./decoder7-model.cjs');
const POLICY=Object.freeze({...Decoder7.POLICY,version:8,temporalReadout:true});

function expand(oldPolicy){
  if(oldPolicy.version!==7||oldPolicy.actionCount!==3||oldPolicy.featureCount!==oldPolicy.nodes.length*2)
    throw Error('Decoder 8 richiede la policy decoder7 a tre teste.');
  const baseFeatureCount=oldPolicy.featureCount,featureCount=baseFeatureCount*2,
    thresholdOffset=oldPolicy.readoutOffset+featureCount*oldPolicy.readoutStride,
    biasOffset=thresholdOffset+oldPolicy.nodes.length,length=biasOffset+3,
    mean=Array(length).fill(0),scales=Array(length).fill(.1);
  for(let i=0;i<oldPolicy.readoutOffset;i++){mean[i]=oldPolicy.mean[i];scales[i]=oldPolicy.scales[i];}
  for(let feature=0;feature<baseFeatureCount;feature++)for(let action=0;action<3;action++){
    const oldIndex=oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action;
    const currentIndex=oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action;
    const temporalIndex=oldPolicy.readoutOffset+(baseFeatureCount+feature)*oldPolicy.readoutStride+action;
    mean[currentIndex]=oldPolicy.mean[oldIndex];scales[currentIndex]=oldPolicy.scales[oldIndex];
    mean[temporalIndex]=0;scales[temporalIndex]=oldPolicy.scales[oldIndex];
  }
  for(let node=0;node<oldPolicy.nodes.length;node++){
    mean[thresholdOffset+node]=oldPolicy.mean[oldPolicy.thresholdOffset+node];
    scales[thresholdOffset+node]=oldPolicy.scales[oldPolicy.thresholdOffset+node];
  }
  for(let action=0;action<3;action++){
    mean[biasOffset+action]=oldPolicy.mean[oldPolicy.biasOffset+action];
    scales[biasOffset+action]=oldPolicy.scales[oldPolicy.biasOffset+action];
  }
  return {...oldPolicy,version:8,actionCount:3,temporalReadout:true,baseFeatureCount,featureCount,temporalOffset:baseFeatureCount,
    thresholdOffset,biasOffset,length,mean,scales,readoutStride:3};
}

function install(Learning){
  const baseBuild=Learning.build,baseCommands=Learning.commands,baseSupportedVersion=Learning.supportedVersion;
  function build(graph){
    const config=graph.policyConfig;
    if(config?.version!==8)return baseBuild(graph);
    if(config.temporalReadout!==true||config.actionHeads!==3||config.nonlinearReadout!==true)
      throw Error('Decoder 8 richiede readout neurale temporale e tre teste.');
    graph.policyConfig={...config,version:7};
    let oldPolicy;
    try{oldPolicy=baseBuild(graph);}finally{graph.policyConfig=config;}
    const policy=expand(oldPolicy);graph.learning=policy;return policy;
  }
  function commands(graph,brain,genome,enabled=true,edgesEnabled=true){
    const p=graph.learning;
    if(p?.version!==8)return baseCommands(graph,brain,genome,enabled,edgesEnabled);
    if(!enabled||!edgesEnabled)return [0,0,0];
    const values=genome.policyWeights;
    if(genome.adapterVersion!==8||!Learning.valid(graph,values))throw Error('Policy Decoder 8 incompatibile.');
    const currentCount=p.baseFeatureCount,features=brain.policyFeatures?.length===p.featureCount
      ?brain.policyFeatures:(brain.policyFeatures=new Float64Array(p.featureCount));
    const current=brain.temporalReadoutCurrent?.length===currentCount
      ?brain.temporalReadoutCurrent:(brain.temporalReadoutCurrent=new Float64Array(currentCount));
    let signal=0;
    for(let node=0;node<p.nodes.length;node++){
      const activity=Number(brain.activity[p.nodes[node]])||0;signal=Math.max(signal,Math.abs(activity));
      current[node]=Math.tanh(8*activity);
      current[p.nodes.length+node]=Math.tanh(32*(activity-values[p.thresholdOffset+node]));
    }
    const previous=brain.temporalReadoutPrevious;
    for(let index=0;index<currentCount;index++){
      features[index]=current[index];
      features[p.temporalOffset+index]=previous?current[index]-previous[index]:0;
    }
    brain.temporalReadoutPrevious=current.slice();
    if(signal<1e-7)return [0,0,0];
    let steering=0,throttle=0,brake=0;
    for(let feature=0;feature<p.featureCount;feature++){
      const offset=p.readoutOffset+feature*p.readoutStride,value=features[feature]*p.featureNorm;
      steering+=value*values[offset];throttle+=value*values[offset+1];brake+=value*values[offset+2];
    }
    return [Math.tanh(steering+values[p.biasOffset]),
      Math.max(0,Math.tanh(throttle+values[p.biasOffset+1])),
      Math.max(0,Math.tanh(brake+values[p.biasOffset+2]))];
  }
  Learning.build=build;Learning.commands=commands;
  Learning.supportedVersion=version=>version===8||baseSupportedVersion(version);
  return ()=>{Learning.build=baseBuild;Learning.commands=baseCommands;Learning.supportedVersion=baseSupportedVersion;};
}

function transfer(values,oldPolicy,newPolicy,{sigma=false}={}){
  if(!Array.isArray(values)||values.length!==oldPolicy.length||oldPolicy.version!==7||newPolicy.version!==8||
     oldPolicy.readoutOffset!==newPolicy.readoutOffset||oldPolicy.featureCount!==newPolicy.baseFeatureCount||
     JSON.stringify(Array.from(oldPolicy.nodes))!==JSON.stringify(Array.from(newPolicy.nodes)))
    throw Error('Trasferimento decoder 7→8 non supportato.');
  const result=newPolicy.scales.slice();
  for(let index=0;index<oldPolicy.readoutOffset;index++)result[index]=values[index];
  for(let feature=0;feature<oldPolicy.featureCount;feature++)for(let action=0;action<3;action++){
    const oldIndex=oldPolicy.readoutOffset+feature*oldPolicy.readoutStride+action;
    const newIndex=oldPolicy.readoutOffset+feature*newPolicy.readoutStride+action;
    result[newIndex]=values[oldIndex];
    const temporalIndex=oldPolicy.readoutOffset+(newPolicy.temporalOffset+feature)*newPolicy.readoutStride+action;
    result[temporalIndex]=sigma?values[oldIndex]:0;
  }
  for(let node=0;node<oldPolicy.nodes.length;node++)result[newPolicy.thresholdOffset+node]=values[oldPolicy.thresholdOffset+node];
  for(let action=0;action<3;action++)result[newPolicy.biasOffset+action]=values[oldPolicy.biasOffset+action];
  return result;
}

function migratePayload(payload,oldPolicy,newPolicy,newGraph,Progress){
  const copy=JSON.parse(JSON.stringify(payload));
  const migrateGenome=genome=>genome===null?null:{...genome,adapterVersion:8,policyWeights:transfer(genome.policyWeights,oldPolicy,newPolicy)};
  for(const worker of copy.workers){
    const state=worker.state;
    state.genomes=state.genomes.map(migrateGenome);
    state.champion=migrateGenome(state.champion);
    state.externalChampion=migrateGenome(state.externalChampion);
    state.hallOfFame=state.hallOfFame.map(entry=>({...entry,genome:migrateGenome(entry.genome)}));
    state.optimizer={...state.optimizer,mean:transfer(state.optimizer.mean,oldPolicy,newPolicy),sigma:transfer(state.optimizer.sigma,oldPolicy,newPolicy,{sigma:true})};
    // Old history is intentionally cleared because its metric metadata uses
    // decoder7 parameter dimensions. Evaluated safe genotypes remain intact.
    state.history=[];
  }
  if(copy.globalChampion)copy.globalChampion.genome=migrateGenome(copy.globalChampion.genome);
  copy.graph=Progress.compatibleGraph(newGraph);
  return copy;
}

module.exports={POLICY,expand,install,transfer,migratePayload};
