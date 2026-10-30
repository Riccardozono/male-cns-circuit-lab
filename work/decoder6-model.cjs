'use strict';
// Explicit, isolated experiment. Decoder revision 6 is NOT a new anatomical
// V6 model, application version, or a compatible replacement for old saves.
const path=require('node:path');
const runtime=path.resolve(__dirname,'../.impeccable/experimental-decoder6');
const F=require(path.join(runtime,'outputs/simulation.js'));
const P=require(path.join(runtime,'outputs/progress-save.js'));
const L=require(path.join(runtime,'outputs/neural-learning.js'));
const Legacy=require(path.join(runtime,'outputs/legacy-models.js'));
const POLICY=Object.freeze({version:6,gainGroups:16,readoutLimit:64,nonlinearReadout:true});
function model(source){return {...Legacy.tagV3(source),policyConfig:{...POLICY},modelLabel:'V3 · decoder 6 sperimentale'};}
function transfer(values,oldPolicy,newPolicy,fill=0){
  if(oldPolicy.version!==3||newPolicy.version!==6||oldPolicy.length!==202||newPolicy.length!==394||
    oldPolicy.readoutOffset!==newPolicy.readoutOffset||JSON.stringify(Array.from(oldPolicy.nodes))!==JSON.stringify(Array.from(newPolicy.nodes))||
    !Array.isArray(values)||values.length!==oldPolicy.length)throw Error('Trasferimento decoder non supportato.');
  const result=Array.isArray(fill)?fill.slice():Array(newPolicy.length).fill(fill);
  if(result.length!==newPolicy.length)throw Error('Inizializzazione del decoder non valida.');
  for(let i=0;i<oldPolicy.length-2;i++)result[i]=values[i];
  result[newPolicy.length-2]=values[oldPolicy.length-2];result[newPolicy.length-1]=values[oldPolicy.length-1];
  return result;
}
function genome(g,oldPolicy,newPolicy){
  if(g===null)return null;
  if(g.adapterVersion!==3)throw Error('Genoma originale non V3.');
  return {...F.cloneGenome(g),adapterVersion:6,policyWeights:transfer(g.policyWeights,oldPolicy,newPolicy)};
}
function migrate(payload,oldGraph,newGraph){
  const oldPolicy=oldGraph.learning,newPolicy=F.ensureLearning(newGraph),copy=JSON.parse(JSON.stringify(payload));
  const map=g=>genome(g,oldPolicy,newPolicy);
  for(const worker of copy.workers){
    const s=worker.state;s.genomes=s.genomes.map(map);s.champion=map(s.champion);s.externalChampion=map(s.externalChampion);
    s.hallOfFame=s.hallOfFame.map(h=>({...h,genome:map(h.genome)}));
    s.optimizer={...s.optimizer,mean:transfer(s.optimizer.mean,oldPolicy,newPolicy),sigma:transfer(s.optimizer.sigma,oldPolicy,newPolicy,newPolicy.scales)};
    s.history=[]; // Only history is reset. Generations, counters, RNG and frontier stay.
  }
  if(copy.globalChampion)copy.globalChampion.genome=map(copy.globalChampion.genome);
  copy.graph=P.compatibleGraph(newGraph);return copy;
}
module.exports={runtime,F,P,L,POLICY,model,transfer,genome,migrate};
