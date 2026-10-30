'use strict';
// Independent complete-from-start replay for a naturally evolved CUDA agent.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function arg(name,fallback=''){const v=process.argv.find(x=>x.startsWith(`--${name}=`));return v?v.slice(name.length+3):fallback;}
async function replay(loaded,record){
  const env=Model.createFromLoaded(loaded,{weights:record.weights,id:record.id});
  const trace=crypto.createHash('sha256');let state,controls=0,overlap=false;
  while(env.currentCar().alive&&controls<20000){
    state=env.step();controls++;
    trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');
    overlap ||= state.car.outputs[1]>0&&state.car.outputs[2]>0;
    if(state.laps>=2)break;
  }
  state=env.state();
  return {id:record.id,weightsSha256:sha(JSON.stringify(record.weights)),progress:state.bestProgress,fitness:state.fitness,baseFitness:state.car.baseFitness,laps:state.laps,lapTimes:state.lapTimes,reason:state.reason,complete:state.complete,controls,simulatedSeconds:state.totalSimulationSeconds,overlap,actionTraceSha256:trace.digest('hex'),expected:{progress:record.progress,fitness:record.fitness,baseFitness:record.baseFitness,laps:record.laps,lapTimes:record.lapTimes,reason:record.reason,complete:record.complete,controls:record.controls,actionTraceSha256:record.actionTraceSha256}};
}
async function main(){
  const input=path.resolve(arg('report')),output=path.resolve(arg('output'));
  if(!input||!output||await fs.stat(output).then(()=>true,()=>false))throw Error('Provide an existing --report and a new --output directory');
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  const sourceText=await fs.readFile(input,'utf8'),source=JSON.parse(sourceText),generation=Number(arg('generation','1')),candidateId=Number(arg('id','6'));
  const group=source.generations.find(g=>g.history.generation===generation);if(!group)throw Error('Generation not found in immutable benchmark report');
  const candidate=group.results.find(r=>r.id===candidateId),baseline=group.results.find(r=>r.id===0);
  if(!candidate||!baseline||!Array.isArray(candidate.weights))throw Error('Candidate and same-generation baseline with exact weights required');
  const selected=Model.defaultChoice();if(selected.modelSha256!==source.settings.modelSha256)throw Error('Benchmark no longer matches current verified parent');
  const modelFile=path.resolve(arg('model-file')||selected.file),loaded=Model.load(modelFile),replays=[];
  if(modelFile!==selected.file&&JSON.stringify(loaded.data.weights)!==JSON.stringify(candidate.weights))throw Error('Candidate checkpoint weights do not match selected training agent');
  try{for(const record of [baseline,candidate])replays.push(await replay(loaded,record));}
  finally{Model.closeCuda();}
  // Coordinator only publishes a generation after every result is complete;
  // the compact benchmark report does not serialize that redundant boolean.
  const compare=(actual,expected)=>actual.complete===true&&actual.progress===expected.progress&&actual.fitness===expected.fitness&&(expected.baseFitness===undefined||actual.baseFitness===expected.baseFitness)&&actual.laps===expected.laps&&JSON.stringify(actual.lapTimes)===JSON.stringify(expected.lapTimes)&&actual.reason===expected.reason&&actual.controls===expected.controls&&actual.actionTraceSha256===expected.actionTraceSha256;
  const results=replays.map((r,i)=>({...r,exactMatch:compare(r,[baseline,candidate][i])}));
  const report={format:'statehead-cuda-mutation-candidate-replay-v1',passed:results.every(r=>r.exactMatch&&!r.overlap),sourceReport:{file:input,sha256:sha(sourceText)},model:{file:modelFile,sha256:loaded.sha256,parentModelSha256:selected.modelSha256},runtime:process.versions.node,replays:results,qualification:'Both the original champion and selected mutation were replayed independently from the start with their exact trained weights and agent IDs. A 1 m frontier gain is not a two-lap learning result.'};
  await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_MUTATION_REPLAY '+JSON.stringify({passed:report.passed,replays:results.map(r=>({id:r.id,exactMatch:r.exactMatch,progress:r.progress,laps:r.laps,fitness:r.fitness,reason:r.reason,controls:r.controls,actionTraceSha256:r.actionTraceSha256,overlap:r.overlap})),verification:path.join(output,'verification.json')}));
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
