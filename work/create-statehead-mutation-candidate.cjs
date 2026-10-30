'use strict';
// Package one clean candidate from a complete CUDA search; no catalog update.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Core=require('./neural-statehead-model.cjs');
const Runtime=require('./neural-statehead-cuda-model.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function arg(name){const v=process.argv.find(x=>x.startsWith(`--${name}=`));return v?v.slice(name.length+3):'';}
async function main(){
  const trainingFile=path.resolve(arg('training-report')),replayFile=path.resolve(arg('replay-verification')),out=path.resolve(arg('output'));
  if(!trainingFile||!replayFile||!out||await fs.stat(out).then(()=>true,()=>false))throw Error('Provide both evidence files and a new output directory');
  const trainingText=await fs.readFile(trainingFile,'utf8'),replayText=await fs.readFile(replayFile,'utf8'),training=JSON.parse(trainingText),verification=JSON.parse(replayText);
  if(training.complete!==true||training.settings.modelSha256!==Runtime.defaultChoice().modelSha256)throw Error('Complete search against the current verified parent required');
  if(verification.passed!==true||verification.replays?.length!==2||verification.replays.some(r=>!r.exactMatch||r.overlap))throw Error('Exact independent candidate and parent replays required');
  const generation=Number(arg('generation')||1),candidateId=Number(arg('id')||6),row=training.generations.find(g=>g.history.generation===generation)?.results.find(r=>r.id===candidateId);
  const replay=verification.replays.find(r=>r.id===candidateId),baseline=verification.replays.find(r=>r.id===0);
  if(!row||!replay||!baseline||!Array.isArray(row.weights)||row.actionTraceSha256!==replay.actionTraceSha256||row.progress!==replay.progress||row.fitness!==replay.fitness||row.laps!==replay.laps||!replay.complete||replay.reason==='urto'||replay.reason==='fuori pista'||replay.reason==='progresso non valido'||replay.progress<baseline.progress||replay.fitness<baseline.fitness||replay.laps<baseline.laps)throw Error('Candidate does not beat the verified clean parent on exact complete physical evidence');
  if(training.settings.mutation!==0.24||training.settings.population!==16)throw Error('Unexpected training configuration for this promotion helper');
  const selected=Runtime.defaultChoice(),loaded=Core.load(selected.file);
  const data={...loaded.data,weights:row.weights.slice(),status:'clean-verified',expectedResult:{complete:true,bestProgress:replay.progress,fitness:replay.fitness,totalSimulationSeconds:replay.simulatedSeconds,laps:replay.laps,lapTimes:replay.lapTimes.slice(),reason:replay.reason},fullTraceSha256:replay.actionTraceSha256,provenance:{...loaded.data.provenance,verifiedMutationCandidate:{trainingReportSha256:sha(trainingText),independentReplaySha256:sha(replayText),generation,candidateId,seed:training.settings.seed,mutation:training.settings.mutation,population:training.settings.population,verifiedAgainst:baseline.actionTraceSha256}}};
  const modelText=Core.encode(data),parsed=Core.parse(modelText),modelSha256=sha(modelText);
  await fs.mkdir(out,{recursive:false});const modelFile=path.join(out,'clean.malecns-statehead.json');
  await fs.writeFile(modelFile,modelText,{encoding:'utf8',flag:'wx'});
  const record={format:'statehead-clean-mutation-candidate-v1',passed:true,status:parsed.data.status,modelFile,modelSha256,parentModelSha256:selected.modelSha256,result:data.expectedResult,actionTraceSha256:data.fullTraceSha256,trainingReport:{file:trainingFile,sha256:sha(trainingText)},replayVerification:{file:replayFile,sha256:sha(replayText)},qualification:'One-seed V3/Monza improvement: +1.003 m and +1.023 fitness versus its independently replayed verified parent, still 1 lap and ending by slow-progress cutoff. Not a two-lap result or cross-seed generalization.'};
  await fs.writeFile(path.join(out,'candidate.json'),JSON.stringify(record,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_CLEAN_CANDIDATE '+JSON.stringify(record));Runtime.closeCuda();
}
main().catch(error=>{console.error(error.stack||String(error));Runtime.closeCuda();process.exitCode=1;});
