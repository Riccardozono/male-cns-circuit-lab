'use strict';
// Full-episode screening of real neural-readout mutations at the saved V3
// Monza gen.129 policy. Motor outputs remain entirely decoded by MaleCNS.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/reward-migration-treatment-progress6-gen119-10gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen129.malecns-save');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/search-v3-gen129-motor-focus-default-dose-12x4-20261022-01'),perFocus=Number(args.perFocus||12),amount=Number(args.amount||.16);
if(!Number.isInteger(perFocus)||perFocus<1||perFocus>32||!Number.isFinite(amount)||amount<=0||amount>.8)throw Error('Invalid bounded motor-mutation search settings');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),sourceFiles=['work/search-v3-gen129-motor-focus.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
function run(sim,genome,seed){
  sim.mutation=0;sim.running=true;sim.generation=1;sim.elapsed=0;sim.accumulator=0;sim.history=[];sim.bestEver=-Infinity;
  sim.champion=null;sim.championStats=null;sim.externalChampion=null;sim.hallOfFame=[];sim.stagnation=0;sim.ticks=0;sim.random=F.rng(seed);
  sim.learningFrontier={progress:0,laps:0,lapTime:null};sim.safeLearningFrontier={progress:0,laps:0,lapTime:null};sim.spawn([F.cloneGenome(genome)]);
  const car=sim.cars[0],trace=crypto.createHash('sha256');let controls=0,ticks=0;
  sim.onTrialTick=s=>{if(s.ticks%s.neuralInterval===0){trace.update(JSON.stringify([car.bestProgress,car.lifetime,car.outputs])+'\n');controls++;}};
  while(sim.generation===1&&ticks<12000){sim.tick();ticks++;}
  sim.onTrialTick=null;if(sim.generation!==2)throw Error('Full physical episode watchdog');
  return {car,result:{progressM:car.bestProgress/(sim.track.pixelsPerMeter||1),fitness:car.fitness,laps:car.laps,reason:car.reason,
    safe:F.isSafeLearningOutcome(car),simSeconds:car.lifetime,terminalCommands:car.outputs.slice(),controls},traceSha256:trace.digest('hex')};
}
async function main(){
  if(fs.existsSync(out))throw Error('Preserve prior mutation search output');
  assert.equal(process.versions.node,'24.19.0','Pinned Node 24.19.0 required');
  const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==129||state.population!==100)
    throw Error('Expected the isolated V3/Monza gen.129 population checkpoint');
  const data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json'),
    sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;
  const parent=F.cloneGenome(state.genomes[0]),baseline=run(sim,parent,state.seed);
  assert.equal(baseline.result.progressM,801.1207621478061,'Saved parent replay mismatch');assert.equal(baseline.result.laps,0);assert.equal(baseline.result.safe,true);
  const experience=structuredClone(baseline.car.brain.policyExperience),focuses=[['steering','steering-only'],['longitudinal','longitudinal-only'],['combined','combined steering + longitudinal'],[null,'mixed motor channels']],candidates=[];
  for(let i=0;i<perFocus;i++)for(const [focus,label] of focuses){
    const seed=20262200+i,weights=L.safeMotorMutation(sim.graph,parent.policyWeights,F.rng(seed),amount,experience,focus),genome={...F.cloneGenome(parent),policyWeights:weights},trial=run(sim,genome,state.seed);
    candidates.push({focus:label,focusArgument:focus,candidate:i,seed,amount,result:trial.result,traceSha256:trial.traceSha256});
    console.log('V3_MOTOR_FOCUS_CANDIDATE '+JSON.stringify({focus:label,candidate:i,progressM:trial.result.progressM,laps:trial.result.laps,safe:trial.result.safe,reason:trial.result.reason}));
  }
  const summaries=focuses.map(([focus,label])=>{const rows=candidates.filter(c=>c.focus===label),safe=rows.filter(c=>c.result.safe).sort((a,b)=>b.result.progressM-a.result.progressM);
    return {focus:label,tested:rows.length,safeEpisodes:safe.length,lapEpisodes:rows.filter(c=>c.result.safe&&c.result.laps>0).length,
      bestSafeProgressM:safe[0]?.result.progressM??null,bestSafeFitness:safe[0]?.result.fitness??null,
      bestUnsafeProgressM:rows.filter(c=>!c.result.safe).sort((a,b)=>b.result.progressM-a.result.progressM)[0]?.result.progressM??null,
      safeBeatsParent:safe.some(c=>c.result.progressM>baseline.result.progressM+1e-6)};});
  const bestSafe=candidates.filter(c=>c.result.safe).sort((a,b)=>b.result.laps-a.result.laps||b.result.progressM-a.result.progressM)[0]||null,
    after=hashes(),inputUnchanged=sha(fs.readFileSync(input))===inputSha,sourceFilesUnchanged=JSON.stringify(before)===JSON.stringify(after),report={
      format:'male-cns-v3-gen129-motor-focus-episode-screen-v1',appVersion:'5.6.0',passed:inputUnchanged&&sourceFilesUnchanged&&candidates.length===perFocus*focuses.length,
      learningSucceeded:Boolean(bestSafe&&bestSafe.result.laps>=2),input:{file:input,sha256:inputSha,generation:state.generation,population:state.population,rewardRevision:state.rewardRevision,model:'V3',circuit:'Monza'},
      settings:{runtime:'Node 24.19.0 CPU',episodesPerFocus:perFocus,mutationAmount:amount,focuses:focuses.map(([focus,label])=>({name:label,argument:focus})),
        selection:'safe full-episode outcomes first, then laps and greatest actual physical progress; no fixed route/action target'},baseline:baseline.result,
      baselineMatchesRecentPpoTrace:baseline.traceSha256==='29a2c9ec877ab69caf1f89911b2839d107763c34349176bd02883ecc301fe9bd',baselineTraceSha256:baseline.traceSha256,
      summaries,candidates,bestSafe:bestSafe?{focus:bestSafe.focus,candidate:bestSafe.candidate,result:bestSafe.result}:null,
      inputUnchanged,sourceFilesUnchanged,sourceHashes:before,
      method:'Generate MaleCNS safeMotorMutation readout mutations around the saved elite, using its actually observed neural contexts and the checkpoint mutation dose. Evaluate every candidate as a full deterministic from-line Porsche episode with unchanged sensors, physics and reward. Compare steering-only, longitudinal-only, explicitly combined steering+longitudinal, and the existing unfocused mixed-channel mutation. No candidate is saved, promoted, or used as a route/teacher. The combined mutation is a readout perturbation only, not an action rule.',
      boundary:'A bounded mutation-screen on one checkpoint, one seed and one circuit is not natural multi-generation learning or generalization. It can identify which existing motor channel has promising safe full-episode variants. App sources, user save, package version and release artifacts remain unchanged.'};
  assert.ok(report.passed);fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('V3_MOTOR_FOCUS_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,summaries:report.summaries,bestSafe:report.bestSafe,report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
