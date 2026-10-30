'use strict';
// Private state-head archive for the brake-lock DEV copy. This stays isolated
// from the shared CUDA archive so other save identities and learners do not change.
const normal=r=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());
const unsafe=new Set(['urto','fuori pista','progresso non valido']);
const copy=r=>({...r,weights:r.weights.slice(),...(r.lapTimes?{lapTimes:r.lapTimes.slice()}:{}),
  ...(r.rewardDirectedContext?{rewardDirectedContext:{...r.rewardDirectedContext,features:r.rewardDirectedContext.features.slice()}}:{})});
class Archive {
  static restore(s){
    const a=new Archive(s);if(!Array.isArray(s.cells)||s.cells.length>10000||!Number.isInteger(s.evaluations)||s.evaluations<0)throw Error('Invalid recorded state-head archive');
    for(const cell of s.cells){const {key,...r}=cell;a.validate(r);const expected=Math.floor(r.progress/a.binMetres)+':'+(unsafe.has(r.reason)?'unsafe':'clean');if(key!==expected||r.censored||r.overlap||r.reason==='progresso non valido'||a.cells.has(key))throw Error('Invalid recorded state-head archive cell');a.cells.set(key,copy(r));}
    a.validate(s.champion);if(s.champion.censored||s.champion.overlap||unsafe.has(s.champion.reason))throw Error('A genuine clean protected state-head champion is required');a.champion=copy(s.champion);a.evaluations=s.evaluations;return a;
  }
  constructor({dimensions=18,binMetres=25,maxProgress,population=16}){
    if(dimensions!==18||!Number.isFinite(binMetres)||binMetres<=0||!Number.isFinite(maxProgress)||maxProgress<=0||!Number.isInteger(population)||population<4||population>100)throw Error('An 18-coefficient state-head archive is required');
    Object.assign(this,{dimensions,binMetres,maxProgress,population});this.cells=new Map();this.champion=null;this.evaluations=0;
  }
  validate(r){
    if(!r||!Array.isArray(r.weights)||r.weights.length!==this.dimensions||r.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8)||!Number.isFinite(r.fitness)||!Number.isFinite(r.progress)||r.progress<0||r.progress>this.maxProgress+1e-6||!Number.isInteger(r.laps)||r.laps<0||r.laps>2||typeof r.reason!=='string'||typeof r.censored!=='boolean'||!Number.isInteger(r.overlap)||r.overlap<0)throw Error('Invalid actual state-head candidate');
    const context=r.rewardDirectedContext;if(context&&(!Array.isArray(context.features)||context.features.length!==9||context.features.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||context.features[0]!==1||!Number.isFinite(context.gate)||context.gate<=0||context.gate>1||!Number.isFinite(context.brakeLockPenalty)||context.brakeLockPenalty<=0||!Number.isFinite(context.progress)||context.progress<0||context.progress>this.maxProgress+1e-6||!Number.isInteger(context.laps)||context.laps<0||context.laps>2||!['troppo lenta / senza progresso','ferma / senza progresso'].includes(context.reason)))throw Error('Invalid reward-directed observed neural context');
    if(r.terminalSlow===true&&(!Array.isArray(r.terminalContextFeatures)||r.terminalContextFeatures.length!==9||r.terminalContextFeatures.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||r.terminalContextFeatures[0]!==1||!Number.isFinite(r.terminalGate)||r.terminalGate<=0||r.terminalGate>1||!Number.isFinite(r.brakeLockPenalty)||r.brakeLockPenalty<=0||!['troppo lenta / senza progresso','ferma / senza progresso'].includes(r.reason)))throw Error('Invalid terminal neuronal context');
  }
  rebase(reference,rules){
    if(reference!==null&&(!Number.isFinite(reference)||reference<=0))throw Error('Invalid actual previous lap reference');
    const update=r=>{const base=r.baseFitness??r.fitness,times=r.lapTimes||[];if(!Number.isFinite(base)||times.length!==r.laps||times.some(v=>!Number.isFinite(v)||v<=0))throw Error('Recorded actual lap times required');const penalty=reference===null?0:times.reduce((s,t)=>s+Math.min(rules.regressionCapPerLap,rules.regressionFactor*Math.max(0,t/reference-1)),0);return {...r,baseFitness:base,lapTimes:times.slice(),fitness:base-penalty,comparisonPenalty:penalty};};
    for(const [key,r]of this.cells)this.cells.set(key,update(r));if(this.champion)this.champion=update(this.champion);
  }
  offer(r){
    this.validate(r);this.evaluations++;if(r.censored||r.overlap||r.reason==='progresso non valido')return {accepted:false,promoted:false};
    const category=unsafe.has(r.reason)?'unsafe':'clean',key=Math.floor(r.progress/this.binMetres)+':'+category,old=this.cells.get(key),accepted=!old||r.fitness>old.fitness;if(accepted)this.cells.set(key,copy(r));
    const sameProgressBand=this.champion&&Math.floor(r.progress/this.binMetres)>=Math.floor(this.champion.progress/this.binMetres);
    const promoted=category==='clean'&&(!this.champion||r.fitness>this.champion.fitness&&(r.progress>=this.champion.progress||sameProgressBand)&&r.laps>=this.champion.laps);
    if(promoted)this.champion=copy(r);return {accepted,promoted,key};
  }
  ask(random,{strength=1}={}){
    if(!Number.isFinite(strength)||strength<0||strength>3)throw Error('Invalid state-head mutation strength');
    if(typeof random!=='function'||!this.champion||!this.cells.size)throw Error('Observed archive and genuine champion required');
    const all=[...this.cells.values()],safe=all.filter(r=>!unsafe.has(r.reason));if(!safe.length)safe.push(this.champion);const furthest=Math.max(...safe.map(r=>r.progress)),frontier=safe.filter(r=>r.progress>=furthest-150),unsafeFrontier=all.filter(r=>unsafe.has(r.reason)&&Math.abs(r.progress-furthest)<=150),scales=[.02,.05,.1,.2,.5,1,2],pick=rows=>rows[Math.min(rows.length-1,Math.floor(random()*rows.length))];
    const riskyPairs=[];
    const candidates=[{weights:this.champion.weights.slice(),kind:'protected-champion'}];if(strength===0)return Array.from({length:this.population},()=>({weights:this.champion.weights.slice(),kind:'protected-champion'}));
    const context=this.champion.rewardDirectedContext;
    if(context){for(const step of [.08,.16,.24,.32]){
      if(candidates.length>=this.population)break;
      const sigma=step*strength,weights=this.champion.weights.map((value,index)=>index%2===1?
        Math.max(-8,Math.min(8,value+sigma*context.features[Math.floor(index/2)])):value);
      if(weights.some((value,index)=>value!==this.champion.weights[index]))candidates.push({weights,kind:'reward-directed-slow-context',
        parentWeights:this.champion.weights.slice(),contextFeatures:context.features.slice(),sigma});
    }}
    const remaining=this.population-candidates.length,riskyOffspring=Math.round(remaining*.25),fullPairs=Math.floor(remaining/2),riskyPairCount=unsafeFrontier.length?Math.min(fullPairs,Math.ceil(riskyOffspring/2)):0;riskyPairs.length=Math.ceil(remaining/2);riskyPairs.fill(false);for(let i=0;i<riskyPairCount;i++)riskyPairs[i]=true;
    if(unsafeFrontier.length)for(let i=fullPairs-1;i>0;i--){const j=Math.floor(random()*(i+1));[riskyPairs[i],riskyPairs[j]]=[riskyPairs[j],riskyPairs[i]];}
    let pair=0,riskyOffspringUsed=0;
    while(candidates.length<this.population){const risky=Boolean(unsafeFrontier.length&&riskyPairs[pair]),p=risky?pick(unsafeFrontier):random()<.7?this.champion:pick(frontier),block=['longitudinal','longitudinal','steering','joint'][pair%4],sigma=pick(scales)*strength;
      const delta=p.weights.map((_,j)=>{const value=normal(random)*sigma;return block==='longitudinal'&&j%2===0||block==='steering'&&j%2===1?0:j%2===0?value*.15:value;});
      for(const sign of [1,-1]){if(candidates.length>=this.population||risky&&riskyOffspringUsed>=riskyOffspring)break;const weights=p.weights.map((v,j)=>Math.max(-8,Math.min(8,v+sign*delta[j])));candidates.push({weights,kind:'block-antithetic-mutation',block,pair,sign,parentWeights:p.weights.slice(),parentProgress:p.progress,sigma});if(risky)riskyOffspringUsed++;}pair++;
    }
    return candidates;
  }
  snapshot(){return {dimensions:this.dimensions,binMetres:this.binMetres,maxProgress:this.maxProgress,population:this.population,evaluations:this.evaluations,champion:this.champion&&copy(this.champion),cells:[...this.cells.entries()].map(([key,r])=>({key,...copy(r)}))};}
}
module.exports={Archive};
