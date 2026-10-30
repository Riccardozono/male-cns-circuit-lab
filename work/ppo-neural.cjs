'use strict';
// PPO-Clip over observations produced by real recurrent MaleCNS activity.
// Geometry, body coordinates, track IDs and teacher actions are not inputs.
// This experimental trainer is not the legacy ES saved-state format.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const normal=r=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function logProbability(sample,mean,std){return sample.reduce((sum,v,j)=>sum-.5*((v-mean[j])/std[j])**2-Math.log(std[j])-.5*Math.log(2*Math.PI),0);}
function gae(rows,gamma=.997,lambda=.98){
  let future=0;
  for(let i=rows.length-1;i>=0;i--){const row=rows[i],continuing=row.terminal?0:1,delta=row.reward+gamma*row.nextValue*continuing-row.value;future=delta+gamma*lambda*continuing*future;row.advantage=future;row.targetValue=future+row.value;}
  return rows;
}
function normalizeAdvantages(rows){const mean=rows.reduce((s,r)=>s+r.advantage,0)/rows.length,std=Math.sqrt(rows.reduce((s,r)=>s+(r.advantage-mean)**2,0)/rows.length)+1e-8;for(const row of rows)row.advantage=(row.advantage-mean)/std;return {mean,std};}
class Adam{
  constructor(size,rate=.001){this.m=Array(size).fill(0);this.v=Array(size).fill(0);this.steps=0;this.rate=rate;}
  update(values,gradient,maxNorm=.5){
    if(gradient.length!==values.length||gradient.some(v=>!Number.isFinite(v)))throw Error('Non-finite gradient');
    const norm=Math.sqrt(dot(gradient,gradient)),factor=norm>maxNorm?maxNorm/norm:1;this.steps++;
    const c1=1-.9**this.steps,c2=1-.999**this.steps;
    for(let i=0;i<values.length;i++){const g=gradient[i]*factor;this.m[i]=.9*this.m[i]+.1*g;this.v[i]=.999*this.v[i]+.001*g*g;values[i]=clamp(values[i]-this.rate*(this.m[i]/c1)/(Math.sqrt(this.v[i]/c2)+1e-8),-8,8);}
    return norm;
  }
}
class Actor{
  constructor(policy,genes){
    this.dimension=policy.nodes.length+policy.contextCount+1;this.indices=[];
    for(let j=0;j<this.dimension-1;j++)this.indices.push(policy.readoutOffset+j*2,policy.readoutOffset+j*2+1);
    this.indices.push(genes.length-2,genes.length-1);this.weights=this.indices.map(i=>genes[i]);
  }
  mean(features){const result=[0,0];for(let j=0;j<this.dimension;j++){result[0]+=features[j]*this.weights[j*2];result[1]+=features[j]*this.weights[j*2+1];}return result;}
  install(genes){const result=genes.slice();this.indices.forEach((index,j)=>result[index]=this.weights[j]);return result;}
}
function orthogonal(vector,basis){const result=vector.slice();for(let pass=0;pass<2;pass++)for(const b of basis){const projection=dot(result,b);for(let j=0;j<result.length;j++)result[j]-=projection*b[j];}return result;}
function prefixBasis(anchors){const basis=[];for(const features of anchors){const vector=orthogonal(features,basis),size=Math.sqrt(dot(vector,vector));if(size>1e-5)basis.push(vector.map(v=>v/size));}return basis;}
function projectActor(actor,reference,basis){
  for(let action=0;action<2;action++){
    const delta=orthogonal(Array.from({length:actor.dimension},(_,j)=>actor.weights[j*2+action]-reference.weights[j*2+action]),basis);let shrink=1;
    // One-sided updates must be allowed to leave a saturated parameter.
    // Using 8-|reference| incorrectly froze inward changes at either bound.
    for(let j=0;j<delta.length;j++)if(delta[j]){
      const value=reference.weights[j*2+action],room=delta[j]>0?8-value:8+value;
      shrink=Math.min(shrink,Math.max(0,room)/Math.abs(delta[j]));
    }
    for(let j=0;j<delta.length;j++)actor.weights[j*2+action]=reference.weights[j*2+action]+delta[j]*shrink;
  }
}
class Critic{
  constructor(dimension,random,hidden=16){
    this.dimension=dimension;this.hidden=hidden;this.outputOffset=(dimension+1)*hidden;this.weights=[];
    for(let h=0;h<hidden;h++){for(let j=0;j<dimension;j++)this.weights.push(normal(random)/Math.sqrt(dimension));this.weights.push(0);}
    for(let h=0;h<hidden;h++)this.weights.push(normal(random)*.1);this.weights.push(0);
  }
  forward(features){
    const hidden=[];for(let h=0;h<this.hidden;h++){let sum=this.weights[h*(this.dimension+1)+this.dimension];for(let j=0;j<this.dimension;j++)sum+=this.weights[h*(this.dimension+1)+j]*features[j];hidden.push(Math.tanh(sum));}
    let value=this.weights.at(-1);for(let h=0;h<this.hidden;h++)value+=hidden[h]*this.weights[this.outputOffset+h];return {value,hidden};
  }
  gradient(features,target){
    const {value,hidden}=this.forward(features),error=value-target,result=Array(this.weights.length).fill(0);result[result.length-1]=error;
    for(let h=0;h<this.hidden;h++){result[this.outputOffset+h]=error*hidden[h];const delta=error*this.weights[this.outputOffset+h]*(1-hidden[h]**2);for(let j=0;j<this.dimension;j++)result[h*(this.dimension+1)+j]=delta*features[j];result[h*(this.dimension+1)+this.dimension]=delta;}
    return {gradient:result,loss:.5*error*error,value};
  }
  snapshot(){return {dimension:this.dimension,hidden:this.hidden,weights:this.weights.slice()};}
  static restore(saved){const c=Object.create(Critic.prototype);Object.assign(c,{dimension:saved.dimension,hidden:saved.hidden,outputOffset:(saved.dimension+1)*saved.hidden,weights:saved.weights.slice()});return c;}
}
function neuralFeatures(graph,brain,genes,Learning,enabled=true,edgesEnabled=true){
  const p=graph.learning,norm=1/Math.sqrt(p.nodes.length),raw=Array.from(p.nodes,index=>Math.tanh(8*(Number(brain.activity[index])||0))),contexts=Learning.contextVector(graph,genes,raw);
  return {features:[...raw.map(v=>v*norm),...contexts.map(v=>v*norm),1],raw,active:enabled&&edgesEnabled&&p.nodes.some(index=>Math.abs(brain.activity[index])>=1e-7)};
}
function exploration(raw,prefix){
  let distance=Infinity;
  for(const other of prefix){let d=0;for(let j=0;j<raw.length;j++)d+=(raw[j]-other[j])**2;distance=Math.min(distance,Math.sqrt(d/raw.length));}
  const amount=Number.isFinite(distance)?clamp((distance-.02)/.12,.08,1):1;return [.24*amount,.24*amount];
}
function sampleAction(actor,observation,random,std,previousNoise=[0,0],rho=.75){
  const mean=actor.mean(observation.features);
  if(!observation.active)return {controls:[0,0,0],sample:mean,shift:[0,0],std:[1,1],logp:0,noise:[0,0],active:false};
  const shift=std.map((v,j)=>v*rho*previousNoise[j]),conditionalStd=std.map(v=>v*Math.sqrt(1-rho*rho)),noise=previousNoise.map(v=>rho*v+Math.sqrt(1-rho*rho)*normal(random)),sample=mean.map((v,j)=>v+std[j]*noise[j]);
  const steering=Math.tanh(sample[0]),longitudinal=Math.tanh(sample[1]);
  return {controls:[steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)],sample,shift,std:conditionalStd,logp:logProbability(sample,mean.map((v,j)=>v+shift[j]),conditionalStd),noise,active:true};
}
function actorGradient(actor,row,clip=.2){
  const mean=actor.mean(row.features).map((v,j)=>v+row.shift[j]),logp=logProbability(row.sample,mean,row.std),ratio=Math.exp(clamp(logp-row.logp,-20,20)),a=row.advantage;
  const clipped=a>=0?ratio>1+clip:ratio<1-clip,gradient=Array(actor.weights.length).fill(0);
  if(row.active!==false&&!clipped)for(let action=0;action<2;action++){const scale=-a*ratio*(row.sample[action]-mean[action])/(row.std[action]**2);for(let j=0;j<actor.dimension;j++)gradient[j*2+action]=scale*row.features[j];}
  return {gradient,loss:-Math.min(ratio*a,clamp(ratio,1-clip,1+clip)*a),clipped,ratio};
}
function update(actor,critic,rows,actorAdam,criticAdam,random,anchors=[],reference=null,{epochs=8,minibatch=128,anchorStrength=2,targetKl=.02,protectPrefix=true}={}){
  normalizeAdvantages(rows);let actorSteps=0,criticSteps=0,stopped=false,kl=0,criticLoss=0;
  const basis=protectPrefix&&reference?prefixBasis(anchors):[];
  const oldMeans=rows.map(row=>actor.mean(row.features));
  for(let epoch=0;epoch<epochs;epoch++){
    const order=Array.from({length:rows.length},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    for(let start=0;start<order.length;start+=minibatch){const subset=order.slice(start,start+minibatch),ga=Array(actor.weights.length).fill(0),gv=Array(critic.weights.length).fill(0);
      for(const index of subset){const row=rows[index],a=actorGradient(actor,row),v=critic.gradient(row.criticFeatures,row.targetValue);for(let j=0;j<ga.length;j++)ga[j]+=a.gradient[j]/subset.length;for(let j=0;j<gv.length;j++)gv[j]+=v.gradient[j]/subset.length;criticLoss+=v.loss/subset.length;}
      if(reference&&anchors.length&&!stopped){
        for(const features of anchors){const current=actor.mean(features),wanted=reference.mean(features);for(let action=0;action<2;action++){const difference=current[action]-wanted[action];for(let j=0;j<actor.dimension;j++)ga[j*2+action]+=anchorStrength*difference*features[j]/anchors.length;}}
      }
      criticAdam.update(critic.weights,gv,1);criticSteps++;
      if(!stopped){
        if(basis.length)for(let action=0;action<2;action++){const projected=orthogonal(Array.from({length:actor.dimension},(_,j)=>ga[j*2+action]),basis);for(let j=0;j<actor.dimension;j++)ga[j*2+action]=projected[j];}
        actorAdam.update(actor.weights,ga,.5);if(basis.length)projectActor(actor,reference,basis);actorSteps++;
        kl=rows.reduce((sum,row,i)=>{const current=actor.mean(row.features);return sum+current.reduce((s,v,j)=>s+.5*((v-oldMeans[i][j])/row.std[j])**2,0);},0)/rows.length;
        if(kl>targetKl)stopped=true;
      }
    }
  }
  return {actorSteps,criticSteps,kl,actorEarlyStopped:stopped,criticLoss:criticLoss/criticSteps};
}
module.exports={normal,logProbability,gae,normalizeAdvantages,Adam,Actor,Critic,neuralFeatures,exploration,sampleAction,actorGradient,orthogonal,prefixBasis,projectActor,update};
