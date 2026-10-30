'use strict';
// Three separately learned neuronal cues, all actual and zero on the measured
// protected prefix. Order/indices are preparation metadata, never motor inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Single=require('./prepare-neural-chain-context.cjs'),Model=require('./neural-frontier-chain.cjs'),R=require('./neural-projected-residual.cjs'),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function prepare(reportFile,out){
  if(process.versions.node!=='24.19.0')throw Error('Pinned runtime required');fs.mkdirSync(out,{recursive:false});
  const fixture=Single.prepare(reportFile,path.join(out,'combined-context-fixture'),{tailControls:256}),report=JSON.parse(fs.readFileSync(reportFile,'utf8')),loaded=Model.load(report.modelFile,{allowExploration:true}),combined=Model.load(fixture.modelFile,{allowExploration:true}).data.stages.at(-1).basis;
  const proof=report.proofs[0],bytes=fs.readFileSync(proof.trajectoryFile),data=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8),n=proof.actualActorControls;
  const parts=combined.centres.map((centre,index)=>({basis:{...combined,centres:[centre]},sourceCentreIndex:fixture.centreIndices[index],firstActivated:-1})),gates=parts.map(p=>R.createGate(p.basis));
  for(let i=0;i<n;i++){const raw=Array.from(data.subarray(i*530,i*530+516));gates.forEach((g,j)=>{if(g.observe(raw)>0&&parts[j].firstActivated<0)parts[j].firstActivated=i;});}
  if(parts.some(p=>p.firstActivated<fixture.protectedCount))throw Error('Every new cue must preserve all observed protected controls');
  // The existing model's lastGate accessor now observes the earliest new cue;
  // this allows exact real-state caching without modifying frozen inference.
  parts.sort((a,b)=>b.firstActivated-a.firstActivated);const first=parts.at(-1).firstActivated;
  if(first!==fixture.firstActivatedControl)throw Error('Union activation boundary differs');
  const stages=loaded.data.stages.concat(parts.map(p=>({basis:p.basis,genes:[0,0]}))),modelFile=path.join(out,'base.malecns-frontier-chain.json'),model={...loaded.data,stages,expectedResult:proof.result,fullTraceSha256:proof.actionTraceSha256,provenance:{...loaded.data.provenance,tunableTailStages:3,sourceNativeReportSha256:sha(reportFile)}};
  fs.writeFileSync(modelFile,Model.encode(model));const result={...fixture,format:'male-cns-actual-neuronal-multiphase-context-v1',modelFile,modelSha256:sha(modelFile),tunableStages:3,plasticParameters:6,stageCount:stages.length,firstActivatedControl:first,individualActivations:parts.map(p=>({sourceCentreIndex:p.sourceCentreIndex,firstActivated:p.firstActivated})),
    sourceHashes:Object.fromEntries(['prepare-neural-chain-multi.cjs','prepare-neural-chain-context.cjs','neural-frontier-chain.cjs','neural-projected-residual.cjs'].map(f=>[f,sha(path.join(__dirname,f))])),
    boundary:'Three separately weighted actual neuronal cues, not timed commands, body targets or waypoints. Every zero coefficient preserves the parent. Earliest activation is the physically reached cache boundary. Existing data-only native inference is unchanged; six coefficients are not new biological neurons.'};
  fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(result));console.log(JSON.stringify({passed:true,file:path.join(out,'prepared.json'),plasticParameters:6,stageCount:stages.length,firstActivatedControl:first,individualActivations:result.individualActivations}));return result;
}
if(require.main===module){if(process.argv.length!==4)throw Error('Actual native report and NEW output directory required');prepare(path.resolve(process.argv[2]),path.resolve(process.argv[3]));}
module.exports={prepare};
