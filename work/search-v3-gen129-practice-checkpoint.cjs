'use strict';
// Research-only: replay the saved V3 and test readout mutations from the
// real 90%-frontier state used by the app's local-practice evaluator.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/reward-migration-treatment-progress6-gen119-10gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen129.malecns-save');
const practiceRatio=Number(args.practiceRatio||.8),out=path.resolve(root,args.out||'.impeccable/review/learning-ml/search-v3-gen129-practice-checkpoint-80pct-8x4-20261022-01'),perFocus=Number(args.perFocus||8),amount=Number(args.amount||.16);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),sourceFiles=['work/search-v3-gen129-practice-checkpoint.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
function deriveSafeFrontier(state){const records=[...(state.hallOfFame||[]),...(state.championStats?[state.championStats]:[])],times=records.map(x=>x.bestLapTime).filter(Number.isFinite);return {progress:records.reduce((m,x)=>Math.max(m,x.bestProgress||0),0),laps:records.reduce((m,x)=>Math.max(m,x.laps||0),0),lapTime:times.length?Math.min(...times):null};}
function run(sim,state,genome){
  sim.mode='connectome';sim.mutation=0;sim.running=true;sim.generation=1;sim.elapsed=0;sim.accumulator=0;sim.history=[];sim.bestEver=-Infinity;
  sim.champion=null;sim.championStats=null;sim.externalChampion=null;sim.hallOfFame=[];sim.stagnation=state.stagnation;sim.ticks=0;sim.random=F.rng(state.seed);
  sim.learningFrontier={...state.learningFrontier};sim.safeLearningFrontier=state.practiceFrontier?{...state.practiceFrontier}:deriveSafeFrontier(state);sim.spawn([F.cloneGenome(genome)]);
  const car=sim.cars[0],ppm=sim.track.pixelsPerMeter||1,trace=crypto.createHash('sha256');let ticks=0,practice=null;
  sim.onTrialTick=s=>{
    if(s.ticks%s.neuralInterval===0)trace.update(JSON.stringify([car.bestProgress,car.lifetime,car.outputs])+'\n');
    if(!practice&&car.practiceState)practice={progressM:car.practiceState.along/ppm,speedMps:car.practiceState.vehicle.speedMps,
      state:structuredClone(car.practiceState),sensorVector:car.sensorVector.slice(),commands:car.outputs.slice()};
  };
  while(sim.generation===1&&ticks<12000){sim.tick();ticks++;}
  sim.onTrialTick=null;if(sim.generation!==2)throw Error('Full-episode watchdog');
  return {car,practice,traceSha256:trace.digest('hex'),result:{progressM:car.bestProgress/ppm,fitness:car.fitness,laps:car.laps,reason:car.reason,safe:F.isSafeLearningOutcome(car),simSeconds:car.lifetime,controls:Math.ceil(ticks/sim.neuralInterval)}};
}
async function main(){
  if(!Number.isInteger(perFocus)||perFocus<1||perFocus>24||!Number.isFinite(amount)||amount<=0||amount>.8||!Number.isFinite(practiceRatio)||practiceRatio<.5||practiceRatio>=.9)throw Error('Invalid bounded practice search settings');
  if(fs.existsSync(out))throw Error('Preserve prior research output');assert.equal(process.versions.node,'24.19.0');
  const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==129||state.population!==100)throw Error('Expected V3 Monza gen.129 population checkpoint');
  const data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json'),sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;const parent=F.cloneGenome(state.genomes[0]);
  // Simulate an earlier local-practice capture by keeping the production 90%
  // gate but scaling only the diagnostic safe frontier to the requested ratio.
  const safeFrontier=deriveSafeFrontier(state);safeFrontier.progress*=practiceRatio/.9;sim.safeLearningFrontier=safeFrontier;
  const baseline=run(sim,{...state,practiceFrontier:safeFrontier},parent);
  assert.equal(baseline.result.progressM,801.1207621478061,'Saved parent replay mismatch');assert.equal(baseline.result.safe,true);assert.ok(baseline.practice,'The saved safe frontier should activate the real 90%-progress practice capture');
  const practiceBase=F.evaluatePractice(sim.track,sim.graph,parent,baseline.practice.state,720),experience=structuredClone(baseline.car.brain.policyExperience),
    focuses=[['steering','steering-only'],['longitudinal','longitudinal-only'],['combined','combined steering + longitudinal'],[null,'mixed motor channels']],candidates=[];
  for(let i=0;i<perFocus;i++)for(const [focus,label] of focuses){
    const seed=20262280+i,weights=L.safeMotorMutation(sim.graph,parent.policyWeights,F.rng(seed),amount,experience,focus),genome={...F.cloneGenome(parent),policyWeights:weights},local=F.evaluatePractice(sim.track,sim.graph,genome,baseline.practice.state,720);
    candidates.push({focus:label,focusArgument:focus,candidate:i,seed,local});
    console.log('V3_PRACTICE_CANDIDATE '+JSON.stringify({focus:label,candidate:i,localProgressM:local.progress,laps:local.laps,reason:local.reason}));
  }
  const fullChecks=[];
  for(const [focus,label] of focuses){const rows=candidates.filter(c=>c.focus===label).sort((a,b)=>b.local.progress-a.local.progress),top=rows.slice(0,2);
    for(const row of top){const weights=L.safeMotorMutation(sim.graph,parent.policyWeights,F.rng(row.seed),amount,experience,row.focusArgument),trial=run(sim,state,{...F.cloneGenome(parent),policyWeights:weights});fullChecks.push({focus:label,candidate:row.candidate,local:row.local,full:trial.result});}}
  const summaries=focuses.map(([,label])=>{const rows=candidates.filter(c=>c.focus===label),checks=fullChecks.filter(c=>c.focus===label);return {focus:label,tested:rows.length,
    baselinePracticeProgressM:practiceBase.progress,bestPracticeProgressM:Math.max(...rows.map(c=>c.local.progress)),practiceBeatsParent:rows.some(c=>c.local.progress>practiceBase.progress+1e-6),
    bestFullSafeProgressM:Math.max(...checks.filter(c=>c.full.safe).map(c=>c.full.progressM),0),bestFullAnyProgressM:Math.max(...checks.map(c=>c.full.progressM)),
    fullLapCompletions:checks.filter(c=>c.full.safe&&c.full.laps>0).length};});
  const after=hashes(),report={format:'male-cns-v3-gen129-practice-checkpoint-screen-v1',appVersion:'5.6.0',passed:sha(fs.readFileSync(input))===inputSha&&JSON.stringify(before)===JSON.stringify(after)&&candidates.length===perFocus*focuses.length,
    learningSucceeded:fullChecks.some(c=>c.full.safe&&c.full.laps>=2),input:{file:input,sha256:inputSha,model:'V3',circuit:'Monza',generation:state.generation,population:state.population,mutation:state.mutation,stagnation:state.stagnation},
    settings:{runtime:'Node 24.19.0 CPU',episodesPerFocus:perFocus,mutationAmount:amount,practiceTicks:720,practiceCheckpointRatioOfSavedFrontier:practiceRatio,practiceCheckpointProgressM:baseline.practice.progressM,practiceCheckpointSpeedMps:baseline.practice.speedMps,
      checkpointSensorVector:baseline.practice.sensorVector,checkpointCommands:baseline.practice.commands,focuses:focuses.map(([argument,name])=>({name,argument})),
      comparison:'Local trials start from the app-captured real neural/vehicle state at 90% of the restored safe frontier. Top two local candidates per focus are replayed again from the start; no inherited progress counts in local results.'},
    baseline:baseline.result,baselineTraceSha256:baseline.traceSha256,practiceBaseline:practiceBase,summaries,fullChecks,inputUnchanged:sha(fs.readFileSync(input))===inputSha,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),sourceHashes:before,
    method:'Use the same 5.6.0 V3 policy, physical sensors, MaleCNS recurrent state, Porsche physics, reward and safeMotorMutation as the app. Derive safe frontier exactly like progress-save.js, then alter only the diagnostic threshold to test an earlier practice capture. Screen four motor-readout mutation foci with 12-second physical local practice, then verify each focus top two from the starting line.',
    boundary:'A single saved V3/Monza checkpoint and one seed. Local-practice gain is not counted as a completed lap or a trained generation. No candidate is promoted; user save, package version and releases remain unchanged.'};
  assert.ok(report.passed);fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('V3_PRACTICE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,practiceBase:report.practiceBaseline,practiceCheckpoint:{progressM:baseline.practice.progressM,speedMps:baseline.practice.speedMps},summaries:report.summaries,report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
