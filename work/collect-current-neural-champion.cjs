'use strict';
// New real sensory/neuronal experience for the next study. This records a full
// physical episode; it does not create expert actions or change any app model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-chain-desktop-model.cjs'),IO=require('./frontier-chain-io.cjs');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function collect(out){
  if(process.versions.node!=='24.19.0'||fs.existsSync(out))throw Error('Pinned runtime and a NEW collection directory required');
  const selected=Model.defaultChoice(),registry=JSON.parse(fs.readFileSync(selected.registryFile,'utf8')),source=JSON.parse(fs.readFileSync(registry.selected.reportFile,'utf8'));fs.mkdirSync(out,{recursive:false});
  try{
    const actual=IO.execute({op:'collect',file:selected.file,trajectoryFile:path.join(out,'actual-neuronal-trajectory.f64')});
    fs.writeFileSync(path.join(out,'new-native-proof.json'),JSON.stringify(actual,null,2));
    if(!actual.passed||actual.actionTraceSha256!==selected.actionTraceSha256)throw Error('New actual complete trajectory did not reproduce the protected model');
    const report={format:'male-cns-actual-verified-clean-trajectory-v1',phase:'finished',passed:true,modelFile:selected.file,modelSha256:selected.modelSha256,trajectorySha256:sha(actual.trajectoryFile),proofs:[actual,source.nativeCleanProofs[0]],sourceRegistrySha256:sha(selected.registryFile),sourceReportFile:registry.selected.reportFile,sourceReportSha256:sha(registry.selected.reportFile),collectorSha256:sha(__filename),boundary:'One NEW actual full physical/native recording matched the independently verified protected clean model. The second proof is explicitly retained from the already completed native study, not claimed as a second new run. Actual neuronal inputs and self-generated actions only, not teacher targets or an app generation.'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));return {passed:true,reportFile:path.join(out,'report.json'),modelSha256:selected.modelSha256,result:actual.result,controls:actual.actualActorControls,wallSeconds:actual.wallSeconds};
  }catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
}
if(require.main===module)console.log(JSON.stringify(collect(path.resolve(process.argv[2]))));
module.exports={collect};
