'use strict';
// An explicit runtime adapter for the incompatible experimental objective.
// Original checkpoints are validated against preserved original source;
// learned neural weights can be warm-started, historical scores cannot.
const fs=require('node:fs'),path=require('node:path'),F=require('../.impeccable/experimental-progress-guard4/outputs/simulation.js'),X=require('./context8-model.cjs'),M=require('./neural-memory-rbf.cjs'),C=require('./experimental-checkpoint.cjs'),root=path.resolve(__dirname,'..');
function create(){return new F.Simulation(X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});}
function validateHistorical(saved){
  const {checksum,...body}=saved;if(checksum!==C.checksum(body)||saved.format!=='male-cns-recurrent-coordinate-experiment'||saved.decoder!=='compact-neural-memory-rbf-v1'||saved.schema!==1||saved.appVersion!=='5.6.0')throw Error('Invalid historical recurrent checkpoint');
  const sim=create();if(JSON.stringify(saved.graph)!==JSON.stringify(X.P.compatibleGraph(sim.graph))||!X.L.valid(sim.graph,saved.baseGenome.policyWeights)||saved.bestWeights?.length!==saved.centres?.length*2||saved.bestWeights.some(v=>!Number.isFinite(v)||Math.abs(v)>8)||!Number.isFinite(saved.decay)||saved.decay<0||saved.decay>=1)throw Error('Incompatible historical neural architecture');
  const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';if(C.hashFile(original)!==saved.legacySourceSha256)throw Error('Original save hash mismatch');
  const verifiedSources={};for(const [file,expected] of Object.entries(saved.sourceHashes)){
    let source=path.join(root,file);if(C.hashFile(source)!==expected&&['work/neural-local-rbf.cjs','work/neural-memory-rbf.cjs'].includes(file))source=path.join(root,'.impeccable/review/neural-local-rbf/memory-narrow-098/source',path.basename(file));
    if(C.hashFile(source)!==expected)throw Error('Historical implementation hash mismatch: '+file);verifiedSources[file]={sha256:expected,verifiedAt:path.relative(root,source)};
  }
  for(const centre of saved.centres)if(centre.values?.length!==sim.graph.learning.nodes.length||centre.values.some(v=>!Number.isFinite(v))||!Number.isFinite(centre.radius)||centre.radius<=0)throw Error('Invalid learned neural centre');
  return {sim,verifiedSources,original};
}
function replay(sim,genome,centres,weights,options={}){return M.replay(sim.track,sim.graph,genome,centres,weights,{...options,runtime:F});}
function prefix(sim,genome,centres){return M.prefixState(sim.track,sim.graph,genome,centres,F);}
module.exports={F,X,M,C,root,create,validateHistorical,replay,prefix};
