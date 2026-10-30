'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs');
function load(file){
  const saved=JSON.parse(fs.readFileSync(file,'utf8')),sim=G.create(),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
  G.C.verify(saved,{format:'male-cns-causal-memory-experiment',graph:G.X.P.compatibleGraph(sim.graph),sourceSha256:saved.sourceSha256,legacySourceSha256:G.C.hashFile(original),sourceHashes:Object.fromEntries(Object.keys(saved.sourceHashes||{}).map(f=>[f,G.C.hashFile(path.join(G.root,f))]))});
  if(saved.decoder!=='history-conditioned-neural-memory-v2'||saved.objectiveRevision!==G.F.Rewards.REVISION||!G.X.L.valid(sim.graph,saved.baseGenome.policyWeights)||!Number.isFinite(saved.decay)||saved.decay<0||saved.decay>=1||!Number.isInteger(saved.fixedCoefficients)||saved.fixedCoefficients<2||saved.fixedCoefficients%2||saved.fixedCoefficients>saved.centres.length*2)throw Error('Incompatible causal architecture');
  for(const weights of [saved.championWeights,saved.explorerWeights])if(weights?.length!==saved.centres?.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid causal coefficients');
  for(const c of saved.centres)if(c.values?.length!==sim.graph.learning.nodes.length||c.values.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||!Number.isFinite(c.radius)||c.radius<=0||c.memory&&(c.memory.length!==2||c.memory.some(v=>!Number.isFinite(v)||Math.abs(v)>2)||!Number.isFinite(c.memoryRadius)||c.memoryRadius<=0))throw Error('Invalid causal neural centre');
  return {saved,sim,original};
}
module.exports={load};
