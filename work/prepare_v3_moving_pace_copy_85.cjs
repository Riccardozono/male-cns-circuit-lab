'use strict';
// Make an explicitly experimental COPY of the user's known V3 save. Training
// genomes/RNG/optimizer are preserved; stale fitness records and history are
// cleared because the reward revision changed. The original is never written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/saved-v3-moving-pace-copy-20261027-85');
const source='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expected='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const P=require('../outputs/progress-save.js'),F=require('../outputs/simulation.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const OldEngine=require('../dist-landscape-v560/win-unpacked/resources/app/desktop/engine.cjs').DesktopEngine;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),shaFile=f=>sha(fs.readFileSync(f));
const identity=g=>JSON.stringify(g),clone=v=>JSON.parse(JSON.stringify(v));
const check=(condition,message)=>{if(!condition)throw Error(message);};
async function main(){
  check(!fs.existsSync(out)&&shaFile(source)===expected,'Existing destination or unexpected original save');
  check(F.Rewards.REVISION==='progress-7-moving-pace','Unexpected development reward revision');
  const original=(await P.decode(fs.readFileSync(source,'utf8'),'5.6.0')).payload;
  check(original.modelId==='v3'&&original.circuitId==='monza'&&original.workers.length===5&&
    original.workers.every(w=>w.state.population===40&&w.state.rewardRevision==='progress-3'),'Unexpected saved session');
  const migrated=clone(original),details=[];
  for(const worker of migrated.workers){
    const state=worker.state,originalState=original.workers[worker.index].state;
    const population=new Set(state.genomes.map(identity));
    const mustRetain=[originalState.champion,originalState.externalChampion,...originalState.hallOfFame.map(x=>x.genome)].filter(Boolean);
    const unrepresented=[...new Map(mustRetain.filter(g=>!population.has(identity(g))).map(g=>[identity(g),g])).values()];
    const oldExternal=state.externalChampion;
    if(oldExternal){
      check(unrepresented.every(g=>identity(g)===identity(oldExternal)),
        'More than one archived genome is outside the population; no automatic migration');
    }else if(unrepresented.length){
      check(unrepresented.length===1,'More than one archived genome is outside the population; no automatic migration');
      state.externalChampion=clone(unrepresented[0]);
    }
    const retained=new Set([...state.genomes.map(identity),...(state.externalChampion?[identity(state.externalChampion)]:[])]);
    check(mustRetain.every(g=>retained.has(identity(g))),'A trained or archived genotype would be lost');
    const historyEntries=state.history.length,archiveRecords=state.hallOfFame.length;
    state.rewardRevision=F.Rewards.REVISION;state.history=[];state.elapsedAtSave=0;state.stagnation=0;
    state.learningFrontier={progress:0,laps:0,lapTime:null};state.bestEver=null;state.champion=null;
    state.championStats=null;state.hallOfFame=[];
    check(identity(state.genomes)===identity(originalState.genomes)&&identity(state.optimizer)===identity(originalState.optimizer)&&
      state.generation===originalState.generation&&state.rngState===originalState.rngState,'Training state changed during copy');
    details.push({index:worker.index,generation:state.generation,population:state.population,
      optimizerUpdates:state.optimizer.updates,optimizerEpisodes:state.optimizer.episodes,
      clearedHistoryEntries:historyEntries,clearedScoredArchiveRecords:archiveRecords,
      archivedGenomesOutsidePopulation:unrepresented.length,externalChampionAdded:!oldExternal&&Boolean(state.externalChampion)});
  }
  const globalKey=original.globalChampion&&identity(original.globalChampion.genome);
  if(globalKey)check(migrated.workers.some(w=>w.state.genomes.some(g=>identity(g)===globalKey)||
    w.state.externalChampion&&identity(w.state.externalChampion)===globalKey),'Global champion genome would be lost');
  migrated.globalChampion=null;
  const errors=[],engine=new DesktopEngine(path.join(root,'outputs'),()=>{},error=>errors.push(error.message));
  const oldRoot=path.join(root,'dist-landscape-v560/win-unpacked/resources/app');
  const oldEngine=new OldEngine(path.join(oldRoot,'outputs'),()=>{},()=>{});
  let restored;
  try{
    await engine.validateProgress(original);await engine.validateProgress(migrated);
    let rejected=false;
    try{await oldEngine.validateProgress(migrated);}catch(error){rejected=/ricompense incompatibile/i.test(error.message);}
    check(rejected,'The published 5.6.0 copy must reject the experimental reward revision');
    const encoded=await P.encode(migrated,'5.6.0'),decoded=await P.decode(encoded,'5.6.0');
    await engine.restoreProgress(decoded.payload);
    await engine.exportProgress();await engine.exportProgress();restored=await engine.exportProgress();
    check(engine.options.running===false&&engine.workers.length===5,'Restored copy did not remain paused with all workers');
    check(identity(restored)===identity(migrated),'Worker round-trip changed the migrated state');
    check(errors.length===0,'Native worker errors: '+errors.join('; '));
    check(shaFile(source)===expected,'Original save changed');
    fs.mkdirSync(out,{recursive:false});
    const destination=path.join(out,'SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
    fs.writeFileSync(destination,encoded,{encoding:'utf8',flag:'wx',mode:0o600});
    const reread=await P.decode(fs.readFileSync(destination,'utf8'),'5.6.0');
    check(identity(reread.payload)===identity(migrated)&&shaFile(source)===expected,'Written copy or original failed readback');
    const report={passed:true,readyForRelease:false,appVersion:'5.6.0',model:'v3',circuit:'monza',
      sourceSaveSha256:expected,sourceSaveUnchanged:true,copyFile:path.basename(destination),copySha256:shaFile(destination),
      originalRewardRevision:'progress-3',copyRewardRevision:F.Rewards.REVISION,
      populationGenomesAndOptimizerPreserved:true,allWorkerChampionsAndArchivedGenomesRetained:true,
      staleScoresHistoryAndScoredArchivesCleared:true,globalChampionScoreCleared:true,
      optimizerHistoricalCountersPreserved:true,details,workerRoundTripIdentical:true,workers:engine.workers.length,
      paused:true,published560RejectsNewReward:true,desktopWorkerErrors:errors,
      runnerSha256:shaFile(__filename),appRewardSha256:shaFile(path.join(root,'outputs/rewards.js')),
      boundary:'Experimental local COPY for the source development app only. Existing scores and histories are not comparable and were reset; original remains untouched. No improved-lap or release claim.'};
    const reportFile=path.join(out,'report.json');fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    console.log('MOVING_PACE_EXPERIMENTAL_COPY '+JSON.stringify({report:reportFile,reportSha256:shaFile(reportFile),copy:destination,
      copySha256:report.copySha256,workers:report.workers,paused:report.paused,oldReleaseRejects:report.published560RejectsNewReward,details}));
  }finally{await engine.stop();await oldEngine.stop();}
}
main().catch(error=>{console.error('MOVING_PACE_EXPERIMENTAL_COPY_FAILED '+(error.stack||error));process.exitCode=1;});
