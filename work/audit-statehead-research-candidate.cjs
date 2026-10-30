'use strict';
// Reproduce one checkpointed research candidate against its exact zero-weight parent.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function option(name,fallback){const arg=process.argv.find(value=>value.startsWith(`--${name}=`));return arg?arg.slice(name.length+3):fallback;}
function sample(env){const s=env.state(),c=env.currentCar();return {progress:s.bestProgress,laps:s.laps,reason:s.reason,totalSimulationSeconds:s.totalSimulationSeconds,alive:c.alive,x:c.x,y:c.y,heading:c.heading,speed:c.speed,outputs:c.outputs.slice(),inputs:c.inputs.slice(),physicsInputs:c.physicsInputs.slice(),longitudinalG:c.longitudinalG,lateralG:c.lateralG,totalG:c.totalG,slipAngle:c.slipAngle,steer:c.steer,throttle:c.vehicle?.throttle,brake:c.vehicle?.brake};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use pinned Node 24.19.0');
  const modelFile=path.resolve(option('model','')),checkpointFile=path.resolve(option('checkpoint','')),sourceModelFile=path.resolve(option('genes-model',option('model',''))),out=path.resolve(option('output',''));
  const candidateId=Number(option('agent','7'));
  if(!modelFile||!checkpointFile||!out||!Number.isInteger(candidateId)||candidateId<0||candidateId>=16||await fs.stat(out).then(()=>true,()=>false))throw Error('Specify model, checkpoint, agent 0–15, and a new output folder');
  const envelope=JSON.parse(await fs.readFile(checkpointFile,'utf8'));
  if(envelope.format!=='male-cns-statehead-early-gate-research-checkpoint'||envelope.schema!==1||sha(envelope.payloadJson)!==envelope.sha256)throw Error('Research checkpoint checksum/format mismatch');
  const saved=JSON.parse(envelope.payloadJson),text=await fs.readFile(modelFile,'utf8'),modelSha=sha(text),sourceText=await fs.readFile(sourceModelFile,'utf8'),sourceModelSha=sha(sourceText);
  if(saved.modelSha256!==sourceModelSha||saved.parentCleanModelSha256!==Model.defaultChoice().modelSha256||saved.state.population!==16)throw Error('Checkpoint does not match the exact gene-source model and protected V3');
  const record=saved.records.find(g=>g.history.generation===saved.state.generation-1),candidate=record?.results.find(r=>r.id===candidateId);
  if(!candidate)throw Error('Candidate genes are not recorded in this complete generation checkpoint');
  const loaded=Model.loadResearch(modelFile),geneSource=Model.loadResearch(sourceModelFile);
  if(loaded.data.provenance.parentCleanModelSha256!==geneSource.data.provenance.parentCleanModelSha256||sha(JSON.stringify(loaded.data.basis))!==sha(JSON.stringify(geneSource.data.basis)))throw Error('Gene transfer requires the exact same protected parent and recorded neural gate basis');
  const active=Model.createFromLoaded(loaded,{id:candidateId,weights:candidate.weights}),baseline=Model.createFromLoaded(loaded,{id:candidateId,sharedTopology:active.topology,weights:Array(18).fill(0)});
  const firstLapControl=Math.floor(loaded.data.provenance.firstLapControl??Math.floor(loaded.data.expectedResult.lapTimes[0]/.1)),samples=[];
  let activeControls=0,baselineControls=0,firstGate=null,firstOutputDivergence=null,firstPositionDivergence=null;
  const magnitude=values=>Math.max(...values.map(Math.abs));
  while((active.currentCar().alive&&activeControls<12000)||(baseline.currentCar().alive&&baselineControls<12000)){
    let a=null,b=null;
    if(active.currentCar().alive&&activeControls<12000){a=active.step();activeControls++;const gate=active.stateHeadSnapshot().gate;if(firstGate===null&&gate>1e-8)firstGate={control:activeControls,seconds:activeControls*.1,value:gate};}
    if(baseline.currentCar().alive&&baselineControls<12000){b=baseline.step();baselineControls++;}
    const control=Math.max(activeControls,baselineControls),ac=active.currentCar(),bc=baseline.currentCar();
    if(a&&b){const outDelta=magnitude(ac.outputs.map((v,i)=>v-bc.outputs[i])),posDelta=Math.hypot((ac.x||0)-(bc.x||0),(ac.y||0)-(bc.y||0));
      if(firstOutputDivergence===null&&outDelta>1e-8)firstOutputDivergence={control,seconds:control*.1,delta:outDelta,active:ac.outputs.slice(),zeroCorrection:bc.outputs.slice()};
      if(firstPositionDivergence===null&&posDelta>.01)firstPositionDivergence={control,seconds:control*.1,deltaMetres:posDelta};
      const terminalEvent=!ac.alive||!bc.alive,nearLap=control>=firstLapControl-20&&control<=firstLapControl+200&&control%5===0,heartbeat=control%50===0;
      if(terminalEvent||nearLap||heartbeat)samples.push({control,seconds:control*.1,active:sample(active),zeroCorrection:sample(baseline),outputDelta:outDelta,positionDeltaMetres:posDelta,gate:active.stateHeadSnapshot().gate});
    }
  }
  const report={passed:activeControls>0&&baselineControls>0,model:{file:modelFile,sha256:modelSha,gateRevision:loaded.data.provenance.earlyGateRevision,motorCorrectionGain:loaded.data.provenance.motorCorrectionGain,geneSourceModelFile:sourceModelFile,geneSourceModelSha256:sourceModelSha},candidate:{generation:record.history.generation,id:candidateId,trainingResult:{progress:candidate.progress,laps:candidate.laps,reason:candidate.reason,fitness:candidate.fitness,totalSimulationSeconds:candidate.totalSimulationSeconds,actionTraceSha256:candidate.actionTraceSha256},weights:candidate.weights},baseline:{bestVerifiedV3:Model.defaultChoice().expected,researchZeroCorrection:loaded.data.verifiedFullResult},firstLapControl,firstGate,firstOutputDivergence,firstPositionDivergence,controls:{active:activeControls,zeroCorrection:baselineControls},activeResult:sample(active),zeroCorrectionResult:sample(baseline),samples,gpu:Model.stats(),interpretation:'Same parent, gate basis, car id, initial state and exact CUDA replay the checkpointed candidate genes at the target motor gain, paired with zero correction. Cross-gain gene transfer is explicit; this single seed is not a generalization claim.'};
  await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_RESEARCH_CANDIDATE_AUDIT '+JSON.stringify({passed:report.passed,trainingResult:report.candidate.trainingResult,firstGate,firstOutputDivergence,firstPositionDivergence,active:report.activeResult,zeroCorrection:report.zeroCorrectionResult,gpu:report.gpu,report:path.join(out,'report.json')}));
  Model.closeCuda();
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
