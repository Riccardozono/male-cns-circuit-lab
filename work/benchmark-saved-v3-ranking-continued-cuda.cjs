'use strict';
// Three natural CUDA generations from the protected V3 checkpoint after
// changing safe learning ranking to prioritize laps/progress before pace.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_RANKING_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-ranking-continued-cuda-20261021-01'));
const generationCount=Math.max(1,Math.min(12,Number.parseInt(process.env.MALECNS_V3_RANKING_GENERATIONS||'3',10)||3));
const continuationPopulation=process.env.MALECNS_V3_RANKING_CONTINUATION_POPULATION;
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function physical(cars,ppm){return cars.map(car=>({id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason||''})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing ranking continuation report');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8')),
    raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(!control.passed||decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||
    state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const expandedPopulation=continuationPopulation===undefined?state.population:Number.parseInt(continuationPopulation,10);
  if(!Number.isInteger(expandedPopulation)||expandedPopulation<state.population||expandedPopulation>100)throw Error('Continuation population must be between the checkpoint population and 100');
  const runRewardRevision=process.env.MALECNS_V3_RANKING_REWARD_REVISION||state.rewardRevision;
  if(!F.Rewards.SUPPORTED_REVISIONS.includes(runRewardRevision))throw Error('Unsupported diagnostic reward revision');
  const historyReset=runRewardRevision!==state.rewardRevision;
  if(historyReset){state.rewardRevision=runRewardRevision;state.history=[];}
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  let sim=null;
  try{
    sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);
    const restoredPopulation=sim.cars.length;
    // Keep the checkpoint generation at its saved size, then expand only the
    // next generations. This research arm exists in memory and writes no save.
    sim.population=expandedPopulation;
    const initial={generation:sim.generation,stagnation:sim.stagnation,safeFrontier:{...sim.safeLearningFrontier},rewardRevision:sim.rewardRevision,
      checkpointPopulation:restoredPopulation,continuationPopulation:sim.population};
    sim.running=true;const records=[],start=performance.now();let terminal=null,lastLog=performance.now();
    sim.onTrialTick=s=>{
      if(s.cars.every(car=>!car.alive))terminal=physical(s.cars,s.track.pixelsPerMeter||1);
      if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('RANKING_CONTINUED_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(car=>car.alive).length,bestM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1)}));}
    };
    for(let index=0;index<generationCount;index++){
      const generation=sim.generation,cars=sim.cars.slice(),byGenome=new Map(cars.map(car=>[JSON.stringify(car.genome),car]));let ticks=0;
      while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation||!terminal||terminal.length!==cars.length)throw Error(`Generation ${generation} did not complete naturally`);
      const outcomes=terminal,expected=generation===64?control.treatment.results[0].outcomes:null;
      if(expected&&JSON.stringify(outcomes)!==JSON.stringify(expected))throw Error('Generation 64 did not exactly reproduce the protected physical outcomes');
      const safe=cars.filter(F.isSafeLearningOutcome),progressLeader=safe.slice().sort((a,b)=>b.bestProgress-a.bestProgress||F.compareLearningAgents(a,b))[0]||null,
        selected=byGenome.get(JSON.stringify(sim.cars[0].genome));
      if(!selected)throw Error(`Generation ${generation}: selected parent could not be traced to the evaluated population`);
      const h=sim.history.at(-1),ppm=sim.track.pixelsPerMeter||1,record={generation:h.generation,ticks,wallSeconds:(performance.now()-start)/1000,
        evaluatedPopulation:cars.length,nextPopulation:sim.population,bestProgressM:h.bestProgress/ppm,meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,maxSafeLaps:safe.length?Math.max(...safe.map(car=>car.laps)):0,safeAgentCount:safe.length,
        safeProgressLeader:progressLeader?{id:progressLeader.id,progressM:progressLeader.bestProgress/ppm,laps:progressLeader.laps,fitness:progressLeader.fitness}:null,
        selectedNextGenerationParent:{id:selected.id,progressM:selected.bestProgress/ppm,laps:selected.laps,fitness:selected.fitness,safe:F.isSafeLearningOutcome(selected)},
        stagnation:h.stagnation,mutationAmount:h.mutationAmount,frontierOffspringCount:sim.lastFrontierOffspringCount??null,
        frontierParent:sim.lastFrontierDiagnostics?{...sim.lastFrontierDiagnostics}:null,safeFrontier:{...sim.safeLearningFrontier},outcomes};
      records.push(record);terminal=null;
      console.log('RANKING_CONTINUED_GENERATION '+JSON.stringify({generation:record.generation,bestProgressM:record.bestProgressM,maxLaps:record.maxLaps,
        safeProgressLeader:record.safeProgressLeader,selectedNextGenerationParent:record.selectedNextGenerationParent,stagnation:record.stagnation}));
    }
    const gpu=Cuda.stats(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
      sourceHashes=Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
    const report={format:'male-cns-saved-v3-ranking-continued-cuda-v1',appVersion:'5.6.0',passed:true,
      learningSucceeded:records.some(row=>row.maxSafeLaps>=2),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,rewardRevision:decoded.payload.workers[0].state.rewardRevision},
      initial,trainingCopy:{rewardRevision:runRewardRevision,migratedInMemory:runRewardRevision!==decoded.payload.workers[0].state.rewardRevision,historyReset},
      settings:{naturalGenerations:generationCount,checkpointPopulation:restoredPopulation,continuationPopulation:expandedPopulation,
        selectionRule:'safe first; completed laps next; safe progress before first lap; fitness and lap time within equal lap count',noSaveMigration:true},
      generation64MatchedSavedBaseline:true,records,gpu,sourceHashes,
      summary:{generations:records.length,bestSafeProgressM:Math.max(...records.map(row=>row.safeProgressLeader?.progressM||0)),
        maxSafeLaps:Math.max(...records.map(row=>row.maxSafeLaps)),allSelectedParentsWereSafe:records.every(row=>row.selectedNextGenerationParent.safe),
        parentProgressByGeneration:records.map(row=>row.selectedNextGenerationParent.progressM),
        evaluatedPopulationByGeneration:records.map(row=>row.evaluatedPopulation)},
      boundary:'Three natural generations from one historical V3/Monza seed are local evidence, not proof of a completed two-lap generation or generalization. The saved generation-64 replay must match exactly. No user save, app version, release, tag, portable or installer is written.'};
    if(!saveUnchanged||gpu.gpuCalls===0||gpu.cpuFallbacks!==0||records.length!==generationCount)throw Error('Save, CUDA or generation-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('RANKING_CONTINUED_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,summary:report.summary,gpu,report:path.join(out,'report.json')}));
  }finally{if(sim)sim.running=false;Dense.step=originalDenseStep;Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
