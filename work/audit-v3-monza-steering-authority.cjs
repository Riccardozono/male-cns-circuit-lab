'use strict';
// Read-only steering-authority ablation. The policy, sensors, brake, throttle,
// tires and rewards stay fixed; only the command-to-wheel multiplier is varied.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/reward-migration-treatment-progress6-gen119-10gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen129.malecns-save');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/audit-v3-monza-steering-authority-20261022-01');
const gains=[1,1.5,2,3],sha=v=>crypto.createHash('sha256').update(v).digest('hex'),sourceFiles=['work/audit-v3-monza-steering-authority.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
function deriveSafeFrontier(state){const records=[...(state.hallOfFame||[]),...(state.championStats?[state.championStats]:[])],times=records.map(x=>x.bestLapTime).filter(Number.isFinite);return {progress:records.reduce((m,x)=>Math.max(m,x.bestProgress||0),0),laps:records.reduce((m,x)=>Math.max(m,x.laps||0),0),lapTime:times.length?Math.min(...times):null};}
async function main(){
  if(fs.existsSync(out))throw Error('Preserve prior diagnostic output');assert.equal(process.versions.node,'24.19.0');
  const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==129)throw Error('Expected V3 Monza gen.129 checkpoint');
  const data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json'),sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});sim.rewardRevision=state.rewardRevision;
  const parent=F.cloneGenome(state.genomes[0]),runs=[],original=F.Vehicle.step;
  for(const gain of gains){
    sim.mode='connectome';sim.mutation=0;sim.running=true;sim.generation=1;sim.elapsed=0;sim.accumulator=0;sim.history=[];sim.bestEver=-Infinity;sim.champion=null;sim.championStats=null;sim.externalChampion=null;sim.hallOfFame=[];
    sim.stagnation=state.stagnation;sim.ticks=0;sim.random=F.rng(state.seed);sim.learningFrontier={...state.learningFrontier};sim.safeLearningFrontier=deriveSafeFrontier(state);sim.spawn([F.cloneGenome(parent)]);
    const car=sim.cars[0],ppm=sim.track.pixelsPerMeter||1;let ticks=0,maxWheelAngleRad=0,maxRawSteering=0,maxAppliedSteering=0;
    F.Vehicle.step=(target,commands,dt,ground)=>{
      if(target!==car)return original(target,commands,dt,ground);
      maxRawSteering=Math.max(maxRawSteering,Math.abs(commands[0]));const applied=commands.slice();applied[0]=F.clamp(applied[0]*gain,-1,1);
      maxAppliedSteering=Math.max(maxAppliedSteering,Math.abs(applied[0]));original(target,applied,dt,ground);
      maxWheelAngleRad=Math.max(maxWheelAngleRad,Math.abs(target.vehicle.steeringAngle||0));
    };
    while(sim.generation===1&&ticks<12000){sim.tick();ticks++;}
    F.Vehicle.step=original;if(sim.generation!==2)throw Error('Full-episode watchdog');
    const result={gain,progressM:car.bestProgress/ppm,laps:car.laps,fitness:car.fitness,reason:car.reason,safe:F.isSafeLearningOutcome(car),simSeconds:car.lifetime,
      maxRawSteering,maxAppliedSteering,maxWheelAngleRad,terminalCommands:car.outputs.slice()};runs.push(result);console.log('STEERING_AUTHORITY '+JSON.stringify(result));
  }
  const after=hashes(),report={format:'male-cns-v3-monza-steering-authority-ablation-v1',appVersion:'5.6.0',passed:sha(fs.readFileSync(input))===inputSha&&JSON.stringify(before)===JSON.stringify(after)&&runs.length===gains.length,
    learningSucceeded:runs.some(x=>x.safe&&x.laps>=2),input:{file:input,sha256:inputSha,model:'V3',circuit:'Monza',generation:state.generation,mutation:state.mutation},
    method:'Replay the same saved genome and deterministic starting seed four times. Change only the global normalized command-to-wheel multiplier before Porsche physics; do not alter the neural policy, sensed state, throttle, brake, reward, circuit or collision rules.',
    runs,sourceHashes:before,inputUnchanged:sha(fs.readFileSync(input))===inputSha,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),
    boundary:'Diagnostic calibration only. A steering gain is not adopted as a model fix unless safe progress improves on full replay; this is one checkpoint and one seed, not learning or generalization.'};
  assert.ok(report.passed);fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STEERING_AUTHORITY_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,runs,report:path.join(out,'report.json')}));
}
main().catch(e=>{F.Vehicle.step=undefined;console.error(e.stack||e);process.exitCode=1;});
