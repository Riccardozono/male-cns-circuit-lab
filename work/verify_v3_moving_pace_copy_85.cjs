'use strict';
// Audit the original and experimental copy independently; no saved file is
// mutated and the desktop workers are not started by this readback verifier.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/learning-ml/saved-v3-moving-pace-copy-20261027-85');
const originalPath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const P=require('../outputs/progress-save.js'),F=require('../outputs/simulation.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const OldEngine=require('../dist-landscape-v560/win-unpacked/resources/app/desktop/engine.cjs').DesktopEngine;
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),key=g=>JSON.stringify(g);
const check=(v,msg)=>{if(!v)throw Error(msg);};
async function main(){
  const reportPath=path.join(dir,'report.json'),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  const copyPath=path.join(dir,report.copyFile),original=(await P.decode(fs.readFileSync(originalPath,'utf8'),'5.6.0')).payload,
    copy=(await P.decode(fs.readFileSync(copyPath,'utf8'),'5.6.0')).payload;
  check(report.passed&&hash(originalPath)===report.sourceSaveSha256&&hash(copyPath)===report.copySha256,'File identity differs');
  check(hash(path.join(root,'work/prepare_v3_moving_pace_copy_85.cjs'))===report.runnerSha256&&
    hash(path.join(root,'outputs/rewards.js'))===report.appRewardSha256,'Migration or application source differs');
  check(copy.modelId===original.modelId&&copy.circuitId===original.circuitId&&copy.workers.length===5&&copy.globalChampion===null,
    'Different session or retained old global score');
  for(let i=0;i<copy.workers.length;i++){
    const old=original.workers[i].state,fresh=copy.workers[i].state;
    check(fresh.rewardRevision===F.Rewards.REVISION&&fresh.rewardRevision==='progress-7-moving-pace','Wrong reward revision');
    for(const field of ['genomes','optimizer','generation','rngState','seed','population','mutation','speedMultiplier'])
      check(key(fresh[field])===key(old[field]),'Training state differs: '+field+' worker '+i);
    check(!fresh.history.length&&!fresh.hallOfFame.length&&fresh.champion===null&&fresh.championStats===null&&fresh.bestEver===null&&
      fresh.stagnation===0&&fresh.learningFrontier.progress===0&&fresh.learningFrontier.laps===0&&fresh.learningFrontier.lapTime===null,
      'Incompatible old score was retained for worker '+i);
    const retained=new Set(fresh.genomes.map(key));if(fresh.externalChampion)retained.add(key(fresh.externalChampion));
    const known=[old.champion,old.externalChampion,...old.hallOfFame.map(x=>x.genome)].filter(Boolean);
    check(known.every(g=>retained.has(key(g))),'A known genotype was lost for worker '+i);
    if(old.externalChampion)check(key(fresh.externalChampion)===key(old.externalChampion),'External champion changed');
    else if(fresh.externalChampion)check(old.hallOfFame.some(x=>key(x.genome)===key(fresh.externalChampion)),
      'New external champion is not an archived genotype');
  }
  const champion=key(original.globalChampion.genome);
  check(copy.workers.some(w=>w.state.genomes.some(g=>key(g)===champion)||key(w.state.externalChampion)===champion),
    'Global champion genotype lost');
  const engine=new DesktopEngine(path.join(root,'outputs'),()=>{},()=>{}),oldRoot=path.join(root,'dist-landscape-v560/win-unpacked/resources/app');
  const oldEngine=new OldEngine(path.join(oldRoot,'outputs'),()=>{},()=>{});
  try{
    await engine.validateProgress(original);await engine.validateProgress(copy);
    let rejected=false;try{await oldEngine.validateProgress(copy);}catch(error){rejected=/ricompense incompatibile/i.test(error.message);}
    check(rejected,'Published Windows copy unexpectedly accepts the changed scoring revision');
    check(hash(originalPath)===report.sourceSaveSha256,'Original changed during verification');
  }finally{await engine.stop();await oldEngine.stop();}
  const output={passed:true,reportSha256:hash(reportPath),copySha256:hash(copyPath),originalSaveSha256:hash(originalPath),
    workers:copy.workers.length,populationPerWorker:copy.workers.map(w=>w.state.population),rewardRevision:F.Rewards.REVISION,
    allPopulationAndArchivedGenotypesRetained:true,optimizerAndCountersPreserved:true,oldScoresAndHistoryCleared:true,
    oldPublishedBuildRejects:true,
    boundary:'Readback and validation only. Worker restore was separately performed by the preparation runner; no learning or lap result is claimed.'};
  const target=path.join(dir,'verification.json');fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log('MOVING_PACE_COPY_VERIFICATION '+JSON.stringify({verification:target,sha256:hash(target),...output}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
