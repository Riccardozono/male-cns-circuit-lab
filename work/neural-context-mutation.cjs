'use strict';

// Experimental readout search in the null space of observed recurrent contexts.
// No sensors, positions, target controls or anatomical rewiring enter here.
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const normal=r=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());
function project(vector,basis){
  const result=vector.slice();
  for(let pass=0;pass<2;pass++)for(const anchor of basis){const d=dot(result,anchor);for(let j=0;j<result.length;j++)result[j]-=d*anchor[j];}
  return result;
}
function mutate(graph,values,random,amount,experience,{anchorCount=4,focus=null,outputTrust=0}={}){
  const p=graph.learning,featureCount=p.featureCount??p.nodes.length,actionCount=p.actionCount??2;
  const stride=p.readoutStride??2,biasOffset=p.biasOffset??values.length-actionCount,featureNorm=p.featureNorm??1/Math.sqrt(p.nodes.length);
  if(!Number.isInteger(anchorCount)||anchorCount<1||anchorCount>8)throw Error('Anchor count must be in [1,8].');
  if(!Number.isFinite(outputTrust)||outputTrust<0||outputTrust>4)throw Error('Output trust must be in [0,4].');
  const centres=(experience?.centres||[]).filter(c=>c.count>0&&c.values?.length===featureCount&&c.values.every(Number.isFinite)).slice().sort((a,b)=>b.count-a.count);
  const audit={applied:false,anchors:0,actions:[],maxAnchorLogitDrift:0,changedCoefficients:0,clipped:false,maxNormalizedRmsChange:0,maxNormalizedContextChange:0};
  if(!(amount>0)||!centres.length)return {weights:values.slice(),audit};
  const vector=c=>[...c.values.map(v=>v*featureNorm),1],basis=[];
  for(const centre of centres.slice(0,anchorCount)){
    const row=project(vector(centre),basis),length=Math.sqrt(dot(row,row));
    if(length>1e-8)basis.push(row.map(v=>v/length));
  }
  audit.anchors=basis.length;
  const contrasts=centres.map(c=>{const direction=project(vector(c),basis);return {direction,norm2:dot(direction,direction)};}).filter(c=>c.norm2>1e-6);
  if(!contrasts.length)return {weights:values.slice(),audit};
  let draw=random()*contrasts.reduce((sum,c)=>sum+c.norm2,0),chosen=contrasts.at(-1);
  for(const candidate of contrasts){draw-=candidate.norm2;if(draw<=0){chosen=candidate;break;}}
  const roll=random(),longitudinal=Array.from({length:actionCount-1},(_,i)=>i+1);
  const actions=focus==='steering'?[0]:focus==='longitudinal'?longitudinal:focus==='combined'?Array.from({length:actionCount},(_,i)=>i):roll<.35?[0]:roll<.7?longitudinal:Array.from({length:actionCount},(_,i)=>i);
  const weights=values.slice();
  for(const action of actions){
    const magnitude=normal(random)*.24*amount/.16;
    const delta=chosen.direction.map(v=>v*magnitude/chosen.norm2),length=Math.sqrt(dot(delta,delta));
    let shrink=length>6?6/length:1;
    const indices=Array.from({length:featureCount},(_,j)=>p.readoutOffset+j*stride+action);indices.push(biasOffset+action);
    let trustBudget=null,responses=null,totalCount=0;
    if(outputTrust){
      if(!p.scales||indices.some(i=>!Number.isFinite(p.scales[i])))throw Error('Output trust requires the decoder mutation scales.');
      let variance=0,squaredChange=0,maximumChange=0;
      responses=centres.map(c=>{const x=vector(c),response=dot(delta,x);totalCount+=c.count;
        variance+=c.count*x.reduce((sum,v,j)=>sum+(v*p.scales[indices[j]])**2,0);squaredChange+=c.count*response**2;maximumChange=Math.max(maximumChange,Math.abs(response));return response;});
      // Match the expected output-space radius of the existing local mutator,
      // measured on the parent's own observed contexts. No preferred action.
      trustBudget=outputTrust*.35*amount/.16*Math.sqrt(variance/totalCount);
      if(squaredChange>0)shrink=Math.min(shrink,trustBudget/Math.sqrt(squaredChange/totalCount));
      if(maximumChange>0)shrink=Math.min(shrink,4*trustBudget/maximumChange);
    }
    for(let j=0;j<indices.length;j++)if(delta[j])shrink=Math.min(shrink,Math.max(0,(8-Math.abs(values[indices[j]]))/Math.abs(delta[j])));
    if(shrink<1)audit.clipped=true;
    const actual=delta.map(v=>v*shrink*(1-1e-12));
    if(trustBudget>0){
      const rms=Math.sqrt(responses.reduce((sum,v,j)=>sum+centres[j].count*(v*shrink)**2,0)/totalCount);
      audit.maxNormalizedRmsChange=Math.max(audit.maxNormalizedRmsChange,rms/trustBudget);
      audit.maxNormalizedContextChange=Math.max(audit.maxNormalizedContextChange,...responses.map(v=>Math.abs(v*shrink)/trustBudget));
    }
    for(let j=0;j<indices.length;j++){weights[indices[j]]+=actual[j];if(actual[j])audit.changedCoefficients++;}
    for(const centre of centres.slice(0,anchorCount))audit.maxAnchorLogitDrift=Math.max(audit.maxAnchorLogitDrift,Math.abs(dot(actual,vector(centre))));
  }
  audit.applied=true;audit.actions=actions;
  if(audit.maxAnchorLogitDrift>1e-8||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Context mutation violated its anchor or parameter bounds.');
  return {weights,audit};
}
module.exports={mutate};
