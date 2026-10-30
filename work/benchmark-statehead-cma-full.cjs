'use strict';
// Isolated full-covariance CMA-ES search on the real V3 state-head policy.
// The verified champion is always protected; every other candidate is scored
// by a complete natural rollout from the start line using real neural control.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');
const {CMA}=require('./neural-cma.cjs');
const root=path.resolve(__dirname,'..');
function option(name,fallback){const x=process.argv.find(a=>a.startsWith(`--${name}=`));return x?x.slice(name.length+3):fallback;}
const population=Number(option('population','16')),generations=Number(option('generations','3'));
const seed=Number(option('seed','151216')),speed=Number(option('speed','30'));
const wallMinutes=Number(option('wall-minutes','12')),sigma=Number(option('sigma','0.08'));
const focus=option('focus','full');
const steeringScale=Number(option('steering-scale',focus==='full'?'5':'0'));
const resumeReportPath=option('resume-report',''),resumeVerificationPath=option('resume-verification','');
const out=path.resolve(option('output',''));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['work/benchmark-statehead-cma-full.cjs','work/neural-cma.cjs','work/neural-statehead-cuda-coordinator.cjs','work/neural-statehead-cuda-archive.cjs'];
async function hashSources(){return Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,hash(await fs.readFile(path.join(root,p)))])));}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const unsafeReasons=new Set(['urto','fuori pista','progresso non valido']);
const compareOutcome=(a,b)=>Number(unsafeReasons.has(a.reason))-Number(unsafeReasons.has(b.reason))||b.laps-a.laps||b.progress-a.progress||b.fitness-a.fitness;
const explorationPenalty=Number(option('unsafe-progress-penalty','25'));
const isUnsafeOutcome=r=>unsafeReasons.has(r.reason)||r.complete===false||r.censored===true||Boolean(r.overlap);
const adjustedProgress=r=>r.progress-(isUnsafeOutcome(r)?explorationPenalty:0);
const compareExploration=(a,b)=>b.laps-a.laps||adjustedProgress(b)-adjustedProgress(a)||b.fitness-a.fitness;
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(!Number.isInteger(population)||population!==16||!Number.isInteger(generations)||generations<1||generations>8||!Number.isInteger(seed)||seed<0||!Number.isFinite(speed)||speed<.5||speed>30||!Number.isInteger(wallMinutes)||wallMinutes<3||wallMinutes>60||!Number.isFinite(sigma)||sigma<=0||sigma>1||!['full','longitudinal'].includes(focus)||!Number.isFinite(steeringScale)||steeringScale<0||steeringScale>5||!Number.isFinite(explorationPenalty)||explorationPenalty<0||explorationPenalty>500||!out)throw Error('Invalid CMA experiment settings; this test requires 16 agents');
  if(await fs.stat(out).then(()=>true,()=>false))throw Error('Output already exists; refusing overwrite');
  const sourceHashesAtStart=await hashSources();
  const selected=Model.defaultChoice(),modelText=await fs.readFile(selected.file,'utf8'),modelSha=hash(modelText);
  if(modelSha!==selected.modelSha256)throw Error('Protected model checksum mismatch');
  let resume=null,resumeVerification=null,resumeChampionRow=null;
  if(resumeReportPath||resumeVerificationPath){
    if(!resumeReportPath||!resumeVerificationPath)throw Error('Both resume report and exact replay verification are required');
    resume=JSON.parse(await fs.readFile(path.resolve(resumeReportPath),'utf8'));
    const verificationText=await fs.readFile(path.resolve(resumeVerificationPath),'utf8');resumeVerification=JSON.parse(verificationText);resumeVerification.sha256=hash(verificationText);
    if(resume.complete!==true||resume.settings.modelSha256!==modelSha||resume.settings.focus!==focus||resume.settings.coefficientScale.steering!==steeringScale||resumeVerification.passed!==true)throw Error('Resume evidence does not match this verified parent and optimizer configuration');
    resumeChampionRow=resume.generations.flatMap(g=>g.results).find(r=>JSON.stringify(r.weights)===JSON.stringify(resume.protectedChampion.weights));
    const replay=resumeVerification.replays.find(r=>r.id===resumeChampionRow?.id);
    if(!resumeChampionRow||!replay?.exactMatch||replay.progress!==resumeChampionRow.progress||replay.fitness!==resumeChampionRow.fitness||replay.laps!==resumeChampionRow.laps||replay.reason!==resumeChampionRow.reason)throw Error('The protected resume champion lacks an exact independent physical replay');
  }
  const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
  const userSaveSha=await fs.readFile(userSave).then(hash,()=>null);
  const base=Model.load(selected.file).data.weights.slice(),baseDimensions=base.length;
  if(baseDimensions!==18||!['full','longitudinal'].includes(focus))throw Error('Expected the verified 18-weight state-head decoder and a supported focus');
  // Isolate the slow/stall behavior by optionally holding all steering
  // coefficients exactly fixed while CMA explores only the nine longitudinal
  // brake/throttle coefficients.
  const sampledIndices=focus==='longitudinal'?Array.from({length:9},(_,i)=>i*2+1):Array.from({length:baseDimensions},(_,i)=>i);
  const scales=sampledIndices.map(j=>focus==='full'&&j%2===0?steeringScale:1);
  const dims=sampledIndices.length;
  const optimizer=resume?CMA.restore(resume.cmaState):new CMA(Array(dims).fill(0),sigma,population-1);
  if(optimizer.n!==dims||optimizer.population!==population-1)throw Error('CMA checkpoint dimensions or population do not match this experiment');
  const coordinator=new Coordinator({modelFile:selected.file,population,mutation:.16,speedMultiplier:speed,workers:4});
  if(resume){
    const c=resumeChampionRow,last=resume.generations.at(-1);
    coordinator.archive.champion={weights:c.weights.slice(),fitness:c.fitness,baseFitness:c.fitness,progress:c.progress,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.reason,censored:false,overlap:0};
    coordinator.generation=last.history.generation+1;
    coordinator.history=resume.generations.map(g=>structuredClone(g.history));
    coordinator.completedEpisodes=resume.generations.reduce((n,g)=>n+g.results.length,0);
    coordinator.updates=resume.generations.length;
    coordinator.previousLapTime=last.history.bestLapTime;
  }
  coordinator.random=require('../outputs/simulation.js').rng(seed);
  let currentBatch=[],offerCount=0;
  const generationsData=[];
  const originalAsk=coordinator.archive.ask.bind(coordinator.archive);
  coordinator.archive.ask=function(random){
    const samples=optimizer.ask(random);
    currentBatch=samples.map(sample=>{
      const x=sample.x.map((v,k)=>{const j=sampledIndices[k];return clamp(v,(-8-base[j])/scales[k],(8-base[j])/scales[k]);});
      const weights=base.slice();
      for(let k=0;k<sampledIndices.length;k++){const j=sampledIndices[k];weights[j]=clamp(base[j]+x[k]*scales[k],-8,8);}
      return {...sample,x,weights};
    });
    return [{weights:coordinator.archive.champion.weights.slice(),kind:'protected-clean-champion'},...currentBatch.map(c=>({weights:c.weights.slice(),kind:'cma-es-candidate'}))];
  };
  const originalOffer=coordinator.archive.offer.bind(coordinator.archive);
  coordinator.archive.offer=function(record){
    const result=originalOffer(record);
    if(coordinator.lastCompletedResults&&currentBatch.length===population-1){
      offerCount++;
      if(offerCount===population){
        const results=coordinator.lastCompletedResults;
        if(results.length!==population||new Set(results.map(r=>r.id)).size!==population)throw Error('CMA expected one complete natural rollout per agent');
        const sampled=results.filter(r=>r.id>0).map(r=>({result:r,sample:currentBatch[r.id-1]})).sort((a,b)=>compareExploration(a.result,b.result));
        optimizer.tell(sampled.map((entry,rank)=>({...entry.sample,fitness:sampled.length-rank})));
        const physicalLeader=results.slice().sort(compareOutcome)[0],previousChampion=coordinator.archive.champion;
        if(physicalLeader.complete&&!physicalLeader.censored&&!physicalLeader.overlap&&!unsafeReasons.has(physicalLeader.reason)&&compareOutcome(physicalLeader,previousChampion)<0){
          coordinator.archive.champion={weights:physicalLeader.weights.slice(),fitness:physicalLeader.fitness,baseFitness:physicalLeader.baseFitness,progress:physicalLeader.progress,laps:physicalLeader.laps,lapTimes:physicalLeader.lapTimes.slice(),reason:physicalLeader.reason,censored:false,overlap:0};
        }
        const champion=coordinator.archive.champion;
        const explorationRanks=new Map(sampled.map((entry,rank)=>[entry.result.id,{rank:rank+1,penalty:isUnsafeOutcome(entry.result)?explorationPenalty:0,adjustedProgress:adjustedProgress(entry.result)}]));
        generationsData.push({generation:coordinator.generation,history:null,rankObjective:`exploration only: completed laps first, then physical progress minus ${explorationPenalty} m for unsafe, incomplete, censored or overlapping outcomes, then episodic fitness; unsafe candidates may inform CMA-ES but can never replace the clean protected champion`,unsafeProgressPenaltyMetres:explorationPenalty,sigma:optimizer.sigma,mean:optimizer.mean.slice(),covariance:optimizer.covariance.map(row=>row.slice()),protectedChampion:{progress:champion.progress,laps:champion.laps,fitness:champion.fitness,reason:champion.reason,lapTimes:champion.lapTimes?.slice()||[],weights:champion.weights.slice()},results:results.slice().sort((a,b)=>a.id-b.id).map(r=>({id:r.id,progress:r.progress,explorationRank:explorationRanks.get(r.id)?.rank??null,explorationPenaltyMetres:explorationRanks.get(r.id)?.penalty??null,explorationAdjustedProgress:explorationRanks.get(r.id)?.adjustedProgress??null,laps:r.laps,fitness:r.fitness,reason:r.reason,lapTimes:r.lapTimes.slice(),totalSimulationSeconds:r.totalSimulationSeconds,controls:r.controls,actionTraceSha256:r.actionTraceSha256,weights:r.weights.slice()}))});
        console.log('STATEHEAD_CMA_BATCH_RANKED '+JSON.stringify({generation:coordinator.generation,physicalLeader:results.slice().sort(compareOutcome)[0].progress,explorationLeader:sampled[0]&&{id:sampled[0].result.id,progress:sampled[0].result.progress,adjustedProgress:adjustedProgress(sampled[0].result),reason:sampled[0].result.reason},championProgress:champion.progress,championLaps:champion.laps,sigma:optimizer.sigma}));
        offerCount=0;
      }
    }
    return result;
  };
  // Preserve the real Archive ask function only for identity/evidence; the
  // experiment intentionally replaces candidate selection with CMA-ES.
  if(typeof originalAsk!=='function')throw Error('Protected archive sampler unavailable');
  let resolving=false,interval,timer,records=[];const started=Date.now(),historyOffset=resume?.generations.length||0;
  const snapshot=()=>{const s=coordinator.snapshot();return {phase:s.experiment.phase,generation:s.generation,updates:s.learningStats.updates,episodes:s.learningStats.episodes,archiveCells:s.experiment.archiveCells,gpu:{workers:coordinator.workers.length,actualGpuCalls:coordinator.workers.reduce((n,w)=>n+(w.cuda?.gpuCalls||0),0),cpuFallbacks:coordinator.workers.reduce((n,w)=>n+(w.cuda?.cpuFallbacks||0),0)}};};
  const done=new Promise((resolve,reject)=>{
    coordinator.on('error',e=>{if(!resolving){resolving=true;reject(e);}});
    coordinator.on('snapshot',s=>{
      // The coordinator now auto-resumes after a started generation. Capture
      // its completed history on the first snapshot of the next live batch.
      if(resolving||!s.history?.length||s.history.length<=historyOffset+records.length)return;
      if(generationsData.length!==records.length+1){resolving=true;reject(Error('Completed CMA generation was not ranked and recorded'));return;}
      const completed=generationsData.at(-1);completed.history=structuredClone(coordinator.history.at(-1));
      records.push(structuredClone(completed));
      console.log('STATEHEAD_CMA_GENERATION '+JSON.stringify({generation:completed.history.generation,bestProgress:completed.history.bestProgress,meanProgress:completed.history.meanProgress,maxLaps:completed.history.maxLaps,championProgress:completed.protectedChampion.progress,championLaps:completed.protectedChampion.laps,sigma:completed.sigma}));
      if(records.length>=generations){resolving=true;resolve('completed');}
    });
  });
  const wallGuard=new Promise(resolve=>{timer=setTimeout(()=>{if(!resolving){resolving=true;console.log('STATEHEAD_CMA_WALL_GUARD '+JSON.stringify(snapshot()));resolve('wall-guard-censored');}},wallMinutes*60*1000);});
  interval=setInterval(()=>console.log('STATEHEAD_CMA_PROGRESS '+JSON.stringify(snapshot())),10000);
  let reason='error',error=null;
  try{await coordinator.start();await coordinator.pause(true);reason=await Promise.race([done,wallGuard]);}
  catch(e){error=e.stack||String(e);reason='error';console.error(error);}
  finally{clearInterval(interval);clearTimeout(timer);if(reason==='wall-guard-censored')await coordinator.pause(false).catch(()=>{});await coordinator.close();Model.closeCuda();}
  const champion=coordinator.archive.champion;
  const modelUnchanged=hash(await fs.readFile(selected.file))===modelSha;
  const saveUnchanged=userSaveSha===null?null:hash(await fs.readFile(userSave))===userSaveSha;
  const bestObserved=records.flatMap(g=>g.results).sort(compareOutcome)[0]||null;
  const sourceHashes=sourceHashesAtStart;
  const report={format:'male-cns-statehead-cma-full-covariance-v1',appVersion:'5.6.0',settings:{model:'V3 state-head / Monza',modelFile:selected.file,modelSha256:modelSha,baselineProof:selected.proofFile,population,agentsPerGeneration:population,optimizerPopulation:population-1,optimizer:'full-covariance CMA-ES with rank-one/rank-mu updates and step-size adaptation',focus,optimizedCoefficients:dims,initialSigma:sigma,coefficientScale:focus==='full'?{steering:steeringScale,longitudinal:1}:{steering:0,longitudinal:1},unsafeProgressPenaltyMetres:explorationPenalty,unsafePenaltyScope:'CMA exploration ranking only; never promotion to the protected champion',seed,speed,workers:4,nodeVersion:process.versions.node,wallMinutes,requestedGenerations:generations,resumeFrom:resumeReportPath||null,resumeVerification:resumeVerificationPath?{path:path.resolve(resumeVerificationPath),sha256:resumeVerification.sha256}:null,optimizerStateContinuity:resume?'mean, covariance, sigma and generation restored; adaptation paths reset because prior report did not store them':'fresh'},method:`All candidates start from the line and use the verified MaleCNS policy, real sensed state and actual vehicle physics. CMA-ES learns correlations among ${dims} ${focus==='full'?'state-head':'longitudinal-only state-head'} coefficients from complete rollout outcomes. ${focus==='longitudinal'?'All steering coefficients are held exactly at the verified champion values. ':''}One verified clean champion is protected outside the sampled CMA population. Exploration rank uses completed laps, then physical progress minus ${explorationPenalty} m for unsafe/incomplete/censored/overlapping outcomes, then episodic fitness. This risk-adjusted score is used only to guide CMA-ES; champion promotion remains clean-only. No route, teacher action, scripted recovery, saved model, user save, production source, app release or existing progress is modified.`,baseline:selected.expected,complete:reason==='completed',reason,error,generations:records,cmaState:{mean:optimizer.mean.slice(),sigma:optimizer.sigma,covariance:optimizer.covariance.map(row=>row.slice()),generation:optimizer.generation,pc:optimizer.pc.slice(),ps:optimizer.ps.slice(),population:optimizer.population},protectedChampion:{progress:champion.progress,laps:champion.laps,fitness:champion.fitness,reason:champion.reason,lapTimes:champion.lapTimes?.slice()||[],weights:champion.weights.slice()},bestObserved:bestObserved&&{progress:bestObserved.progress,laps:bestObserved.laps,fitness:bestObserved.fitness,reason:bestObserved.reason,lapTimes:bestObserved.lapTimes.slice(),totalSimulationSeconds:bestObserved.totalSimulationSeconds,weights:bestObserved.weights.slice()},final:snapshot(),modelUnchanged,sourceHashes,userSave:{path:userSave,sha256:userSaveSha,unchanged:saveUnchanged},elapsedWallSeconds:(Date.now()-started)/1000,boundary:'A bounded single-seed search is not a generalization proof. A two-lap result must still be replayed from line, exactly reproduced, and checked across independent seeds before calling it learned or stable.'};
  if(resume){
    report.generations=[...resume.generations,...records];
    report.settings.initialSigma=resume.settings.initialSigma;
    report.settings.optimizerStateContinuity='mean, covariance, sigma, generation, evolution paths pc/ps, champion, prior history and lap-time reference restored';
    const best=report.generations.flatMap(g=>g.results).sort(compareOutcome)[0];
    report.bestObserved=best&&{progress:best.progress,laps:best.laps,fitness:best.fitness,reason:best.reason,lapTimes:best.lapTimes.slice(),totalSimulationSeconds:best.totalSimulationSeconds,weights:best.weights.slice()};
  }
  await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_CMA_REPORT '+JSON.stringify({complete:report.complete,reason,generations:records.map(g=>({generation:g.history.generation,bestProgress:g.history.bestProgress,meanProgress:g.history.meanProgress,maxLaps:g.history.maxLaps,championProgress:g.protectedChampion.progress,championLaps:g.protectedChampion.laps,sigma:g.sigma})),bestObserved:report.bestObserved&&{progress:report.bestObserved.progress,laps:report.bestObserved.laps,reason:report.bestObserved.reason},protectedChampion:report.protectedChampion,final:report.final,modelUnchanged,saveUnchanged,output:path.join(out,'report.json')}));
  if(reason!=='completed')process.exitCode=2;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
