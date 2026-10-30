'use strict';
// Unsupervised features of ACTUAL neuronal observations. No sensor targets,
// route positions, clocks or driving-action labels are used to fit a basis.
const fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs'),R=require('./neural-projected-residual.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),out=process.argv[2];if(process.versions.node!=='24.19.0'||!out)throw Error('Pinned runtime and output file required');
const actorFile=path.join(base,'neuronal-command-3803-sac/best-actor.json'),actor=JSON.parse(fs.readFileSync(actorFile,'utf8')),prepared=JSON.parse(fs.readFileSync(path.join(base,'projected-residual-3803-prepared/prepared.json'),'utf8'));R.validateActor(actor);
const seen=new Set(),latents=[],sources={};
for(const name of ['baseline','sac-final']){
  const file=path.join(base,'projected-sensory-information',name+'.json'),d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.collectionRevision!=='precontrol-aligned-v2')throw Error('Actual aligned neuronal inputs required');sources[file]=Head.sha(fs.readFileSync(file,'utf8'));
  for(const row of d.rows){const raw=row.observation.concat(row.inference.old,[row.inference.gate]),key=Head.sha(JSON.stringify(raw));if(seen.has(key))continue;seen.add(key);let input=R.normalize(raw,prepared.normalization);
    for(const layer of actor.layers.slice(0,2))input=layer.weights.map((weights,j)=>{let sum=layer.bias[j];for(let k=0;k<weights.length;k++)sum+=weights[k]*input[k];return Math.max(0,Math.fround(sum));});latents.push(input);
  }
}
const data={format:'male-cns-real-neuronal-latent-data',schema:1,sources,sourceActorFile:actorFile,sourceActorSha256:Head.sha(fs.readFileSync(actorFile,'utf8')),sourceBodyLayers:actor.layers.slice(0,2),sourceSha256:Head.sha(fs.readFileSync(__filename,'utf8')),latents,
  boundary:'Frozen neural feature encoder evaluated on actually recorded neuronal/controller observations only. No target actions, sensor labels, pose or time enters basis fitting. These are computed unsupervised features, not a new physical rollout or a teacher.'};
fs.writeFileSync(out,JSON.stringify(data),{flag:'wx'});console.log(JSON.stringify({samples:latents.length,file:out}));
