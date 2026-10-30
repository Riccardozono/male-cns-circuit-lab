'use strict';
const PPO=require('./ppo-neural.cjs');
class Actor{
  constructor(dimension,random,hidden=32){
    this.dimension=dimension;this.hidden=hidden;this.outputOffset=hidden*(dimension+1);this.weights=[];
    for(let h=0;h<hidden;h++){for(let j=0;j<dimension;j++)this.weights.push(PPO.normal(random)/Math.sqrt(dimension));this.weights.push(0);}
    for(let j=0;j<2*(hidden+1);j++)this.weights.push(0);
  }
  forward(x){
    if(x.length!==this.dimension)throw Error('Neuronal observation shape mismatch');
    const hidden=new Float64Array(this.hidden),mean=[0,0];
    for(let h=0;h<this.hidden;h++){let v=this.weights[h*(this.dimension+1)+this.dimension];for(let j=0;j<x.length;j++)v+=this.weights[h*(this.dimension+1)+j]*x[j];hidden[h]=Math.tanh(v);}
    for(let action=0;action<2;action++){const base=this.outputOffset+action*(this.hidden+1);let v=this.weights[base+this.hidden];for(let h=0;h<this.hidden;h++)v+=this.weights[base+h]*hidden[h];mean[action]=v;}
    return {hidden,mean};
  }
  gradient(x,loss){
    const {hidden}=this.forward(x),g=new Float64Array(this.weights.length);
    for(let action=0;action<2;action++){const base=this.outputOffset+action*(this.hidden+1);for(let h=0;h<this.hidden;h++)g[base+h]=loss[action]*hidden[h];g[base+this.hidden]=loss[action];}
    for(let h=0;h<this.hidden;h++){
      const delta=(loss[0]*this.weights[this.outputOffset+h]+loss[1]*this.weights[this.outputOffset+this.hidden+1+h])*(1-hidden[h]**2),base=h*(this.dimension+1);
      for(let j=0;j<x.length;j++)g[base+j]=delta*x[j];g[base+this.dimension]=delta;
    }
    return g;
  }
  snapshot(){return {dimension:this.dimension,hidden:this.hidden,weights:this.weights.slice()};}
}
function logits(graph,brain,genome,previous){
  const p=graph.learning,features=Array.from(brain.policyFeatures),norm=1/Math.sqrt(features.length),base=[0,0];
  for(let j=0;j<features.length;j++){base[0]+=features[j]*genome.policyWeights[p.readoutOffset+j*2]*norm;base[1]+=features[j]*genome.policyWeights[p.readoutOffset+j*2+1]*norm;}
  base[0]+=genome.policyWeights.at(-2);base[1]+=genome.policyWeights.at(-1);
  return {x:features.concat(features.map((v,i)=>v-previous[i]),base.map(Math.tanh)),base,features,active:p.nodes.some(i=>Math.abs(brain.activity[i])>=1e-7)};
}
function compose(observation,residual){
  if(!observation.active)return [0,0,0];
  const gate=observation.gate??1,steer=Math.tanh(observation.base[0]+gate*residual[0]),long=Math.tanh(observation.base[1]+gate*residual[1]);return [steer,Math.max(0,long),Math.max(0,-long)];
}
function update(actor,critic,actorAdam,criticAdam,rows,prefix,random,{epochs=4,batchSize=64,prefixStrength=.1,targetKl=.03}={}){
  PPO.normalizeAdvantages(rows);const old=rows.map(r=>actor.forward(r.x).mean),order=rows.map((_,i)=>i);let stopped=false,actorSteps=0,criticSteps=0,kl=0,loss=0;
  for(let epoch=0;epoch<epochs;epoch++){
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    for(let start=0;start<order.length;start+=batchSize){
      const ids=order.slice(start,start+batchSize),ga=Array(actor.weights.length).fill(0),gv=Array(critic.weights.length).fill(0);
      for(const i of ids){
        const row=rows[i],residual=actor.forward(row.x).mean,gate=row.gate??1,mean=residual.map((v,j)=>gate*v+row.base[j]+row.shift[j]),logp=PPO.logProbability(row.sample,mean,row.std),ratio=Math.exp(Math.max(-20,Math.min(20,logp-row.logp))),advantage=row.advantage;
        if(row.active&&!stopped&&!(advantage>=0?ratio>1.2:ratio<.8)){
          const derivative=mean.map((v,j)=>-advantage*ratio*(row.sample[j]-v)/(row.std[j]**2)*gate),g=actor.gradient(row.x,derivative);for(let j=0;j<ga.length;j++)ga[j]+=g[j]/ids.length;
        }
        const value=critic.gradient(row.criticFeatures,row.targetValue);loss+=value.loss;for(let j=0;j<gv.length;j++)gv[j]+=value.gradient[j]/ids.length;
      }
      if(!stopped&&prefix.length){
        for(let k=0;k<8;k++){const x=prefix[Math.floor(random()*prefix.length)],m=actor.forward(x).mean,g=actor.gradient(x,m.map(v=>v*prefixStrength/8));for(let j=0;j<ga.length;j++)ga[j]+=g[j];}
      }
      criticAdam.update(critic.weights,gv,1);criticSteps++;
      if(!stopped){
        actorAdam.update(actor.weights,ga,.5);actorSteps++;
        kl=rows.reduce((sum,r,i)=>{const now=actor.forward(r.x).mean;return sum+now.reduce((s,v,j)=>s+.5*(((r.gate??1)*(v-old[i][j]))/r.std[j])**2,0);},0)/rows.length;
        if(kl>targetKl)stopped=true;
      }
    }
  }
  return {actorSteps,criticSteps,approximateKl:kl,actorEarlyStopped:stopped,criticLoss:loss/(epochs*rows.length)};
}
function nearestDistance(x,prototypes){let best=Infinity;for(const other of prototypes){let sum=0;for(let j=0;j<x.length;j++)sum+=(x[j]-other[j])**2;best=Math.min(best,Math.sqrt(sum/x.length));}return best;}
function gate(x,protection){if(!protection)return 1;const value=Math.max(0,Math.min(1,(nearestDistance(x,protection.prototypes)-protection.radius)/protection.ramp));return value<1e-6?0:value;}
module.exports={Actor,logits,compose,update,nearestDistance,gate};
