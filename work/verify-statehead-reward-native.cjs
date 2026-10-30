'use strict';
// Independent replay through the UNCHANGED protected native CUDA driver.
// The training sampler and its snapshot restore are not used in this process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./neural-statehead-cuda-model.cjs'),Core=require('./neural-statehead-model.cjs');
const root=path.resolve(__dirname,'..'),study=process.argv[2],tag=process.argv[3],sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(![study,tag].every(s=>typeof s==='string'&&/^[a-zA-Z0-9-]+$/.test(s)))throw Error('Scoped study names required');
const dir=path.join(root,'.impeccable/review/learning-ml',study),out=path.join(path.dirname(dir),tag);fs.mkdirSync(out);
try{
 const r=JSON.parse(fs.readFileSync(path.join(dir,'report.json'))),cp=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.private.json'))),
   choice=M.defaultChoice(),loaded=M.load(choice.file);
 if(!r.passed||cp.rootParentSha256!==choice.modelSha256||JSON.stringify(cp.bestFull)!==JSON.stringify(r.bestFull)||JSON.stringify(cp.currentWeights)!==JSON.stringify(r.finalResearchWeights)||JSON.stringify(cp.sourceHashes)!==JSON.stringify(r.sourceHashes))throw Error('Training/checkpoint/parent identity differs');
 for(const [file,digest]of Object.entries(r.sourceHashes))if(sha(path.join(root,file))!==digest)throw Error('Source changed: '+file);
 let topology=null;
 function replay(weights,kick=0,label='canonical'){
   const env=M.createFromLoaded(loaded,{weights,sharedTopology:topology});topology=env.topology;
   if(kick!==0)env.currentCar().heading+=kick;
   let state=env.state(),controls=0;const trace=crypto.createHash('sha256');
   while(!state.complete){state=env.step();controls++;const c=state.car;trace.update(JSON.stringify([controls,c.outputs,c.x,c.y,c.heading,c.bestProgress])+'\n');
     if(controls%4096===0)console.log('STATEHEAD_NATIVE_PROOF '+JSON.stringify({label,kick,controls,laps:state.laps,progress:state.bestProgress}));}
   return {result:{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete,lapTimes:state.lapTimes.slice()},
     controls,traceSha256:trace.digest('hex')};
 }
 const baseline=replay(loaded.data.weights,0,'parent');
 if(JSON.stringify(baseline.result)!==JSON.stringify(choice.expected))throw Error('Protected parent no longer reproduces');
 const best=replay(r.bestFull.weights,0,'best'),repeat=replay(r.bestFull.weights,0,'best-repeat');
 if(JSON.stringify(best)!==JSON.stringify(repeat)||JSON.stringify(best.result)!==JSON.stringify(r.bestFull.result))throw Error('Original driver differs from trainer or deterministic repeat');
 const perturbations=[];
 for(const kick of [-.00125,.00125]){
   const before=replay(loaded.data.weights,kick,'parent-kick'),after=replay(r.bestFull.weights,kick,'best-kick');perturbations.push({headingKickRad:kick,before,after});
 }
 const current=JSON.stringify(r.finalResearchWeights)===JSON.stringify(r.bestFull.weights)?best:replay(r.finalResearchWeights,0,'research-current');
 if(JSON.stringify(current.result)!==JSON.stringify(r.finalResearchFullResult))throw Error('Research-current replay differs');
 const safe=x=>x.complete&&!['urto','fuori pista','progresso non valido'].includes(x.reason),two=safe(best.result)&&best.result.laps>=2,
   nonweaker=safe(best.result)&&best.result.laps>=baseline.result.laps&&best.result.bestProgress>=baseline.result.bestProgress&&best.result.fitness>=baseline.result.fitness;
 let candidateFile=null,candidateSha256=null;
 if(nonweaker&&JSON.stringify(r.bestFull.weights)!==JSON.stringify(loaded.data.weights)){
   const data={...structuredClone(loaded.data),weights:r.bestFull.weights.slice(),expectedResult:best.result,verifiedFullResult:best.result,fullTraceSha256:best.traceSha256,status:'clean-verified',
     provenance:{...loaded.data.provenance,parentCleanModelSha256:choice.modelSha256,trainingMethod:'reward-gradient-pre-tanh-statehead-v1',
       trainingReportSha256:sha(path.join(dir,'report.json')),independentRuntime:'unchanged-protected-exact-CUDA-driver',verificationScope:'canonical-from-line-repeated-and-two-physical-heading-kicks'}};
   const text=Core.encode(data);Core.parse(text);candidateFile=path.join(out,'candidate.malecns-statehead.json');fs.writeFileSync(candidateFile,text,{flag:'wx'});M.load(candidateFile);candidateSha256=sha(candidateFile);
 }
 const cuda=M.stats();if(!(cuda.gpuCalls>0)||cuda.cpuFallbacks!==0)throw Error('Native CUDA proof without fallback required');
 const report={format:'private-statehead-reward-original-driver-proof-v1',passed:true,learningSucceeded:two,approvedForApp:false,parentSha256:choice.modelSha256,
   baseline,best,repeat,repeatIdentical:true,researchCurrent:current,perturbations,canonicalNonweaker:nonweaker,
   perturbationsBothTwoLaps:perturbations.every(p=>safe(p.after.result)&&p.after.result.laps>=2),candidateFile,candidateSha256,
   changedMeanCoefficients:r.bestFull.weights.filter((v,j)=>Math.abs(v-loaded.data.weights[j])>1e-12).length,
   trainingReportSha256:sha(path.join(dir,'report.json')),checkpointSha256:sha(path.join(dir,'checkpoint.private.json')),sourceSha256:sha(__filename),cuda,
   boundary:'Independent unchanged original state-head driver with explicit18-weight override. Full from-line baseline/candidate/repeat/current, plus physical heading kicks after the initial neural observation and before the first drive. Kicks are disturbances, not heading inputs to the brain. Private compatible-family envelope may be written only for a nonweaker canonical candidate; no ordinary save bypass, app distribution or generalized convergence claim.'};
 for(const [file,digest]of Object.entries(r.sourceHashes))if(sha(path.join(root,file))!==digest)throw Error('Source changed during proof: '+file);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'verifier-at-run.cjs'));
 console.log('STATEHEAD_NATIVE_PROOF_FINISHED '+JSON.stringify(report));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack},null,2),{flag:'wx'});throw error;}
finally{M.closeCuda();}
