'use strict';
// In-memory single-treatment replay. Half of each stalled-frontier offspring
// batch mutates steering readout and half longitudinal readout; no child changes
// both channels. Compare against the previously completed exact-source control.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const baselinePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-only-frontier-ab-10gen-current-20261023-01/report.json');
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-frontier-split-axis-ab-10gen-current-20261023-01');
const simPath=path.join(root,'outputs/simulation.js'),originalSimulation=fs.readFileSync(simPath,'utf8');
const focusCall='frontierParent.brain?.policyExperience,frontierMutationFocus);';
if(originalSimulation.split(focusCall).length!==2)throw Error('Expected one safe-frontier motor-mutation call');
const treatmentSimulation=originalSimulation.replace(focusCall,
  "frontierParent.brain?.policyExperience,frontierMutationFocus==='longitudinal'?(frontierOffspringCount%2===0?'steering':'longitudinal'):frontierMutationFocus);");
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'];
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));
const LearningBase=require(path.join(root,'outputs/neural-learning.js')),focusCounts={steering:0,longitudinal:0},focusCountsByGeneration=[];
const LearningTreatment={...LearningBase,safeMotorMutation:(...args)=>{
  if(args[5]==='steering'||args[5]==='longitudinal')focusCounts[args[5]]++;
  return LearningBase.safeMotorMutation(...args);
}};
const treatmentModule=new Module(simPath,module);treatmentModule.filename=simPath;treatmentModule.paths=Module._nodeModulePaths(path.dirname(simPath));
const treatmentRequire=treatmentModule.require.bind(treatmentModule);
treatmentModule.require=request=>request==='./neural-learning.js'?LearningTreatment:treatmentRequire(request);
treatmentModule._compile(treatmentSimulation,simPath);const F=treatmentModule.exports;
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));

function runArm(decoded,saveSha,circuitsJson){
  const state=structuredClone(decoded.payload.workers[0].state),data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits:JSON.parse(JSON.stringify(circuitsJson)),seed:state.seed});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
  const start=sim.generation,end=start+10,rows=[];let terminal=null,ticks=0,lastLog=performance.now(),started=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('SPLIT_AXIS_PROGRESS '+JSON.stringify({generation:s.generation,ticks,completed:rows.length,alive:s.cars.filter(c=>c.alive).length}));}
  };
  while(sim.generation<end&&ticks<150000&&performance.now()-started<900000){const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){const h=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),
        reasonCounts:sortedCounts((terminal||[]).reduce((acc,c)=>(acc[c.reason]=(acc[c.reason]||0)+1,acc),{})),
        frontierDiagnostics:structuredClone(sim.lastFrontierDiagnostics||null),stagnation:h?.stagnation??null,
        splitAxisMutationCalls:{...focusCounts}};
      rows.push(record);focusCountsByGeneration.push({generation:before,...focusCounts});focusCounts.steering=0;focusCounts.longitudinal=0;
      console.log('SPLIT_AXIS_GENERATION '+JSON.stringify({generation:before,leader:leader&&{id:leader.id,progressM:leader.progressM},safeAgentCount:safe.length,maxLaps:record.maxLaps,frontier:record.frontierDiagnostics,mutationCalls:record.splitAxisMutationCalls}));terminal=null;
    }
  }
  if(sim.generation!==end||rows.length!==10)throw Error(`Treatment incomplete (${rows.length}/10 natural generations)`);
  sim.running=false;return {startGeneration:start,endGeneration:end,seed:state.seed,population:state.population,ticks,rows,
    focusCountsByGeneration,overall:{bestSafeProgressM:Math.max(...rows.map(r=>r.leader?.progressM??0)),
      finalSafeProgressM:rows.at(-1).leader?.progressM??0,finalSafeAgentCount:rows.at(-1).safeAgentCount,maxLaps:Math.max(...rows.map(r=>r.maxLaps))},saveSha256:saveSha};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite split-axis report');
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8')),before=sourceHashes(),bytes=fs.readFileSync(savePath),saveSha=sha(bytes),
    decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(!baseline.passed||!baseline.controlMatchesPriorEightGenerationReplay||baseline.diskSourceHashes?.unchanged!==true||
      JSON.stringify(baseline.diskSourceHashes.before)!==JSON.stringify(before)||baseline.save?.sha256!==saveSha||
      decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')
    throw Error('Exact current-source user checkpoint and completed same-source control required');
  const control=baseline.control,controlFirst=control.perGeneration[0];
  const treatment=runArm(decoded,saveSha,require(path.join(root,'outputs/data/circuits.json')));
  const initialMatches=treatment.rows[0].generation===controlFirst.generation&&treatment.rows[0].leader?.id===controlFirst.leader?.id&&
    treatment.rows[0].leader?.progressM===controlFirst.leader?.progressM&&treatment.rows[0].safeAgentCount===controlFirst.safeAgentCount&&
    treatment.rows[0].maxLaps===controlFirst.maxLaps&&JSON.stringify(treatment.rows[0].reasonCounts)===JSON.stringify(sortedCounts(controlFirst.reasonCounts));
  if(!initialMatches)throw Error('Generation-64 treatment outcome differs from recorded exact-source control');
  const after=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,diskSourcesUnchanged=JSON.stringify(before)===JSON.stringify(after);
  const pairs=control.perGeneration.map((c,i)=>({generation:c.generation,control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
    treatment:{leader:treatment.rows[i].leader&&{id:treatment.rows[i].leader.id,progressM:treatment.rows[i].leader.progressM},safeAgentCount:treatment.rows[i].safeAgentCount,maxLaps:treatment.rows[i].maxLaps},
    safeProgressDeltaM:(treatment.rows[i].leader?.progressM??0)-(c.leader?.progressM??0)}));
  const report={format:'male-cns-saved-v3-frontier-split-axis-ab-v1',appVersion:'5.6.0',passed:initialMatches&&saveUnchanged&&diskSourcesUnchanged,
    learningSucceeded:treatment.overall.maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,rewardRevision:'progress-3'},
    settings:{runtime:'Node 24.19.0 CPU-only',naturalGenerationsPerArm:10,control:'recorded exact-source current longitudinal frontier focus',treatment:'alternate one focused output channel per safe-frontier child',alternation:'even child index steering, odd child index longitudinal',sameOriginalCheckpointAndRng:true},
    method:'Reuses the completed ten-generation same-source control, whose first eight generations match the protected current-source continuation. Treatment restores the identical save and saved RNG, then changes only the in-memory argument to safeMotorMutation for stalled safe-frontier offspring: child indices alternate steering-only and longitudinal-only. No child receives a joint mutation. The intact safe parent, all ordinary offspring, connectome, physics, reward, sensors and selection remain unchanged.',
    control,treatment,pairedComparison:{initialMatchesControl:initialMatches,pairs,finalSafeProgressDeltaM:treatment.overall.finalSafeProgressM-control.overall.finalSafeProgressM,
      bestSafeProgressDeltaM:treatment.overall.bestSafeProgressM-control.overall.bestSafeProgressM,treatmentLaps:treatment.overall.maxLaps,controlLaps:control.overall.maxLaps,
      generationsWithBetterSafeProgress:pairs.filter(p=>p.safeProgressDeltaM>1).map(p=>p.generation),generationsWithWorseSafeProgress:pairs.filter(p=>p.safeProgressDeltaM< -1).map(p=>p.generation)},
    integrity:{saveUnchanged,diskSourcesUnchanged,sourceHashes:{before,after},controlReportSha256:sha(fs.readFileSync(baselinePath)),treatmentSourceSha256:sha(treatmentSimulation)},
    boundary:'One saved checkpoint, one circuit and one evolutionary RNG stream. Passing means matched integrity only; no lap, two-lap generation, other-seed replication, model/circuit generalization or production promotion is implied.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});
  const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('SPLIT_AXIS_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,initialMatches,control:control.overall,
    treatment:treatment.overall,comparison:report.pairedComparison,focusCountsByGeneration:treatment.focusCountsByGeneration,saveUnchanged,diskSourcesUnchanged,
    report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
