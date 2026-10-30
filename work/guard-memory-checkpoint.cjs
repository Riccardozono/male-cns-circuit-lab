'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs'),{C,F}=G;
function load(file){
  const saved=JSON.parse(fs.readFileSync(file,'utf8')),sim=G.create(),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
  if(!['male-cns-guard-memory-experiment','male-cns-growing-guard-memory'].includes(saved.format))throw Error('Unsupported corrected-objective checkpoint');
  C.verify(saved,{format:saved.format,graph:G.X.P.compatibleGraph(sim.graph),sourceSha256:saved.sourceSha256,legacySourceSha256:C.hashFile(original),sourceHashes:Object.fromEntries(Object.keys(saved.sourceHashes||{}).map(f=>[f,C.hashFile(path.join(G.root,f))]))});
  if(saved.objectiveRevision!==F.Rewards.REVISION||saved.decoder!=='compact-neural-memory-rbf-v1'||!G.X.L.valid(sim.graph,saved.baseGenome.policyWeights)||!Number.isFinite(saved.decay)||saved.decay<0||saved.decay>=1)throw Error('Incompatible corrected objective/decoder');
  for(const w of [saved.championWeights,saved.explorerWeights])if(w?.length!==saved.centres?.length*2||w.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid current residual weights');
  for(const c of saved.centres)if(c.values?.length!==sim.graph.learning.nodes.length||c.values.some(v=>!Number.isFinite(v))||!Number.isFinite(c.radius)||c.radius<=0)throw Error('Invalid current neural basis');
  return {saved,sim,original};
}
function grow(centres,weights,observations,prefix,limit){
  const expanded=G.M.centresFromExperience(observations,prefix,limit,centres);
  for(let k=centres.length;k<expanded.length;k++){const nearest=Math.min(...expanded.filter((_,j)=>j!==k).map(other=>G.M.rms(other.values,expanded[k].values)));expanded[k].radius=Math.min(expanded[k].radius,Math.max(.01,nearest*1.5));}
  return {centres:expanded,weights:weights.concat(Array((expanded.length-centres.length)*2).fill(0)),added:expanded.length-centres.length};
}
module.exports={load,grow};
