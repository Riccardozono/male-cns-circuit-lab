'use strict';
// Stochastic replication of the current-source steering-only frontier test.
// The saved V3 checkpoint is identical in both arms; only evolutionary RNG
// after restoration receives the same alternate seed in each arm.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const postCheckpointSeed=20261024,generations=8;
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-only-frontier-rng-rep-20261024-8gen-20261023-01');
const simPath=path.join(root,'outputs/simulation.js'),source=fs.readFileSync(simPath,'utf8');
const needle="const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;";
if(source.split(needle).length!==2)throw Error('Expected exactly one current-source frontier-focus expression');
const treatmentSource=source.replace(needle,"const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'steering':null;");
const treatmentModule=new Module(simPath,module);treatmentModule.filename=simPath;treatmentModule.paths=Module._nodeModulePaths(path.dirname(simPath));treatmentModule._compile(treatmentSource,simPath);
const F0=require(simPath),F1=treatmentModule.exports,P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js'];
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));

function runArm(name,F,decoded,saveSha,circuitsJson){
  const state=structuredClone(decoded.payload.workers[0].state),data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits:JSON.parse(JSON.stringify(circuitsJson)),seed:state.seed});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);
  sim.random=F.rng(postCheckpointSeed);sim.running=true;
  const start=sim.generation,end=start+generations,rows=[];let terminal=null,ticks=0,lastLog=performance.now(),started=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('STEERING_RNG_REP_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,ticks,completed:rows.length,alive:s.cars.filter(c=>c.alive).length}));}
  };
  while(sim.generation<end&&ticks<120000&&performance.now()-started<900000){const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){const h=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const reasonCounts=sortedCounts((terminal||[]).reduce((acc,c)=>(acc[c.reason]=(acc[c.reason]||0)+1,acc),{}));
      rows.push({generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),reasonCounts,
        frontierDiagnostics:structuredClone(sim.lastFrontierDiagnostics||null),stagnation:h?.stagnation??null});
      console.log('STEERING_RNG_REP_GENERATION '+JSON.stringify({arm:name,generation:before,leader:leader&&{id:leader.id,progressM:leader.progressM},safeAgentCount:safe.length,maxLaps:rows.at(-1).maxLaps,frontier:rows.at(-1).frontierDiagnostics}));terminal=null;
    }
  }
  if(sim.generation!==end||rows.length!==generations)throw Error(`${name}: incomplete natural generations (${rows.length}/${generations})`);
  sim.running=false;return {name,postCheckpointSeed,population:state.population,startGeneration:start,endGeneration:end,ticks,rows,
    overall:{bestSafeProgressM:Math.max(...rows.map(r=>r.leader?.progressM??0)),finalSafeProgressM:rows.at(-1).leader?.progressM??0,
      finalSafeAgentCount:rows.at(-1).safeAgentCount,maxLaps:Math.max(...rows.map(r=>r.maxLaps))},saveSha256:saveSha};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite replication report');
  const reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-current-source-continuation-8gen-20261023-01/report.json'),'utf8'));
  const before=sourceHashes(),bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(!reference.passed||reference.sourceHashes?.before?.['simulation.js']!==before['outputs/simulation.js']||reference.save?.sha256!==saveSha||
      decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')
    throw Error('Exact same-source user V3/Monza gen64 checkpoint and reference required');
  const circuitsJson=require(path.join(root,'outputs/data/circuits.json'));
  const control=runArm('control',F0,decoded,saveSha,circuitsJson),treatment=runArm('steering-only-focus',F1,decoded,saveSha,circuitsJson);
  const first=reference.perGeneration[0],controlInitialMatches=control.rows[0].generation===first.generation&&control.rows[0].leader?.id===first.leader?.id&&
    control.rows[0].leader?.progressM===first.leader?.progressM&&control.rows[0].safeAgentCount===first.safeAgentCount&&
    control.rows[0].maxLaps===first.maxLaps&&JSON.stringify(control.rows[0].reasonCounts)===JSON.stringify(sortedCounts(first.reasonCounts));
  if(!controlInitialMatches)throw Error('Alternate RNG changed generation-64 physical outcomes; replication invalid');
  const sourceAfter=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,diskSourcesUnchanged=JSON.stringify(before)===JSON.stringify(sourceAfter);
  const pairs=control.rows.map((c,i)=>({generation:c.generation,control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
    treatment:{leader:treatment.rows[i].leader&&{id:treatment.rows[i].leader.id,progressM:treatment.rows[i].leader.progressM},safeAgentCount:treatment.rows[i].safeAgentCount,maxLaps:treatment.rows[i].maxLaps},
    safeProgressDeltaM:(treatment.rows[i].leader?.progressM??0)-(c.leader?.progressM??0)}));
  const report={format:'male-cns-saved-v3-steering-only-frontier-postcheckpoint-rng-rep-v1',appVersion:'5.6.0',passed:controlInitialMatches&&saveUnchanged&&diskSourcesUnchanged,
    learningSucceeded:treatment.overall.maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,rewardRevision:'progress-3'},
    optimizerRandomization:{postCheckpointSeed,scope:'Evolutionary RNG only, set after restoring the exact checkpoint; identical across both arms. The generation-64 physical replay must remain exactly unchanged.'},
    settings:{runtime:'Node 24.19.0 CPU-only',naturalGenerationsPerArm:generations,arms:2,baseMutation:0.12,sameCheckpoint:true,samePhysicsAndRewards:true,noGPU:true},
    method:'Same current-source generation-64 checkpoint identity as the first experiment, but evolutionary RNG after restore is reset to the same alternate seed for control and treatment. Treatment changes only the in-memory stalled-frontier mutation focus from longitudinal to steering. Exact generation-64 physical outcomes are checked against the trusted current-source replay before the random-sequence comparison is accepted.',
    controlInitialMatchesTrustedReplay:controlInitialMatches,control,treatment,pairedComparison:{pairs,
      finalSafeProgressDeltaM:treatment.overall.finalSafeProgressM-control.overall.finalSafeProgressM,
      bestSafeProgressDeltaM:treatment.overall.bestSafeProgressM-control.overall.bestSafeProgressM,
      treatmentLaps:treatment.overall.maxLaps,controlLaps:control.overall.maxLaps,
      generationsWithBetterSafeProgress:pairs.filter(p=>p.safeProgressDeltaM>1).map(p=>p.generation),
      generationsWithWorseSafeProgress:pairs.filter(p=>p.safeProgressDeltaM< -1).map(p=>p.generation)},
    diskSourceHashes:{before,after:sourceAfter,unchanged:diskSourcesUnchanged},boundary:'This is one alternate evolutionary RNG stream from the same saved population, not an independent checkpoint, model, circuit, or cold start. Even a safe-distance improvement does not prove a lap, two laps, or generalized learning.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});
  const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STEERING_RNG_REP_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,controlInitialMatches,
    control:control.overall,treatment:treatment.overall,comparison:report.pairedComparison,saveUnchanged,diskSourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
