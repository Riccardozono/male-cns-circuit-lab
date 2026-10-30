'use strict';
// Deterministic, read-only replay of every genome in the saved V3/Monza gen.129 population.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/reward-migration-treatment-progress6-gen119-10gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen129.malecns-save');
const start=Number(args.start||0),end=Number(args.end||100),out=path.resolve(root,args.out||`.impeccable/review/learning-ml/replay-saved-v3-population-gen129-${start}-${end}-20261022-01`);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),sourceFiles=['work/replay-saved-v3-population-gen129.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
function deriveSafeFrontier(state){const records=[...(state.hallOfFame||[]),...(state.championStats?[state.championStats]:[])],times=records.map(x=>x.bestLapTime).filter(Number.isFinite);return {progress:records.reduce((m,x)=>Math.max(m,x.bestProgress||0),0),laps:records.reduce((m,x)=>Math.max(m,x.laps||0),0),lapTime:times.length?Math.min(...times):null};}
async function main(){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>100||end<=start)throw Error('Invalid replay batch bounds');
  if(fs.existsSync(out))throw Error('Preserve prior replay output');assert.equal(process.versions.node,'24.19.0');const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==129||state.population!==100||state.genomes.length!==100)throw Error('Expected saved V3/Monza gen.129 population of 100');
  const genomes=state.genomes.slice(start,end),sim=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:genomes.length,circuitId:'monza',circuits:require('../outputs/data/circuits.json'),seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.learningFrontier={...state.learningFrontier};sim.safeLearningFrontier=deriveSafeFrontier(state);
  sim.generation=1;sim.history=[];sim.bestEver=-Infinity;sim.champion=null;sim.championStats=null;sim.externalChampion=null;sim.hallOfFame=[];sim.random=F.rng(state.seed);sim.spawn(genomes.map(F.cloneGenome));
  const cars=sim.cars.slice(),ppm=sim.track.pixelsPerMeter||1;let ticks=0;while(sim.generation===1&&ticks<12000){sim.tick();ticks++;if(ticks%600===0)console.log('V3_POPULATION_PROGRESS '+JSON.stringify({ticks,simSeconds:Math.round(ticks/60),alive:cars.filter(c=>c.alive).length,maxProgressM:Math.max(...cars.map(c=>c.bestProgress/ppm))}));}
  if(sim.generation!==2)throw Error('Population replay watchdog');const results=cars.map((car,index)=>({index:start+index,progressM:car.bestProgress/ppm,laps:car.laps,fitness:car.fitness,reason:car.reason,safe:F.isSafeLearningOutcome(car),simSeconds:car.lifetime,terminalCommands:car.outputs.slice()}));
  const safe=results.filter(r=>r.safe).sort((a,b)=>b.laps-a.laps||b.progressM-a.progressM),unsafe=results.filter(r=>!r.safe).sort((a,b)=>b.progressM-a.progressM),after=hashes();
  const report={format:'male-cns-v3-monza-saved-population-replay-batch-v1',appVersion:'5.6.0',passed:sha(fs.readFileSync(input))===inputSha&&JSON.stringify(before)===JSON.stringify(after)&&results.length===end-start&&(start!==0||Math.abs(results[0].progressM-801.1207621478061)<1e-9),
    learningSucceeded:safe.some(r=>r.laps>=2),batch:{start,end},input:{file:input,sha256:inputSha,generation:state.generation,population:state.population,model:'V3',circuit:'Monza',mutation:state.mutation,stagnation:state.stagnation},
    settings:{runtime:'Node 24.19.0 CPU',sameSavedSeed:true,changedWeights:false,changedPhysics:false,changedReward:false,changedController:false},
    summary:{replayed:results.length,safeCount:safe.length,unsafeCount:unsafe.length,bestSafe:safe[0]||null,bestUnsafe:unsafe[0]||null,safeLapCount:safe.filter(r=>r.laps>0).length},
    results,sourceHashes:before,inputUnchanged:sha(fs.readFileSync(input))===inputSha,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),
    method:'Replay all 100 saved genomes simultaneously from the same Monza start under unchanged current V3 physics and rewards, with mutation disabled. Rank only on observed safe outcomes, actual laps and physical progress.',
    boundary:'One deterministic replay batch from a saved population at one circuit and seed. Merge every disjoint batch before interpreting the whole population. This does not establish multi-generation learning or generalization. User save, app version and release artifacts remain unchanged.'};
  assert.ok(report.passed,'Input, batch size, source, or exact saved-parent replay changed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('V3_POPULATION_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,summary:report.summary,report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
