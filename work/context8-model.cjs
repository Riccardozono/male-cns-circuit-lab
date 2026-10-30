'use strict';
const path=require('node:path');
const runtime=path.resolve(__dirname,'../.impeccable/experimental-context8'),F=require(path.join(runtime,'outputs/simulation.js')),
  P=require(path.join(runtime,'outputs/progress-save.js')),L=require(path.join(runtime,'outputs/neural-learning.js')),Legacy=require('../outputs/legacy-models.js');
function model(source){return {...Legacy.tagV3(source),policyConfig:{version:8,gainGroups:16,readoutLimit:64,contextCount:12},modelLabel:'V3 · contesti neurali normalizzati 8'};}
function transfer(values,oldPolicy,newPolicy,fill=0){
  if(oldPolicy.version!==3||newPolicy.version!==8||oldPolicy.length!==202||newPolicy.length!==1070||!Array.isArray(values)||values.length!==202||JSON.stringify(Array.from(oldPolicy.nodes))!==JSON.stringify(Array.from(newPolicy.nodes)))throw Error('Trasferimento contesti non supportato.');
  const result=Array.isArray(fill)?fill.slice():Array(newPolicy.length).fill(fill);
  for(let i=0;i<200;i++)result[i]=values[i];result[newPolicy.length-2]=values[200];result[newPolicy.length-1]=values[201];return result;
}
function genome(g,a,b){return g===null?null:{...F.cloneGenome(g),adapterVersion:8,policyWeights:transfer(g.policyWeights,a,b)};}
function migrate(payload,oldGraph,newGraph){
  const result=JSON.parse(JSON.stringify(payload)),a=oldGraph.learning,b=F.ensureLearning(newGraph),map=g=>genome(g,a,b);
  for(const w of result.workers){const s=w.state;s.genomes=s.genomes.map(map);s.champion=map(s.champion);s.externalChampion=map(s.externalChampion);s.hallOfFame=s.hallOfFame.map(h=>({...h,genome:map(h.genome)}));s.optimizer={...s.optimizer,mean:transfer(s.optimizer.mean,a,b),sigma:transfer(s.optimizer.sigma,a,b,b.scales)};s.history=[];}
  if(result.globalChampion)result.globalChampion.genome=map(result.globalChampion.genome);result.graph=P.compatibleGraph(newGraph);return result;
}
module.exports={runtime,F,P,L,model,transfer,genome,migrate};
