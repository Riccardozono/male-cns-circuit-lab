'use strict';
// In-memory shadow comparison of the saved V3 checkpoint's legacy reward vs
// the current brake-lock reward. Never encodes or writes a migrated save.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-revision-ab-20261021-01'));
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function runArm(data,circuits,payload,state,control,revisionOverride,label){
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);
  if(revisionOverride){sim.rewardRevision=revisionOverride;for(const car of sim.cars)car.rewardRevision=revisionOverride;}
  const startGeneration=sim.generation,trialCars=sim.cars.slice(),expected=control.treatment.results[0].outcomes,terminal=new Map();
  sim.running=true;sim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});};
  let ticks=0;while(sim.generation===startGeneration&&ticks++<60000)sim.tick();
  if(sim.generation===startGeneration||terminal.size!==state.population)throw Error(label+': saved generation failed to terminate completely');
  const physical=[...terminal.values()].sort((a,b)=>a.id-b.id);
  if(JSON.stringify(physical)!==JSON.stringify(expected))throw Error(label+': physical outcomes did not match the protected baseline');
  const safe=trialCars.filter(F.isSafeLearningOutcome),ranked=safe.slice().sort(F.compareLearningAgents),progressLeader=safe.slice().sort((a,b)=>b.bestProgress-a.bestProgress||F.compareLearningAgents(a,b))[0]||null;
  const firstGenerationGenome=JSON.stringify(sim.cars[0].genome),selectedParent=trialCars.find(car=>JSON.stringify(car.genome)===firstGenerationGenome);
  if(!selectedParent)throw Error(label+': could not identify the selected saved-generation parent');
  const metrics=trialCars.map(car=>({id:car.id,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,reason:car.reason,
    safe:F.isSafeLearningOutcome(car),fitness:car.fitness,stallPenalty:car.rewardBreakdown.penalties.stall,
    terminalSpeedMps:car.vehicle?.speedMps??car.speed??0,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0}));
  const selectedMetric=metrics.find(row=>row.id===selectedParent.id);
  sim.running=false;
  return {label,rewardRevision:revisionOverride||state.rewardRevision,ticks,physicalOutcomesMatchedBaseline:true,safeCount:safe.length,
    progressLeader:progressLeader?{id:progressLeader.id,progressM:progressLeader.bestProgress/(progressLeader.pixelsPerMeter||1),laps:progressLeader.laps,fitness:progressLeader.fitness}:null,
    selectedParent:{id:selectedParent.id,progressM:selectedMetric.progressM,laps:selectedMetric.laps,fitness:selectedMetric.fitness,
      stallPenalty:selectedMetric.stallPenalty,terminalSpeedMps:selectedMetric.terminalSpeedMps,gas:selectedMetric.gas,brake:selectedMetric.brake},
    topFiveSafe:ranked.slice(0,5).map(car=>{const row=metrics.find(item=>item.id===car.id);return {id:row.id,progressM:row.progressM,laps:row.laps,fitness:row.fitness,stallPenalty:row.stallPenalty,gas:row.gas,brake:row.brake};}),
    metrics};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing brake-lock comparison');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8')),
    raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(!control.passed||decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||
    state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  try{
    const baseline=runArm(data,circuits,decoded.payload,state,control,null,'progress-3 baseline');
    const brakeLock=runArm(data,circuits,decoded.payload,state,control,F.Rewards.REVISION,'current brake-lock reward');
    const oldById=new Map(baseline.metrics.map(row=>[row.id,row])),deltas=brakeLock.metrics.map(row=>({id:row.id,
      progressM:row.progressM,addedStallPenalty:row.stallPenalty-oldById.get(row.id).stallPenalty,fitnessDelta:row.fitness-oldById.get(row.id).fitness,
      gas:row.gas,brake:row.brake,reason:row.reason}));
    const added=deltas.map(row=>row.addedStallPenalty).filter(value=>value>0),gpu=Cuda.stats(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
    const report={format:'male-cns-saved-v3-brake-lock-revision-shadow-ab-v1',appVersion:'5.6.0',passed:true,
      learningSucceeded:false,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      method:'Replay the exact saved generation-64 population twice on the same RTX 4060 path and current physics. The treatment changes only the in-memory rewardRevision on the restored current-generation cars to the app current revision; it does not alter neural weights, actions, sensors, physics, save bytes, or write a migrated file. The exact 40 physical outcomes in both arms must match the saved control. Compare safe-agent selection, stall penalties and the first next-generation parent.',
      currentRewardRevision:F.Rewards.REVISION,arms:{baseline,brakeLock},summary:{physicalOutcomesIdentical:true,baselineSelectedParentId:baseline.selectedParent.id,
        brakeLockSelectedParentId:brakeLock.selectedParent.id,selectedParentChanged:baseline.selectedParent.id!==brakeLock.selectedParent.id,
        agentsWithAddedStallPenalty:added.length,addedStallPenaltyMin:added.length?Math.min(...added):0,addedStallPenaltyMax:added.length?Math.max(...added):0,
        maxProgressM:Math.max(...brakeLock.metrics.map(row=>row.progressM)),twoLapAgents:brakeLock.metrics.filter(row=>row.laps>=2).length,
        addedStallPenalties:deltas.filter(row=>row.addedStallPenalty>0)},gpu,
      sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:'One exact V3 parent generation on Monza and one in-memory scoring overlay. It tests whether the existing brake-lock penalty changes selection; it is not a persistent save migration or proof of long-term learning. No user save, application source, version or release is written.'};
    if(!saveUnchanged||gpu.gpuCalls===0||gpu.cpuFallbacks!==0||!report.summary.physicalOutcomesIdentical)throw Error('Save, CUDA, or paired-physics verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('BRAKE_LOCK_REVISION_AB '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,summary:report.summary,
      baselineSelected:baseline.selectedParent,brakeLockSelected:brakeLock.selectedParent,gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
