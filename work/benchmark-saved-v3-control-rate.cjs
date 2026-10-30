'use strict';
// One-generation CPU ablation of V3's neural control cadence (10 Hz vs 20 Hz).
// Restores the original 40-agent Monza checkpoint; never writes the save/app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-control-rate-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing control-rate report');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),
    state=structuredClone(decoded.payload.workers[0].state),
    refPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-population-exact-control-20261021-01/report.json'),
    reference=JSON.parse(fs.readFileSync(refPath,'utf8')),
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    circuits=require(path.join(root,'outputs/data/circuits.json'));
  if(!reference.passed||reference.save?.sha256!==saveSha||state.generation!==64||state.population!==40||state.seed!==7717||state.rewardRevision!=='progress-3')
    throw Error('The original V3/Monza generation-64 checkpoint and exact baseline are required');
  const sourceHashes={simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  if(sourceHashes.simulation!==reference.sourceHashes.simulation||sourceHashes.learning!==reference.sourceHashes.learning)
    throw Error('Current application sources differ from the verified 10 Hz baseline');

  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
  const nativeInterval=sim.neuralInterval;sim.neuralInterval=3;
  let ticks=0,terminal=null;
  sim.onTrialTick=s=>{
    if(s.cars.every(car=>!car.alive))terminal=s.cars.map(car=>({id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
      reason:car.reason,safe:F.isSafeLearningOutcome(car),fitness:car.fitness,gas:car.outputs?.[1]||0,brake:car.outputs?.[2]||0})).sort((a,b)=>a.id-b.id);
  };
  while(sim.generation===64&&ticks<14000){sim.tick();ticks++;}
  if(sim.generation!==65||!terminal)throw Error('The complete 20 Hz generation did not finish naturally');
  const leader=terminal.filter(x=>x.safe).sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0],laps=Math.max(...terminal.map(x=>x.laps)),
    populationBestSafeM=Math.max(...terminal.filter(x=>x.safe).map(x=>x.progressM)),
    saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const result={format:'male-cns-saved-v3-control-rate-ablation-v1',appVersion:'5.6.0',passed:saveUnchanged,
    learningSucceeded:laps>=1,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},sourceHashes,
    settings:{runtime:'Node 24.19.0 CPU V3 solver',fullOriginalPopulation:true,baselineControlRateHz:60/nativeInterval,candidateControlRateHz:60/3,physicsHz:60,simulationSteps:ticks,trainingUpdates:1},
    comparison:{baseline10Hz:{leader:reference.outcomes.actualLeader,progressM:reference.outcomes.expectedSafeMaximumM,laps:reference.outcomes.actualLeader.laps,reason:reference.outcomes.actualLeader.reason,
        exactNeuralTelemetry:reference.neuralTrace.exact,matchedSamples:reference.neuralTrace.matchedSamples},candidate20Hz:{leader,populationBestSafeM,laps,terminalReasonCounts:terminal.reduce((counts,car)=>(counts[car.reason]=(counts[car.reason]||0)+1,counts),{}),
        safeAgentCount:terminal.filter(x=>x.safe).length,terminal}},
    method:'Restores the exact supplied 40-genome V3 checkpoint and runs one complete natural generation with the same 60 Hz physical step, same brains, actions, sensors, physics, rewards, mutation, seed and population. The only intervention is recomputing neural observations/actions every 3 rather than every 6 physical ticks (20 Hz instead of 10 Hz). No route cue, action override, decoder change or reward change is introduced.',
    boundary:'This is a one-generation cadence ablation, not proof of learning convergence. A better single-generation result requires multi-generation, full-start replication before any production change. The app sources, save, version, release, portable and installer are not changed.'};
  if(!saveUnchanged)throw Error('Original save hash changed during the replay');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_CONTROL_RATE_RESULT '+JSON.stringify({passed:result.passed,baseline10Hz:result.comparison.baseline10Hz,candidate20Hz:{leader,populationBestSafeM,laps,terminalReasonCounts:result.comparison.candidate20Hz.terminalReasonCounts,safeAgentCount:result.comparison.candidate20Hz.safeAgentCount},report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
