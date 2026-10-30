'use strict';
// Continue the exact protected V3/Monza checkpoint in memory for a bounded
// number of natural generations and measure safe physical progress.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_STAGNATION_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-restored-stagnation-20261020-01'));
const generationCount=Math.max(1,Math.min(20,Number.parseInt(process.env.MALECNS_V3_STAGNATION_GENERATIONS||'5',10)||5));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing continuation benchmark');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state),sourceRewardRevision=state.rewardRevision;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')throw Error('Exact protected V3/Monza checkpoint required');
  const runRewardRevision=process.env.MALECNS_V3_STAGNATION_REWARD_REVISION||sourceRewardRevision;
  if(!F.Rewards.SUPPORTED_REVISIONS.includes(runRewardRevision))throw Error('Unsupported diagnostic reward revision');
  if(runRewardRevision!==sourceRewardRevision){state.rewardRevision=runRewardRevision;for(const entry of state.history)entry.rewardRevision=runRewardRevision;}
  const previous=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  if(previous.save.sha256!==saveSha)throw Error('Protected save differs from its verified benchmark');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);
  const initial={generation:sim.generation,stagnation:sim.stagnation,frontier:{...sim.safeLearningFrontier},learningFrontier:{...sim.learningFrontier}};
  if(initial.stagnation!==58||initial.frontier.progress!==797.1785507196187)throw Error('Expected restored stagnation and safe frontier did not load');
  sim.running=true;const expected=previous.treatment.results[0].outcomes,records=[];let generation=sim.generation,terminal=new Map(),ticks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.generation!==generation){generation=s.generation;terminal=new Map();}
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',safe:F.isSafeLearningOutcome(car),bestLapTime:Number.isFinite(car.bestLapTime)?car.bestLapTime:null,
      speedMps:car.vehicle?.speedMps??0,outputs:Array.isArray(car.outputs)?car.outputs.slice():[],gear:car.vehicle?.gear??null,rpm:car.vehicle?.rpm??null,
      rewardRevision:car.rewardRevision??null,brakeLockSeconds:car.rewardState?.brakeLockSeconds??0,stallPenalty:car.rewardBreakdown?.penalties?.stall??null,
      axMps2:car.axMps2??null,ayMps2:car.ayMps2??null,onRoad:F.onRoad?.(s.track,car.x,car.y)??null});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('RESTORED_STAGNATION_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size}));}
  };
  const startGeneration=sim.generation,targetGeneration=startGeneration+generationCount;
  while(sim.generation<targetGeneration){
    const before=sim.generation,countBefore=terminal.size;
    ticks=0;while(sim.generation===before&&ticks++<60000)sim.tick();
    if(sim.generation===before||terminal.size!==state.population)throw Error(`Generation ${before} did not complete with all terminal outcomes`);
    const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(row=>row.safe),expectedForGeneration=before===64?expected:null;
    if(expectedForGeneration){const projected=outcomes.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));if(JSON.stringify(projected)!==JSON.stringify(expectedForGeneration))throw Error('Generation-64 outcomes changed during the restored-source control');}
    const row=sim.history.at(-1);
    const bestSafeAgent=safe.slice().sort((a,b)=>b.progressM-a.progressM||b.laps-a.laps)[0]||null;
    records.push({generation:row.generation,ticks,
      safeAgentCount:safe.length,bestSafeProgressM:safe.length?Math.max(...safe.map(a=>a.progressM)):null,
      bestSafeAgent,
      maxSafeLaps:safe.length?Math.max(...safe.map(a=>a.laps)):0,bestSafeLapTime:safe.reduce((best,a)=>a.bestLapTime!==null?Math.min(best,a.bestLapTime):best,Infinity)===Infinity?null:safe.reduce((best,a)=>a.bestLapTime!==null?Math.min(best,a.bestLapTime):best,Infinity),
      overallProgressM:row.bestProgress/(sim.track.pixelsPerMeter||1),overallMaxLaps:row.maxLaps,historyStagnation:row.stagnation,
      mutationAmount:row.mutationAmount,frontierOffspringCount:sim.lastFrontierOffspringCount??null,
      frontierParent:sim.lastFrontierDiagnostics?{...sim.lastFrontierDiagnostics}:null,
      safeFrontier:{...sim.safeLearningFrontier},outcomes});
    console.log('RESTORED_STAGNATION_GENERATION '+JSON.stringify({generation:row.generation,safeAgents:safe.length,bestSafeProgressM:records.at(-1).bestSafeProgressM,maxSafeLaps:records.at(-1).maxSafeLaps,stagnation:row.stagnation,mutationAmount:row.mutationAmount,frontierOffspringCount:sim.lastFrontierOffspringCount??null,frontierParent:sim.lastFrontierDiagnostics??null,bestSafeAgent}));
  }
  const sourceHashes={simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),progressSave:sha(fs.readFileSync(path.join(root,'outputs/progress-save.js'))),rewards:sha(fs.readFileSync(path.join(root,'outputs/rewards.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))),save:saveSha};
  const report={format:'male-cns-saved-v3-restored-stagnation-continuation-v1',appVersion:'5.6.0',passed:true,
    learningSucceeded:records.some(row=>row.maxSafeLaps>=2),save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,rewardRevision:sourceRewardRevision},
    trainingCopy:{rewardRevision:runRewardRevision,migratedInMemory:runRewardRevision!==sourceRewardRevision},
    initial,records,summary:{generations:records.length,bestSafeProgressM:Math.max(...records.map(r=>r.bestSafeProgressM||0)),maxSafeLaps:Math.max(...records.map(r=>r.maxSafeLaps)),bestSafeLapTime:records.reduce((best,r)=>r.bestSafeLapTime!==null?Math.min(best,r.bestSafeLapTime):best,Infinity)===Infinity?null:records.reduce((best,r)=>r.bestSafeLapTime!==null?Math.min(best,r.bestSafeLapTime):best,Infinity),finalStagnation:sim.stagnation,finalSafeFrontier:{...sim.safeLearningFrontier}},
    sourceHashes,method:`${generationCount} natural full-population generations continued from the exact user checkpoint with the corrected backward-compatible safe-frontier restoration. The first generation must reproduce all 40 previously verified physical outcomes; subsequent generations use the original evolution algorithm, higher stagnation mutation schedule and safe-progress frontier branch. Any reward-revision migration is applied only to this in-memory copy. CPU-only, all state in memory.`,
    boundary:'One historical save, one seed and Monza only. Progress beyond the prior safe archive frontier is evidence of local improvement, not a completed two-lap generation or proof of generalization. User save, version, release and training state were not written.'};
  if(!report.save.unchanged)throw Error('Original V3 save SHA changed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('RESTORED_STAGNATION_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged:report.save.unchanged,initial:report.initial,summary:report.summary,records:report.records.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,stagnation:r.historyStagnation,mutationAmount:r.mutationAmount,frontierOffspringCount:r.frontierOffspringCount})),report:path.join(out,'report.json')}));sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
