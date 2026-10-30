'use strict';
// Paired CUDA continuation from the protected V3/Monza generation-64 save.
// The sole treatment difference is whether the safe-progress high-water is
// rebased to the exact current-source generation-64 replay before evolution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_FRONTIER_REBASE_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-safe-frontier-rebase-ab-extended-20261021-01'));
const generations=Math.max(2,Math.min(5,Number.parseInt(process.env.MALECNS_V3_FRONTIER_REBASE_GENERATIONS||'5',10)||5));
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function physical(cars,ppm){return cars.map(car=>({id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing frontier-rebase report');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const oldControl=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-population-exact-control-20261021-01/report.json'),'utf8')),
    priorAb=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-safe-frontier-rebase-ab-20261021-01/report.json'),'utf8'));
  if(!oldControl.passed||!priorAb.passed||oldControl.sourceHashes.simulation!==priorAb.sourceHashes['simulation.js']||oldControl.outcomes.actualLeader.progressM!==733.8618224013283||oldControl.outcomes.actualLeader.laps!==0)throw Error('Pre-fix exact generation-64 leader control does not match');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  const arms=[];let gpu=null;
  try{
    for(const mode of ['historical-frontier','rebased-to-current-replay']){
      const armState=structuredClone(state),sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
      P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,armState);
      const restoredFrontier={...sim.safeLearningFrontier},restoredStagnation=sim.stagnation;
      if(restoredStagnation!==58||restoredFrontier.progress!==797.1785507196187)throw Error('Expected historical frontier/stagnation did not restore');
      if(mode==='rebased-to-current-replay')sim.safeLearningFrontier={progress:oldControl.outcomes.actualLeader.progressM*(sim.track.pixelsPerMeter||1),laps:0,lapTime:null};
      const initial={generation:sim.generation,stagnation:sim.stagnation,frontier:{...sim.safeLearningFrontier},restoredFrontier,restoredStagnation};
      const records=[];let generation=sim.generation,terminal=new Map(),lastLog=performance.now();sim.running=true;
      sim.onTrialTick=s=>{
        if(s.generation!==generation){generation=s.generation;terminal=new Map();}
        for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)});
        if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('FRONTIER_REBASE_PROGRESS '+JSON.stringify({arm:mode,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size}));}
      };
      const firstGeneration=sim.generation,start=performance.now();
      for(let index=0;index<generations;index++){
        const before=sim.generation,cars=sim.cars.slice();let ticks=0;
        while(sim.generation===before&&ticks++<60000)sim.tick();
        if(sim.generation===before||terminal.size!==state.population)throw Error(`${mode}: generation ${before} did not naturally finish all cars`);
        const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(row=>row.safe),history=sim.history.at(-1),ppm=sim.track.pixelsPerMeter||1;
        if(before===64){
          const leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||b.laps-a.laps)[0];
          if(!leader||leader.id!==3||Math.abs(leader.progressM-oldControl.outcomes.actualLeader.progressM)>1e-9||leader.laps!==0)throw Error(`${mode}: generation-64 exact replay leader differed from current-source control`);
        }
        const best=safe.slice().sort((a,b)=>b.progressM-a.progressM||b.laps-a.laps)[0]||null;
        const record={generation:history.generation,ticks,wallSeconds:(performance.now()-start)/1000,safeAgentCount:safe.length,
          bestSafeProgressM:best?.progressM??null,bestSafeAgent:best,maxSafeLaps:safe.length?Math.max(...safe.map(row=>row.laps)):0,
          stagnation:history.stagnation,mutationAmount:history.mutationAmount,frontierOffspringCount:sim.lastFrontierOffspringCount??null,
          frontierParent:sim.lastFrontierDiagnostics?{...sim.lastFrontierDiagnostics}:null,safeFrontier:{...sim.safeLearningFrontier},outcomes};
        records.push(record);terminal=new Map();
        console.log('FRONTIER_REBASE_GENERATION '+JSON.stringify({arm:mode,generation:record.generation,bestSafeProgressM:record.bestSafeProgressM,maxSafeLaps:record.maxSafeLaps,safeAgentCount:record.safeAgentCount,stagnation:record.stagnation,mutationAmount:record.mutationAmount,frontierOffspringCount:record.frontierOffspringCount}));
      }
      arms.push({mode,initial,records,summary:{generations:records.length,bestSafeProgressM:Math.max(...records.map(row=>row.bestSafeProgressM||0)),maxSafeLaps:Math.max(...records.map(row=>row.maxSafeLaps)),finalStagnation:sim.stagnation,finalFrontier:{...sim.safeLearningFrontier}}});
      sim.running=false;
    }
    gpu=Cuda.stats();
  }finally{Dense.step=originalDenseStep;Cuda.close();}
  const sourceHashes=Object.fromEntries(['simulation.js','progress-save.js','rewards.js','neural-learning.js','dense-neural.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const gen64A=arms[0].records[0].outcomes,gen64B=arms[1].records[0].outcomes;
  const generation64ExactAndPaired=JSON.stringify(gen64A)===JSON.stringify(gen64B),allGenerationOutcomesPaired=arms[0].records.length===arms[1].records.length&&arms[0].records.every((row,index)=>row.generation===arms[1].records[index].generation&&JSON.stringify(row.outcomes)===JSON.stringify(arms[1].records[index].outcomes));
  const currentSimulationHash=sha(fs.readFileSync(path.join(root,'outputs/simulation.js')));
  const report={format:'male-cns-saved-v3-safe-frontier-rebase-postfix-v1',appVersion:'5.6.0',passed:generation64ExactAndPaired&&allGenerationOutcomesPaired&&saveUnchanged&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
    learningSucceeded:arms.some(arm=>arm.records.some(row=>row.maxSafeLaps>=2)),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,rewardRevision:'progress-3'},
    settings:{naturalGenerationsPerArm:generations,checkpointPopulation:40,rewardRevisionMigration:false,onlyArmDifference:'Runtime safeLearningFrontier before the exact generation-64 replay: historical high-water versus current-source safe leader (733.8618224013283 m). All other saved state, including stagnation=58, is equal.'},
    generation64MatchedSavedBaseline:generation64ExactAndPaired,arms,gpu,sourceHashes,
    priorControl:{simulationHash:oldControl.sourceHashes.simulation,preFixAbSimulationHash:priorAb.sourceHashes['simulation.js'],postFixSimulationHash:currentSimulationHash},
    comparison:{bestSafeProgressDeltaM:arms[1].summary.bestSafeProgressM-arms[0].summary.bestSafeProgressM,maxSafeLapsDelta:arms[1].summary.maxSafeLaps-arms[0].summary.maxSafeLaps,
      sameGeneration64PhysicalOutcomes:generation64ExactAndPaired,samePhysicalOutcomesAcrossAllGenerations:allGenerationOutcomesPaired},
    method:'Post-fix paired CUDA replay. Both arms start from the same protected generation-64 save and differ only in their pre-evaluation runtime frontier. The new simulation logic should rebase both from fresh current-source evaluations, producing identical physical outcomes across all generations. The saved generation-64 leader is compared with the pre-fix exact trace; no training file is written.',
    boundary:'Single saved seed and Monza only; three generations per arm. Identical post-fix arms verify the rebase mechanism, not successful learning: neither arm is required to complete a lap. No app version, save, release, tag, portable or installer is changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FRONTIER_REBASE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,comparison:report.comparison,arms:arms.map(arm=>({mode:arm.mode,initial:arm.initial,summary:arm.summary})),gpu,report:path.join(out,'report.json')}));
  if(!report.passed)throw Error('Post-fix arms did not match or an integrity/CUDA check failed; diagnostic report was preserved');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
