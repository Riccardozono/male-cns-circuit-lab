'use strict';
// Creates a new research-only model identity with a conservative motor gain.
// It never edits the original early-gate or clean verified model.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Core=require('./neural-statehead-model.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use pinned Node 24.19.0');
  const option=(name,fallback)=>{const arg=process.argv.find(value=>value.startsWith(`--${name}=`));return arg?arg.slice(name.length+3):fallback;};
  const source=path.resolve(option('source','.impeccable/review/neural-sacl/statehead-cuda-early-gate-20261019-03/statehead-early-gate-research-only.malecns-statehead.json'));
  const output=path.resolve(option('output','.impeccable/review/neural-sacl/statehead-cuda-early-gate-low-gain-20261019-01'));
  if(await fs.stat(output).then(()=>true,()=>false))throw Error('Choose a new research output folder; existing evidence is preserved');
  const parsed=Core.parse(await fs.readFile(source,'utf8'),{allowResearch:true}),data=structuredClone(parsed.data);
  if(data.status!=='research-unverified'||data.provenance?.earlyGateRevision!=='observed-neural-gate-uniform-mid-episode-v1'||data.provenance?.parentCleanModelSha256===undefined)throw Error('An explicitly unverified, parent-linked early-gate model is required');
  data.provenance={...data.provenance,earlyGateRevision:'observed-neural-gate-uniform-mid-episode-v2-low-gain',motorCorrectionGain:.2,derivedFromResearchModelSha256:sha(await fs.readFile(source))};
  const modelText=Core.encode(data),verified=Core.parse(modelText,{allowResearch:true});
  if(verified.data.provenance.motorCorrectionGain!==.2||verified.data.status!=='research-unverified')throw Error('New low-gain research model failed its strict parse');
  await fs.mkdir(output,{recursive:false});
  const modelFile=path.join(output,'statehead-early-gate-low-gain-research-only.malecns-statehead.json');
  await fs.writeFile(modelFile,modelText,{encoding:'utf8',flag:'wx'});
  const report={passed:true,status:'research-unverified',modelFile,modelSha256:sha(modelText),sourceModelSha256:data.provenance.derivedFromResearchModelSha256,parentCleanModelSha256:data.provenance.parentCleanModelSha256,gateRevision:data.provenance.earlyGateRevision,motorCorrectionGain:data.provenance.motorCorrectionGain,protectedFraction:data.provenance.protectedFraction,interpretation:'A new immutable research model identity. It preserves the observed-neural gate and scales only its learned motor correction to 0.2. It is not an app save, not a clean model, and has no verified driving improvement.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_EARLY_GATE_LOW_GAIN_MODEL '+JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
