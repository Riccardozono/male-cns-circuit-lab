'use strict';
// A bounded archive of learned parameters, inspired by MAP-Elites archives:
// https://arxiv.org/abs/1504.04909. This is a project-specific variant, not a
// reproduction of that paper. Descriptors evaluate behavior, never drive it.
const normal=r=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());
const unsafe=new Set(['urto','fuori pista','progresso non valido']);
const copy=r=>({...r,weights:r.weights.slice(),...(r.lapTimes?{lapTimes:r.lapTimes.slice()}:{})});
class Archive {
  static restore(s){
    const a=new Archive(s);if(!Array.isArray(s.cells)||s.cells.length>10000||!Number.isInteger(s.evaluations)||s.evaluations<0)throw Error('Invalid recorded archive state');
    for(const cell of s.cells){const {key,...r}=cell;a.validate(r);const expected=Math.floor(r.progress/a.binMetres)+':'+(unsafe.has(r.reason)?'unsafe':'clean');if(key!==expected||r.censored||r.overlap||r.reason==='progresso non valido'||a.cells.has(key))throw Error('Invalid recorded archive cell');a.cells.set(key,copy(r));}
    a.validate(s.champion);if(s.champion.censored||s.champion.overlap||unsafe.has(s.champion.reason))throw Error('A genuine clean protected champion is required');
    a.champion=copy(s.champion);a.evaluations=s.evaluations;return a;
  }
  constructor({dimensions=10,binMetres=25,maxProgress,population=48}){
    if(dimensions!==18||!Number.isFinite(binMetres)||binMetres<=0||!Number.isFinite(maxProgress)||maxProgress<=0||!Number.isInteger(population)||population<4||population>100)throw Error('An18-coefficient projected archive is required');
    Object.assign(this,{dimensions,binMetres,maxProgress,population});this.cells=new Map();this.champion=null;this.evaluations=0;
  }
  validate(r){
    if(!r||!Array.isArray(r.weights)||r.weights.length!==this.dimensions||r.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8)||!Number.isFinite(r.fitness)||!Number.isFinite(r.progress)||r.progress<0||r.progress>this.maxProgress+1e-6||!Number.isInteger(r.laps)||r.laps<0||r.laps>2||typeof r.reason!=='string'||typeof r.censored!=='boolean'||!Number.isInteger(r.overlap)||r.overlap<0)throw Error('Invalid actual learned candidate');
  }
  rebase(reference,rules){
    if(reference!==null&&(!Number.isFinite(reference)||reference<=0))throw Error('Invalid actual previous lap reference');
    const update=r=>{const base=r.baseFitness??r.fitness,times=r.lapTimes||[];if(!Number.isFinite(base)||times.length!==r.laps||times.some(v=>!Number.isFinite(v)||v<=0))throw Error('Recorded actual lap times required');const penalty=reference===null?0:times.reduce((s,t)=>s+Math.min(rules.regressionCapPerLap,rules.regressionFactor*Math.max(0,t/reference-1)),0);return {...r,baseFitness:base,lapTimes:times.slice(),fitness:base-penalty,comparisonPenalty:penalty};};
    for(const [key,r]of this.cells)this.cells.set(key,update(r));if(this.champion)this.champion=update(this.champion);
  }
  offer(r){
    this.validate(r);this.evaluations++;
    if(r.censored||r.overlap||r.reason==='progresso non valido')return {accepted:false,promoted:false};
    const category=unsafe.has(r.reason)?'unsafe':'clean',key=Math.floor(r.progress/this.binMetres)+':'+category,old=this.cells.get(key);
    const accepted=!old||r.fitness>old.fitness;if(accepted)this.cells.set(key,copy(r));
    const promoted=category==='clean'&&(!this.champion||r.fitness>this.champion.fitness&&r.progress>=this.champion.progress&&r.laps>=this.champion.laps);
    if(promoted)this.champion=copy(r);return {accepted,promoted,key};
  }
  ask(random,{strength=1}={}){
    if(!Number.isFinite(strength)||strength<0||strength>3)throw Error('Invalid native mutation strength');
    if(typeof random!=='function'||!this.champion||!this.cells.size)throw Error('Observed archive and genuine protected champion required');
    const all=[...this.cells.values()],furthest=Math.max(...all.map(r=>r.progress)),frontier=all.filter(r=>r.progress>=furthest-150),scales=[.02,.05,.1,.2,.5,1,2];
    const pick=rows=>rows[Math.min(rows.length-1,Math.floor(random()*rows.length))];
    const candidates=[{weights:this.champion.weights.slice(),kind:'protected-champion'}];
    if(strength===0)return Array.from({length:this.population},()=>({weights:this.champion.weights.slice(),kind:'protected-champion'}));
    let pair=0;
    while(candidates.length<this.population){
      const p=random()<.7?this.champion:pick(frontier),block=['longitudinal','longitudinal','steering','joint'][pair%4],sigma=pick(scales)*strength;
      const delta=p.weights.map((_,j)=>{const value=normal(random)*sigma;return block==='longitudinal'&&j%2===0||block==='steering'&&j%2===1?0:j%2===0?value*.15:value;});
      for(const sign of [1,-1]){if(candidates.length>=this.population)break;const weights=p.weights.map((v,j)=>Math.max(-8,Math.min(8,v+sign*delta[j])));candidates.push({weights,kind:'block-antithetic-mutation',block,pair,sign,parentWeights:p.weights.slice(),parentProgress:p.progress,sigma});}
      pair++;
    }
    return candidates;
  }
  snapshot(){return {dimensions:this.dimensions,binMetres:this.binMetres,maxProgress:this.maxProgress,population:this.population,evaluations:this.evaluations,champion:this.champion&&copy(this.champion),cells:[...this.cells.entries()].map(([key,r])=>({key,...copy(r)}))};}
}
module.exports={Archive};
