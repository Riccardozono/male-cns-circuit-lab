'use strict';

// Fitness-only local search around the independently verified V3/Monza
// champion. Each candidate runs a real complete from-line episode on the
// ordinary CPU engine. No teacher, route, action tape, imported save, UI, or
// user profile is involved. Candidates are never promoted by this script.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const Model=require('./neural-chain-desktop-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),Live=require('./neural-command-live.cjs'),Affine=require('./neural-affine-motor.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.impeccable/review/neural-affine-motor-20261020-01'),reportFile=path.join(directory,'paired-full-episodes.json');
const MAX_CONTROLS=30000,axes=[
  ['steer-log-gain',[.08,0,0,0]],['steer-log-gain',[-.08,0,0,0]],['steer-bias',[0,.08,0,0]],['steer-bias',[0,-.08,0,0]],
  ['longitudinal-log-gain',[0,0,.08,0]],['longitudinal-log-gain',[0,0,-.08,0]],['longitudinal-bias',[0,0,0,.08]],['longitudinal-bias',[0,0,0,-.08]]
];
const hashBytes=value=>crypto.createHash('sha256').update(value).digest('hex'),sourceFiles=['work/benchmark-neural-affine-motor.cjs','work/neural-affine-motor.cjs','work/neural-chain-desktop-model.cjs','work/neural-frontier-chain.cjs','work/neural-command-live.cjs','.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/simulation.js'];
function run(loaded,weights,label,topology=null){
  const started=performance.now(),trace=crypto.createHash('sha256');let env;
  if(weights.every(value=>value===0))env=Model.createFromLoaded(loaded,{sharedTopology:topology});
  else{
    const brain=Chain.controller(loaded.inner);
    env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.inner.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
      onReset:()=>brain.reset(),actionOverride:(_model,raw)=>brain.observe(raw),
      motorOverride:(_model,_raw,prior)=>Affine.compose(brain.compose(prior,loaded.data.weights),weights)});
  }
  if(!topology)topology=env.topology;
  let state;
  for(let control=0;control<MAX_CONTROLS;control++){
    state=env.step();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');
    if(state.complete)break;
  }
  const completed=Boolean(state?.complete),result={label,affineWeights:weights.slice(),complete:completed,censored:!completed,controls:state?.ticks||0,bestProgress:state?.bestProgress||0,
    laps:state?.laps||0,lapTimes:state?.lapTimes||[],reason:state?.reason||'limite del solo harness',totalSimulationSeconds:state?.totalSimulationSeconds||0,
    fitness:state?.fitness??null,baseFitness:state?.car?.baseFitness??null,rewardBreakdown:state?.car?.rewardBreakdown||null,finalOutputs:state?.car?.outputs||null,
    actionTraceSha256:trace.digest('hex'),wallSeconds:+((performance.now()-started)/1000).toFixed(3)};
  if(env!==null)env.close?.();return {result,topology};
}
async function main(){
  if(fs.existsSync(reportFile))throw Error('Il report di questa prova esiste già; non verrà sovrascritto.');
  const choice=Model.defaultChoice(),loaded=Model.load(choice.file),beforeModel=hashBytes(fs.readFileSync(choice.file));
  console.log('AFFINE_BASELINE_START '+JSON.stringify({modelSha256:choice.modelSha256,expected:choice.result}));
  const baselineRun=run(loaded,[0,0,0,0],'identity-baseline'),baseline=baselineRun.result;
  if(!baseline.complete||baseline.censored||baseline.bestProgress!==choice.result.bestProgress||baseline.laps!==choice.result.laps||baseline.fitness!==choice.result.fitness||baseline.reason!==choice.result.reason||baseline.actionTraceSha256!==choice.actionTraceSha256)throw Error('L’episodio baseline non coincide esattamente con il campione verificato; nessun candidato viene valutato.');
  const results=[baseline];let topology=baselineRun.topology;
  for(const [index,[name,weights]]of axes.entries()){
    const item=run(loaded,weights,`${name} ${weights.find(v=>v!==0)>0?'+':'−'}`,topology);topology=item.topology;results.push(item.result);
    console.log('AFFINE_CANDIDATE_DONE '+JSON.stringify({index:index+1,...item.result}));
  }
  if(hashBytes(fs.readFileSync(choice.file))!==beforeModel)throw Error('Il modello genitore è cambiato durante il benchmark.');
  const cleanImprovements=results.slice(1).filter(r=>r.complete&&!r.censored&&r.laps>=choice.result.laps&&r.bestProgress>choice.result.bestProgress+1e-6&&!['urto','fuori pista'].includes(r.reason));
  const report={format:'male-cns-affine-motor-real-episode-search-v1',passed:baseline.complete&&results.length===9&&results.every(r=>r.complete&&!r.censored),appVersion:'5.6.0',model:'V3 / Monza independently verified clean warm start',modelFile:choice.file,modelSha256:choice.modelSha256,verifiedAnchor:choice.result,anchorTraceSha256:choice.actionTraceSha256,
    settings:{candidateCount:8,parameters:4,mutationOnly:null,search:'symmetric ±0.08 one-coordinate perturbations around exact identity',engine:'actual CPU physics + current MaleCNS parent + progress-5 crash-safety scoring',maxControlsPerEpisode:MAX_CONTROLS},
    results,cleanImprovements,sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,hashBytes(fs.readFileSync(path.join(root,f)))])),modelUnchanged:hashBytes(fs.readFileSync(choice.file))===beforeModel,
    boundary:'One model/circuit and one seed-local neighbourhood only. Actual complete natural episodes, no imposed driving or max-time finish; harness censor guard is 30,000 controls. No candidate is promoted. Any improvement still requires fresh full-line and independent native verification; this is not a 2-lap or cross-model result.'};
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('AFFINE_BENCHMARK_DONE '+JSON.stringify({passed:report.passed,reportFile,baseline:{bestProgress:baseline.bestProgress,laps:baseline.laps,fitness:baseline.fitness},candidates:results.slice(1).map(r=>({weights:r.affineWeights,bestProgress:r.bestProgress,laps:r.laps,fitness:r.fitness,reason:r.reason,wallSeconds:r.wallSeconds})),cleanImprovements:cleanImprovements.length,modelUnchanged:report.modelUnchanged}));
}
main().catch(error=>{console.error('AFFINE_BENCHMARK_FAILED '+(error.stack||error));process.exitCode=1;});
