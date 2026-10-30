'use strict';
// Exact CPU-only continuation through the production DesktopEngine and workers.
// Restores the original save, including five worker states and champion sharing.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-desktop-engine-3gen-20261022-01');
const {DesktopEngine}=require(path.join(root,'desktop/engine.cjs'));
const P=require(path.join(root,'outputs/progress-save.js'));
const F=require(path.join(root,'outputs/simulation.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['desktop/engine.cjs','desktop/worker.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing desktop-engine benchmark');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes);
  const decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),payload=decoded.payload;
  if(payload.appVersion==='')throw Error('Unexpected decoded save');
  if(payload.modelId!=='v3'||payload.circuitId!=='monza'||payload.workers.length!==5)throw Error('Expected the original five-worker V3/Monza save');
  const before=sourceHashes();
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const sim=new F.Simulation(data,{modelId:'v3',population:payload.workers[0].state.population,circuitId:'monza',circuits});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
  const pxPerMeter=sim.track.pixelsPerMeter;
  const starts=payload.workers.map(({state})=>({generation:state.generation,seed:state.seed}));
  const targets=starts.map(row=>row.generation+3),paused=Array(starts.length).fill(false),errors=[];
  const engine=new DesktopEngine(path.join(root,'outputs'),()=>{},error=>errors.push(String(error?.stack||error)),null);
  let interval=null;
  try{
    await engine.restoreProgress(payload,null);
    await engine.command({type:'pause',value:true});
    const started=Date.now(),timeoutMs=20*60*1000;
    await new Promise((resolve,reject)=>{
      interval=setInterval(()=>{
        for(let i=0;i<targets.length;i++){
          const state=engine.states[i];
          if(!paused[i]&&Number(state?.generation)>=targets[i]){
            engine.workers[i]?.postMessage({type:'pause',value:false});paused[i]=true;
          }
        }
        if(errors.length){clearInterval(interval);interval=null;reject(Error(errors.join('\n')));return;}
        if(paused.every(Boolean)){clearInterval(interval);interval=null;resolve();return;}
        if(Date.now()-started>timeoutMs){clearInterval(interval);interval=null;reject(Error('Timed out before all five workers completed three generations: '+JSON.stringify({targets,states:engine.states.map(s=>s?.generation),paused})));}
      },50);
    });
    const result=await engine.exportProgress();
    if(result.workers.some(({state},i)=>state.generation!==targets[i]))
      throw Error('A worker advanced beyond its exact three-generation target: '+JSON.stringify(result.workers.map(({state})=>state.generation)));
    if(errors.length)throw Error(errors.join('\n'));
    const workers=result.workers.map(({index,state})=>{
      // In this app history labels each completed generation with the
      // pre-increment generation id; the saved simulation counter is +1.
      const rows=state.history.filter(h=>h.generation>=starts[index].generation&&h.generation<targets[index]);
      if(rows.length!==3)throw Error('Missing generation history for worker '+index+': '+rows.length);
      return {worker:index,startGeneration:starts[index].generation,seed:starts[index].seed,targetGeneration:targets[index],
        rows:rows.map(h=>({generation:h.generation,bestProgressM:h.bestProgress/pxPerMeter,meanProgressM:h.meanProgress/pxPerMeter,
          maxLaps:h.maxLaps,bestLapTime:h.bestLapTime,fitness:h.best,noLapCount:h.noLapCount,slowerLapCount:h.slowerLapCount,
          immigrantCount:h.immigrantCount,stagnation:h.stagnation,rewardRevision:h.rewardRevision})),
        finalBestEver:state.bestEver,finalChampionStats:state.championStats,
        finalExternalChampionSha256:state.externalChampion?sha(JSON.stringify(state.externalChampion)):null};
    });
    const maxLaps=Math.max(...workers.flatMap(w=>w.rows.map(r=>r.maxLaps||0)));
    const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,after=sourceHashes();
    const sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after);
    const report={format:'male-cns-saved-v3-desktop-engine-five-worker-three-generation-v1',appVersion:'5.6.0',
      passed:saveUnchanged&&sourcesUnchanged&&workers.length===5&&workers.every(w=>w.rows.length===3)&&errors.length===0,
      learningSucceeded:maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',workers:5,
        populationPerWorker:payload.workers[0].state.population,rewardRevision:payload.workers[0].state.rewardRevision,
        globalChampionWorker:payload.globalChampion?.workerIndex??null,globalChampionStats:payload.globalChampion?.stats??null},
      runtime:'Node 24.19.0 CPU-only; production DesktopEngine and desktop/worker.cjs; five real worker_threads',
      settings:{naturalGenerationsPerWorker:3,speedMultiplier:payload.workers[0].state.speedMultiplier,
        allSavedWorkerStatesRestored:true,globalChampionBroadcastsEnabledAfterRestore:true},
      summary:{workerGenerations:workers.reduce((sum,w)=>sum+w.rows.length,0),maxLaps,
        bestProgressM:Math.max(...workers.flatMap(w=>w.rows.map(r=>r.bestProgressM))),
        finalGlobalChampionWorker:engine.globalChampionWorker,finalGlobalChampionStats:engine.globalChampionStats,
        finalGlobalChampionSha256:engine.globalChampion?sha(JSON.stringify(engine.globalChampion)):null,
        crossWorkerAdoptionObserved:workers.some(w=>w.finalExternalChampionSha256!==null)},
      method:'Restores the unmodified .malecns-save through production DesktopEngine.restoreProgress, runs the five production worker_threads CPU-only at their saved settings, and pauses each worker at exactly three generations beyond its own saved generation. Production compareAgents and cross-worker champion broadcasts remain active. Captures worker checkpoints using the application progress-export API. No reward migration, code patch, decoder change, or physical intervention.',
      workers,sourceHashes:{before,after,unchanged:sourcesUnchanged},
      boundary:'One V3 Monza save and one three-generation continuation. This directly tests the production multi-worker path, but does not prove convergence or generalization to other seeds, circuits, or models.'};
    if(!report.passed)throw Error('Integrity, save preservation, or generation-count check failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('DESKTOP_ENGINE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      saveUnchanged,sourcesUnchanged,maxLaps,bestProgressM:report.summary.bestProgressM,
      workers:workers.map(w=>({worker:w.worker,rows:w.rows.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,immigrantCount:r.immigrantCount}))})),
      finalGlobalChampionWorker:engine.globalChampionWorker,finalGlobalChampionStats:engine.globalChampionStats,
      report:path.join(out,'report.json')}));
  }finally{
    if(interval)clearInterval(interval);
    await engine.stop();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
