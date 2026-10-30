'use strict';
// Verify backward-compatible restoration of the exact protected V3/Monza save.
// Runs one natural generation in memory and checks physical outcomes against
// the previous exact-source replay while confirming stagnation remains active.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_FRONTIER_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-safe-frontier-restore-20261020-01'));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing safe-frontier verification');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')throw Error('Exact protected V3/Monza checkpoint required');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  if(control.save.sha256!==saveSha)throw Error('Protected save no longer matches the verified control');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);
  const restoredFrontier={...sim.safeLearningFrontier},restoredStagnation=sim.stagnation;
  const expectedFrontier={progress:797.1785507196187,laps:0,lapTime:null};
  if(JSON.stringify(restoredFrontier)!==JSON.stringify(expectedFrontier)||restoredStagnation!==58)throw Error('Restored safe frontier/stagnation did not retain the verified historical plateau');
  sim.running=true;const expected=control.treatment.results[0].outcomes,terminal=new Map(),generation=sim.generation;let ticks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('SAFE_FRONTIER_RESTORE_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length}));}};
  while(sim.generation===generation&&ticks++<60000)sim.tick();
  const actual=[...terminal.values()].sort((a,b)=>a.id-b.id);
  if(sim.generation===generation||terminal.size!==state.population||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Generation outcomes did not reproduce the exact saved V3 reference');
  const result=sim.history.at(-1),summary={generationCompleted:sim.generation,generationRecord:result,frontierAfter:sim.safeLearningFrontier,
    frontierOffspringCount:sim.lastFrontierOffspringCount??null,terminalCount:terminal.size,outcomesExactlyMatch:true,saveSha256:saveSha,saveUnchanged:sha(fs.readFileSync(savePath))===saveSha};
  if(result.stagnation!==59||!result.mutationAmount||sim.safeLearningFrontier.progress!==expectedFrontier.progress||!summary.saveUnchanged)throw Error('Safe frontier did not drive prolonged exploration or protected save changed');
  const report={format:'male-cns-v3-safe-frontier-restore-verification-v1',appVersion:'5.6.0',passed:true,learningSucceeded:false,
    save:{sha256:saveSha,unchanged:summary.saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,rewardRevision:'progress-3'},
    restored:{stagnation:restoredStagnation,safeLearningFrontier:restoredFrontier,source:'maximum safe champion/hall-of-fame statistics; raw learningFrontier deliberately excluded'},
    verification:summary,
    sourceHashes:{simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),progressSave:sha(fs.readFileSync(path.join(root,'outputs/progress-save.js'))),save:saveSha},
    method:'Current-source restore of the exact user checkpoint; one natural generation replayed with all 40 terminal outcomes matched by ID, progress, laps and reason against the previous exact simulation trace. The historical safe archive boundary must remain above the current safe leader so stagnation increments instead of falsely resetting.',
    boundary:'One seed and one circuit only; this verifies backward-compatible checkpoint recovery and the intended exploration transition, not successful learning, a two-lap generation, or cross-circuit generalization. CPU-only; no user save or app version changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('SAFE_FRONTIER_RESTORE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,restored:report.restored,verification:report.verification,report:path.join(out,'report.json')}));sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
