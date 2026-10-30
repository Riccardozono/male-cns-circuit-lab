'use strict';

// Isolated V3 experiment: replace the signed longitudinal readout with
// independent throttle and brake heads while preserving the initial policy.
const Decoder6=require('./decoder6-model.cjs');
const POLICY=Object.freeze({version:7,gainGroups:16,readoutLimit:64,nonlinearReadout:true,actionHeads:3});

function expand(oldPolicy){
  if(oldPolicy.version!==6||oldPolicy.nonlinear!==true||oldPolicy.featureCount!==oldPolicy.nodes.length*2)throw Error('Decoder 7 requires the nonlinear decoder 6 readout.');
  const thresholdOffset=oldPolicy.readoutOffset+oldPolicy.featureCount*3;
  const biasOffset=thresholdOffset+oldPolicy.nodes.length;
  const length=biasOffset+3,mean=Array(length).fill(0),scales=Array(length).fill(.1);
  for(let i=0;i<oldPolicy.readoutOffset;i++){mean[i]=oldPolicy.mean[i];scales[i]=oldPolicy.scales[i];}
  for(let j=0;j<oldPolicy.featureCount;j++){
    const from=oldPolicy.readoutOffset+j*2,to=oldPolicy.readoutOffset+j*3;
    mean[to]=oldPolicy.mean[from];mean[to+1]=oldPolicy.mean[from+1];mean[to+2]=-oldPolicy.mean[from+1];
    scales[to]=oldPolicy.scales[from];scales[to+1]=oldPolicy.scales[from+1];scales[to+2]=oldPolicy.scales[from+1];
  }
  for(let j=0;j<oldPolicy.nodes.length;j++){
    mean[thresholdOffset+j]=oldPolicy.mean[oldPolicy.thresholdOffset+j];
    scales[thresholdOffset+j]=oldPolicy.scales[oldPolicy.thresholdOffset+j];
  }
  mean[biasOffset]=oldPolicy.mean[oldPolicy.length-2];
  mean[biasOffset+1]=oldPolicy.mean[oldPolicy.length-1];
  mean[biasOffset+2]=-oldPolicy.mean[oldPolicy.length-1];
  scales[biasOffset]=oldPolicy.scales[oldPolicy.length-2];
  scales[biasOffset+1]=oldPolicy.scales[oldPolicy.length-1];
  scales[biasOffset+2]=oldPolicy.scales[oldPolicy.length-1];
  return {...oldPolicy,version:7,actionCount:3,length,mean,scales,thresholdOffset,biasOffset,readoutStride:3};
}

function install(Learning){
  const baseBuild=Learning.build,baseCommands=Learning.commands;
  const baseLocalMutation=Learning.localMutation,baseSafeMotorMutation=Learning.safeMotorMutation;
  const baseSupportedVersion=Learning.supportedVersion;
  function build(graph){
    const config=graph.policyConfig;
    if(config?.version!==7)return baseBuild(graph);
    if(config.actionHeads!==3||config.nonlinearReadout!==true)throw Error('Decoder 7 requires three action heads and the nonlinear V3 readout.');
    graph.policyConfig={...config,version:6};
    let oldPolicy;
    try{oldPolicy=baseBuild(graph);}finally{graph.policyConfig=config;}
    const policy=expand(oldPolicy);graph.learning=policy;return policy;
  }
  function commands(graph,brain,genome,enabled=true,edgesEnabled=true){
    if(graph.learning?.actionCount!==3)return baseCommands(graph,brain,genome,enabled,edgesEnabled);
    if(!enabled||!edgesEnabled)return [0,0,0];
    const p=graph.learning,values=genome.policyWeights;
    if(genome.adapterVersion!==p.version||!Learning.valid(graph,values))throw Error('Policy Decoder 7 incompatibile.');
    const features=brain.policyFeatures?.length===p.featureCount?brain.policyFeatures:(brain.policyFeatures=new Float64Array(p.featureCount));
    let signal=0,steering=0,throttle=0,brake=0;
    for(let j=0;j<p.nodes.length;j++){
      const activity=Number(brain.activity[p.nodes[j]])||0;signal=Math.max(signal,Math.abs(activity));
      const feature=features[j]=Math.tanh(8*activity),offset=p.readoutOffset+j*p.readoutStride;
      steering+=feature*values[offset]*p.featureNorm;
      throttle+=feature*values[offset+1]*p.featureNorm;
      brake+=feature*values[offset+2]*p.featureNorm;
    }
    if(p.nonlinear)for(let j=0;j<p.nodes.length;j++){
      const feature=features[p.nodes.length+j]=Math.tanh(32*((Number(brain.activity[p.nodes[j]])||0)-values[p.thresholdOffset+j]));
      const offset=p.readoutOffset+(p.nodes.length+j)*p.readoutStride;
      steering+=feature*values[offset]*p.featureNorm;
      throttle+=feature*values[offset+1]*p.featureNorm;
      brake+=feature*values[offset+2]*p.featureNorm;
    }
    if(signal<1e-7)return [0,0,0];
    return [Math.tanh(steering+values[p.biasOffset]),Math.max(0,Math.tanh(throttle+values[p.biasOffset+1])),Math.max(0,Math.tanh(brake+values[p.biasOffset+2]))];
  }
  function localMutation(graph,values,r,amount,motorOnly=false,focus=null){
    const p=graph.learning;if(p?.actionCount!==3)return baseLocalMutation(graph,values,r,amount);
    const scale=Math.max(0,amount)/.16;if(!scale)return values.slice();
    const block=Math.floor(r()*(motorOnly?3:6));
    const focusedActions=focus==='longitudinal'?[1,2]:focus==='steering'?[0]:focus==='combined'?[0,1,2]:null;
    return values.map((v,i)=>{
      let chosen=false;
      if(motorOnly){
        const action=i>=p.biasOffset?i-p.biasOffset:i>=p.readoutOffset&&i<p.thresholdOffset?(i-p.readoutOffset)%p.readoutStride:-1;
        chosen=focusedActions?focusedActions.includes(action):action===block;
      }else if(block<3){
        const action=i>=p.biasOffset?i-p.biasOffset:i>=p.readoutOffset&&i<p.thresholdOffset?(i-p.readoutOffset)%p.readoutStride:-1;
        chosen=action===block;
      }else if(block===3)chosen=i<28*2;
      else if(block===4)chosen=i>=28*2&&i<p.readoutOffset;
      else chosen=i>=p.thresholdOffset&&i<p.biasOffset;
      return chosen?Math.max(-8,Math.min(8,v+Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r())*p.scales[i]*scale)):v;
    });
  }
  function safeMotorMutation(graph,values,r,amount,experience=null,focus=null){
    // Match Simulation's focused mutation contract. Decoder7 has distinct gas
    // and brake heads, so longitudinal focus must mutate both heads and never
    // spend offspring on steering. Activity context is not used in this local
    // action-block mutation; sensory and recurrent weights stay untouched.
    return localMutation(graph,values,r,amount*.35,true,focus);
  }
  Learning.build=build;Learning.commands=commands;Learning.localMutation=localMutation;Learning.safeMotorMutation=safeMotorMutation;
  Learning.supportedVersion=version=>version===7||baseSupportedVersion(version);
  return ()=>{Learning.build=baseBuild;Learning.commands=baseCommands;Learning.localMutation=baseLocalMutation;Learning.safeMotorMutation=baseSafeMotorMutation;Learning.supportedVersion=baseSupportedVersion;};
}

function signedCommands(Learning,graph,brain,genome,enabled=true,edgesEnabled=true,fallback=Learning.commands){
  const p=graph.learning;
  if(p?.actionCount!==3||p?.version!==7)throw Error('La decodifica longitudinale firmata richiede il decoder7.');
  if(!enabled||!edgesEnabled)return [0,0,0];
  const values=genome.policyWeights;
  if(genome.adapterVersion!==p.version||!Learning.valid(graph,values))throw Error('Policy Decoder 7 incompatibile.');
  const features=brain.policyFeatures?.length===p.featureCount?brain.policyFeatures:(brain.policyFeatures=new Float64Array(p.featureCount));
  let signal=0,steering=0,gasLogit=0,brakeLogit=0;
  for(let j=0;j<p.nodes.length;j++){
    const activity=Number(brain.activity[p.nodes[j]])||0;signal=Math.max(signal,Math.abs(activity));
    const feature=features[j]=Math.tanh(8*activity),offset=p.readoutOffset+j*p.readoutStride;
    steering+=feature*values[offset]*p.featureNorm;
    gasLogit+=feature*values[offset+1]*p.featureNorm;
    brakeLogit+=feature*values[offset+2]*p.featureNorm;
  }
  if(p.nonlinear)for(let j=0;j<p.nodes.length;j++){
    const feature=features[p.nodes.length+j]=Math.tanh(32*((Number(brain.activity[p.nodes[j]])||0)-values[p.thresholdOffset+j]));
    const offset=p.readoutOffset+(p.nodes.length+j)*p.readoutStride;
    steering+=feature*values[offset]*p.featureNorm;
    gasLogit+=feature*values[offset+1]*p.featureNorm;
    brakeLogit+=feature*values[offset+2]*p.featureNorm;
  }
  if(signal<1e-7)return [0,0,0];
  const longitudinal=Math.tanh((gasLogit+values[p.biasOffset+1]-brakeLogit-values[p.biasOffset+2])*.5);
  return [Math.tanh(steering+values[p.biasOffset]),Math.max(0,longitudinal),Math.max(0,-longitudinal)];
}

function contextSafeMotorMutation(graph,values,r,amount,experience=null,focus=null){
  const p=graph.learning;
  if(p?.actionCount!==3)return values.slice();
  const scale=Math.max(0,amount)/.16;if(!scale)return values.slice();
  const centres=experience?.centres?.filter(c=>c.values?.length===p.featureCount&&c.values.every(Number.isFinite)&&c.count>0);
  if(!centres?.length)return localMutation(graph,values,r,amount*.35,true,focus);
  const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
  const orthogonal=(vector,basis)=>{
    const result=vector.slice();
    for(let pass=0;pass<2;pass++)for(const anchor of basis){const projection=dot(result,anchor);for(let i=0;i<result.length;i++)result[i]-=projection*anchor[i];}
    return result;
  };
  const featureNorm=p.featureNorm||1/Math.sqrt(p.featureCount);
  const contextVector=centre=>[...centre.values.map(value=>value*featureNorm),1];
  const sorted=centres.slice().sort((a,b)=>b.count-a.count),basis=[];
  const anchor=contextVector(sorted[0]);
  let anchorLength=Math.sqrt(dot(anchor,anchor));
  if(anchorLength>1e-9)basis.push(anchor.map(value=>value/anchorLength));
  const contrasts=centres.map(centre=>{const vector=orthogonal(contextVector(centre),basis);return {vector,norm2:dot(vector,vector)};}).filter(item=>item.norm2>1e-5);
  let direction,target;
  if(contrasts.length){
    let draw=r()*contrasts.reduce((sum,item)=>sum+item.norm2,0),chosen=contrasts.at(-1);
    for(const item of contrasts){draw-=item.norm2;if(draw<=0){chosen=item;break;}}
    direction=chosen.vector;target=Math.sqrt(chosen.norm2);
    if(r()<.5){direction=orthogonal(Array.from({length:p.featureCount+1},()=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r())),basis);target=Math.sqrt(dot(direction,direction));}
  }else{
    direction=orthogonal(Array.from({length:p.featureCount+1},()=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r())),basis);
    target=Math.sqrt(dot(direction,direction));
  }
  if(!(target>1e-7))return values.slice();
  const focusedActions=focus==='longitudinal'?[1,2]:focus==='steering'?[0]:focus==='combined'?[0,1,2]:[Math.floor(r()*3)],child=values.slice();
  for(const action of focusedActions){
    const magnitude=Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r())*.24*scale;
    const delta=direction.map(value=>value*magnitude/target);let shrink=1;
    const indices=Array.from({length:p.featureCount},(_,index)=>p.readoutOffset+index*p.readoutStride+action);indices.push(p.biasOffset+action);
    for(let j=0;j<indices.length;j++)if(delta[j])shrink=Math.min(shrink,Math.max(0,(8-Math.abs(values[indices[j]]))/Math.abs(delta[j])));
    for(let j=0;j<indices.length;j++)child[indices[j]]+=delta[j]*Math.min(1,shrink)*(1-1e-12);
  }
  return child;
}

function model(source){return {...Decoder6.model(source),policyConfig:{...POLICY},modelLabel:'V3 · decoder 7 sperimentale (gas/freno separati)'};}
function transfer(values,oldPolicy,newPolicy,signed=true){
  if(oldPolicy.version!==6||newPolicy.version!==7||oldPolicy.readoutOffset!==newPolicy.readoutOffset||oldPolicy.featureCount!==newPolicy.featureCount||JSON.stringify(Array.from(oldPolicy.nodes))!==JSON.stringify(Array.from(newPolicy.nodes))||!Array.isArray(values)||values.length!==oldPolicy.length)throw Error('Trasferimento decoder 6→7 non supportato.');
  const result=Array(newPolicy.length).fill(0);
  for(let i=0;i<oldPolicy.readoutOffset;i++)result[i]=values[i];
  for(let j=0;j<oldPolicy.featureCount;j++){
    const from=oldPolicy.readoutOffset+j*2,to=newPolicy.readoutOffset+j*3;
    result[to]=values[from];result[to+1]=values[from+1];result[to+2]=signed?-values[from+1]:values[from+1];
  }
  for(let j=0;j<oldPolicy.nodes.length;j++)result[newPolicy.thresholdOffset+j]=values[oldPolicy.thresholdOffset+j];
  result[newPolicy.biasOffset]=values[oldPolicy.length-2];
  result[newPolicy.biasOffset+1]=values[oldPolicy.length-1];
  result[newPolicy.biasOffset+2]=signed?-values[oldPolicy.length-1]:values[oldPolicy.length-1];
  return result;
}
function genome(value,oldPolicy,newPolicy){
  if(value===null)return null;
  if(value.adapterVersion!==6)throw Error('Genoma originale non decoder 6.');
  return {...Decoder6.F.cloneGenome(value),adapterVersion:7,policyWeights:transfer(value.policyWeights,oldPolicy,newPolicy)};
}
function migrate(payload,oldPolicy,newPolicy,newGraph,P){
  const copy=JSON.parse(JSON.stringify(payload)),map=g=>genome(g,oldPolicy,newPolicy);
  for(const worker of copy.workers){
    const state=worker.state;state.genomes=state.genomes.map(map);state.champion=map(state.champion);state.externalChampion=map(state.externalChampion);
    state.hallOfFame=state.hallOfFame.map(item=>({...item,genome:map(item.genome)}));
    state.optimizer={...state.optimizer,mean:transfer(state.optimizer.mean,oldPolicy,newPolicy),sigma:transfer(state.optimizer.sigma,oldPolicy,newPolicy,false)};
    state.history=[];
  }
  if(copy.globalChampion)copy.globalChampion.genome=map(copy.globalChampion.genome);
  copy.graph=P.compatibleGraph(newGraph);return copy;
}

module.exports={Decoder6,POLICY,model,expand,install,transfer,genome,migrate,contextSafeMotorMutation,signedCommands};
