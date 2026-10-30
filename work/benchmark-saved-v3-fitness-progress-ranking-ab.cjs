'use strict';
// Paired natural-generation test: safe no-lap selection by physical progress
// versus the same safe/lap gates followed by the real penalized fitness.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-fitness-progress-ranking-ab-20261022-01');
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function replaceOnce(source,oldText,newText,label){const i=source.indexOf(oldText);if(i<0||source.indexOf(oldText,i+oldText.length)>=0)throw Error(`Expected one source anchor: ${label}`);return source.slice(0,i)+newText+source.slice(i+oldText.length);}
function compileSimulation(file,fitnessFirst){
  let source=fs.readFileSync(file,'utf8');
  if(fitnessFirst){
    const oldComparator=`    if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;
    const aFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;if(aFitness!==bFitness)return bFitness-aFitness;`;
    const newComparator=`    const aFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;if(aFitness!==bFitness)return bFitness-aFitness;
    if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;`;
    source=replaceOnce(source,oldComparator,newComparator,'safe no-lap fitness rank');
  }
  source=replaceOnce(source,'this.generation++;this.spawn(genomes);',
    "this.lastSelectionDiagnostics={selectionWinnerId:selectionWinner?.id??null,selectionWinnerProgressM:selectionWinner?selectionWinner.bestProgress/(this.track.pixelsPerMeter||1):null,selectionWinnerFitness:selectionWinner?.fitness??null,safeProgressLeaderId:safeProgressLeader?.id??null,safeProgressLeaderM:safeProgressLeader?safeProgressLeader.bestProgress/(this.track.pixelsPerMeter||1):null};this.generation++;this.spawn(genomes);",
    'transient selected-parent diagnostics');
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(source)};
}
function runArm(F,state,data,name,generations=5){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;const first=sim.generation,rows=[];let generationTicks=0,totalTicks=0,terminal=new Map(),started=Date.now();
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{id:car.id,
    progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)});};
  while(sim.generation<first+generations){if(generationTicks>=60000)throw Error(`${name}: generation watchdog`);const g=sim.generation;sim.tick();generationTicks++;totalTicks++;
    if(sim.generation!==g){if(terminal.size!==state.population)throw Error(`${name}: incomplete terminal census`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1);
      rows.push({generation:h.generation,ticks:generationTicks,safeAgentCount:safe.length,unsafeCount:outcomes.length-safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        bestSafeFitness:safe.length?Math.max(...safe.map(x=>x.fitness)):null,historyFitnessLeader:h.best,
        selectedParent:sim.lastSelectionDiagnostics,terminalOutcomes:outcomes});
      console.log('FITNESS_PROGRESS_RANK_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:rows.at(-1).bestSafeProgressM,
        maxSafeLaps:rows.at(-1).maxSafeLaps,bestSafeFitness:rows.at(-1).bestSafeFitness,selectedParent:rows.at(-1).selectedParent}));
      terminal=new Map();generationTicks=0;}}
  sim.running=false;return {name,startGeneration:first,seed:state.seed,population:state.population,rows,totalTicks,wallSeconds:(Date.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');if(fs.existsSync(out))throw Error('Refusing to overwrite ranking report');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')throw Error('Unexpected V3/Monza checkpoint identity');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),before=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js'));
  const controlBuild=compileSimulation(simFile,false),control=runArm(controlBuild.api,state,data,'current-safe-progress-first');
  const prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01/report.json'),'utf8')),
    expected=prior.workers[0].generations[0].outcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe})),
    observed=control.rows[0].terminalOutcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe})),exactInitial=JSON.stringify(expected)===JSON.stringify(observed);
  if(!exactInitial)throw Error('Current control failed exact checkpoint generation-64 replay');
  const treatmentBuild=compileSimulation(simFile,true),treatment=runArm(treatmentBuild.api,state,data,'safe-lap-then-real-fitness');
  const after=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after);
  const laps=Math.max(...control.rows.map(r=>r.maxSafeLaps),...treatment.rows.map(r=>r.maxSafeLaps));
  const report={format:'male-cns-saved-v3-fitness-progress-ranking-ab-v1',appVersion:'5.6.0',passed:Boolean(exactInitial&&saveUnchanged&&sourcesUnchanged&&control.rows.length===5&&treatment.rows.length===5),
    learningSucceeded:laps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',worker:0,generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerArm:5,control:'safe outcomes rank lap count, then raw physical progress, then fitness',treatment:'safe outcomes rank lap count, then real penalized episode fitness, then physical progress'},
    method:'Paired natural full-population evolution restored from two exact copies of the same saved worker checkpoint. Safety and completed laps remain higher-priority gates in both arms. Only tie-break ordering among safe equal-lap outcomes changes. Same RNG seed, motor policy, ES, mutation, rewards, sensors, physics and population. Diagnostic parent IDs are transient and not written to the save.',
    controlReplayMatchesPriorGeneration64:exactInitial,control,treatment,
    comparison:{safeProgressDeltaMetersByGeneration:treatment.rows.map((row,i)=>row.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDeltaByGeneration:treatment.rows.map((row,i)=>row.maxSafeLaps-control.rows[i].maxSafeLaps),selectedParentIds:{control:control.rows.map(r=>r.selectedParent.selectionWinnerId),treatment:treatment.rows.map(r=>r.selectedParent.selectionWinnerId)},promoteTreatment:false},
    inMemoryTreatmentSourceSha256:treatmentBuild.sourceSha256,productionSourceHashes:{before,after,unchanged:sourcesUnchanged},
    boundary:'One V3/Monza save worker, seed 7717, five natural generations per arm. Passing establishes replay and integrity only; learning requires persistent safe progress and completed laps, ideally replicated across seeds/circuits. No application source, save, version, package, tag or release changed.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FITNESS_PROGRESS_RANK_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,sourcesUnchanged,exactInitial,
    control:control.rows.map(r=>({generation:r.generation,progress:r.bestSafeProgressM,laps:r.maxSafeLaps,fitness:r.bestSafeFitness,parent:r.selectedParent.selectionWinnerId})),
    treatment:treatment.rows.map(r=>({generation:r.generation,progress:r.bestSafeProgressM,laps:r.maxSafeLaps,fitness:r.bestSafeFitness,parent:r.selectedParent.selectionWinnerId})),delta:report.comparison.safeProgressDeltaMetersByGeneration,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
