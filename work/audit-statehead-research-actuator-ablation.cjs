'use strict';
// Compare learned steering vs learned longitudinal correction on identical physics.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function option(name,fallback){const arg=process.argv.find(value=>value.startsWith(`--${name}=`));return arg?arg.slice(name.length+3):fallback;}
function snapshot(env){const s=env.state(),c=env.currentCar();return {progress:s.bestProgress,laps:s.laps,reason:s.reason,totalSimulationSeconds:s.totalSimulationSeconds,alive:c.alive,x:c.x,y:c.y,heading:c.heading,speed:c.speed,outputs:c.outputs.slice(),steer:c.steer,slipAngle:c.slipAngle,lateralG:c.lateralG,longitudinalG:c.longitudinalG,totalG:c.totalG,inputs:c.inputs.slice(),physicsInputs:c.physicsInputs.slice()};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use pinned Node 24.19.0');
  const modelFile=path.resolve(option('model','')),sourceModelFile=path.resolve(option('genes-model','')),checkpointFile=path.resolve(option('checkpoint','')),out=path.resolve(option('output','')),agent=Number(option('agent','7'));
  if(!modelFile||!sourceModelFile||!checkpointFile||!out||!Number.isInteger(agent)||agent<0||agent>=16||await fs.stat(out).then(()=>true,()=>false))throw Error('Specify exact source/target research models, checkpoint, agent and a new output directory');
  const envelope=JSON.parse(await fs.readFile(checkpointFile,'utf8'));
  if(envelope.format!=='male-cns-statehead-early-gate-research-checkpoint'||envelope.schema!==1||sha(envelope.payloadJson)!==envelope.sha256)throw Error('Checkpoint format/checksum invalid');
  const saved=JSON.parse(envelope.payloadJson),sourceText=await fs.readFile(sourceModelFile,'utf8'),sourceSha=sha(sourceText),modelText=await fs.readFile(modelFile,'utf8'),modelSha=sha(modelText);
  if(saved.modelSha256!==sourceSha||saved.parentCleanModelSha256!==Model.defaultChoice().modelSha256||saved.state.population!==16)throw Error('Checkpoint does not match the exact source genotype model and protected V3');
  const record=saved.records.find(g=>g.history.generation===saved.state.generation-1),candidate=record?.results.find(r=>r.id===agent);
  if(!candidate)throw Error('Candidate genes are absent from this complete checkpoint');
  const loaded=Model.loadResearch(modelFile),geneSource=Model.loadResearch(sourceModelFile);
  if(sha(JSON.stringify(loaded.data.basis))!==sha(JSON.stringify(geneSource.data.basis))||loaded.data.provenance.parentCleanModelSha256!==geneSource.data.provenance.parentCleanModelSha256)throw Error('Ablation requires exactly the same gate and embedded controller');
  const variants=[{name:'zero-correction',weights:Array(18).fill(0)},{name:'steering-only',weights:candidate.weights.map((v,i)=>i%2===0?v:0)},{name:'longitudinal-only',weights:candidate.weights.map((v,i)=>i%2===1?v:0)},{name:'both',weights:candidate.weights.slice()}];
  let topology=null;const envs=variants.map((variant,index)=>{const env=Model.createFromLoaded(loaded,{id:agent,weights:variant.weights,sharedTopology:topology});topology=env.topology;return {name:variant.name,weights:variant.weights,env,controls:0,firstGate:null,firstOutputDivergence:null,last:null};});
  const reference=envs[0];
  while(envs.some(row=>row.env.currentCar().alive&&row.controls<12000)){
    for(const row of envs){if(!row.env.currentCar().alive||row.controls>=12000)continue;row.env.step();row.controls++;const gate=row.env.stateHeadSnapshot().gate;if(row.firstGate===null&&gate>1e-8)row.firstGate={control:row.controls,seconds:row.controls*.1,value:gate};
      if(row!==reference&&row.firstOutputDivergence===null&&row.env.currentCar().alive&&reference.env.currentCar().alive){const a=row.env.currentCar().outputs,b=reference.env.currentCar().outputs,delta=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));if(delta>1e-8)row.firstOutputDivergence={control:row.controls,seconds:row.controls*.1,delta,outputs:a.slice(),zeroCorrection:b.slice()};}
      if(row.controls%500===0||!row.env.currentCar().alive)row.last=snapshot(row.env);
    }
  }
  const report={passed:envs.every(row=>row.controls>0),targetModel:{file:modelFile,sha256:modelSha,gateRevision:loaded.data.provenance.earlyGateRevision,motorCorrectionGain:loaded.data.provenance.motorCorrectionGain},geneSource:{file:sourceModelFile,sha256:sourceSha},candidate:{generation:record.history.generation,id:agent,originalTrainingResult:{progress:candidate.progress,laps:candidate.laps,reason:candidate.reason,fitness:candidate.fitness,totalSimulationSeconds:candidate.totalSimulationSeconds,weights:candidate.weights}},baselines:{bestVerifiedV3:Model.defaultChoice().expected,researchZeroCorrection:loaded.data.verifiedFullResult},variants:envs.map(row=>({name:row.name,weights:row.weights,controls:row.controls,firstGate:row.firstGate,firstOutputDivergence:row.firstOutputDivergence,result:snapshot(row.env)})),gpu:Model.stats(),interpretation:'Four actual same-seed CUDA trajectories isolate the candidate genetic coefficients by steering/longitudinal output channel. These are diagnostic rollouts, not validation across seeds or circuits.'};
  await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_RESEARCH_ACTUATOR_ABLATION '+JSON.stringify({passed:report.passed,variants:report.variants.map(({name,firstGate,firstOutputDivergence,result})=>({name,firstGate,firstOutputDivergence,progress:result.progress,laps:result.laps,reason:result.reason,fitness:result.reason==='urto'?null:undefined,totalSimulationSeconds:result.totalSimulationSeconds})),gpu:report.gpu,report:path.join(out,'report.json')}));
  Model.closeCuda();
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
