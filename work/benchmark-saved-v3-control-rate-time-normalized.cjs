'use strict';
// Paired CPU replay: 10 Hz baseline vs 20 Hz sensor/action refresh with
// neural iterations divided by two, preserving the brain's update budget/time.
// The generation-64 save and application sources are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-control-rate-rescaled-20261023-01');
const Dense=require(path.join(root,'outputs/dense-neural.js'));
const originalStep=Dense.step;
const F=require(path.join(root,'outputs/simulation.js'));
const P=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceHashes=()=>({
  simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),
  learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))),
  dense:sha(fs.readFileSync(path.join(root,'outputs/dense-neural.js'))),
});

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes);
  const decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  const state=structuredClone(decoded.payload.workers[0].state);
  const exactPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-population-exact-control-20261021-01/report.json');
  const rawRatePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-control-rate-20261021-01/report.json');
  const exact=JSON.parse(fs.readFileSync(exactPath,'utf8'));
  const rawRate=JSON.parse(fs.readFileSync(rawRatePath,'utf8'));
  const hashesBefore=sourceHashes();
  if(!exact.passed||exact.save?.sha256!==saveSha||state.generation!==64||state.population!==40||state.seed!==7717||state.rewardRevision!=='progress-3')
    throw Error('The original V3/Monza generation-64 checkpoint and exact baseline are required');
  if(!rawRate.passed||rawRate.save?.sha256!==saveSha)
    throw Error('The existing unscaled 20 Hz diagnostic does not match the supplied save');

  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const firstBrainSeen=new WeakSet();
  let activeArm='control',denseCalls=0,denseIterations=0,controlFirstActions=null,candidateFirstActions=null;
  Dense.step=function(graph,brain,iterations,edgesEnabled,gains){
    denseCalls++;
    let effective=iterations;
    if(activeArm==='candidate'&&firstBrainSeen.has(brain))effective=iterations/2;
    else if(activeArm==='candidate')firstBrainSeen.add(brain);
    if(!Number.isInteger(effective))throw Error('Neural iteration scaling must remain integral');
    denseIterations+=effective;
    return originalStep(graph,brain,effective,edgesEnabled,gains);
  };

  function runArm(arm,interval){
    activeArm=arm;
    const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
    P.restore(sim,structuredClone(state));
    sim.running=true;sim.neuralInterval=interval;
    const first={actions:null};let ticks=0,terminal=null;
    sim.onTrialTick=s=>{
      if(s.ticks===0){
        first.actions=s.cars.map(car=>Array.from(car.slowOutputs||[]));
        if(arm==='control')controlFirstActions=first.actions;
        else candidateFirstActions=first.actions;
      }
      if(s.cars.every(car=>!car.alive))terminal=s.cars.map(car=>({
        id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
        reason:car.reason,safe:F.isSafeLearningOutcome(car),fitness:car.fitness,
        gas:car.outputs?.[1]||0,brake:car.outputs?.[2]||0,
      })).sort((a,b)=>a.id-b.id);
    };
    while(sim.generation===64&&ticks<14000){sim.tick();ticks++;}
    if(sim.generation!==65||!terminal)throw Error(`The complete ${arm} generation did not finish naturally`);
    const safe=terminal.filter(car=>car.safe);
    const leader=safe.sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
    return {leader,populationBestSafeM:leader?.progressM??0,laps:Math.max(...terminal.map(car=>car.laps)),
      safeAgentCount:safe.length,terminalReasonCounts:terminal.reduce((counts,car)=>(counts[car.reason]=(counts[car.reason]||0)+1,counts),{}),
      simulationSteps:ticks,terminal};
  }

  try{
    const control=runArm('control',6);
    const iterationsAfterControl=denseIterations;
    const candidate=runArm('candidate',3);
    const controlComplete=Boolean(control.leader)&&control.terminal.length===state.population;
    const initialActionsMatch=JSON.stringify(controlFirstActions)===JSON.stringify(candidateFirstActions);
    const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
    const hashesAfter=sourceHashes();
    const sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter);
    const report={format:'male-cns-saved-v3-time-normalized-control-rate-ab-v1',appVersion:'5.6.0',
      passed:Boolean(controlComplete&&candidate.leader&&initialActionsMatch&&saveUnchanged&&sourcesUnchanged),
      learningSucceeded:candidate.laps>=1,
      save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
      settings:{runtime:'Node 24.19.0 CPU V3 solver',physicsHz:60,baselineControlRateHz:10,candidateControlRateHz:20,
        baselineNeuralIterationsPerCall:4,candidateInitialNeuralIterations:4,candidateSubsequentNeuralIterationsPerCall:2,
        neuralIterationsPerPhysicalSecondApproximatelyEqual:true,trainingUpdatesPerArm:1},
      comparison:{baseline10Hz:{leader:control.leader,populationBestSafeM:control.populationBestSafeM,laps:control.laps,
          safeAgentCount:control.safeAgentCount,terminalReasonCounts:control.terminalReasonCounts,complete:controlComplete},
        candidate20HzTimeNormalized:{leader:candidate.leader,populationBestSafeM:candidate.populationBestSafeM,laps:candidate.laps,
          safeAgentCount:candidate.safeAgentCount,terminalReasonCounts:candidate.terminalReasonCounts,
          firstActionsExactlyMatchBaseline:initialActionsMatch},
        prior20HzUnscaled:{leader:rawRate.comparison.candidate20Hz.leader,
          populationBestSafeM:rawRate.comparison.candidate20Hz.populationBestSafeM,laps:rawRate.comparison.candidate20Hz.laps,
          safeAgentCount:rawRate.comparison.candidate20Hz.safeAgentCount,sourceHashes:rawRate.sourceHashes,
          directlyComparableToCurrentArms:rawRate.sourceHashes?.simulation===hashesBefore.simulation&&rawRate.sourceHashes?.learning===hashesBefore.learning}},
      runtime:{denseCalls,denseIterationsBaseline:iterationsAfterControl,denseIterationsCandidate:denseIterations-iterationsAfterControl},
      method:'Restores the same exact 40-genome V3/Monza generation-64 checkpoint into two independent simulations using the current working application source. Control uses the native 10 Hz schedule and four neural iterations per control call. Candidate samples sensors and decodes actions at 20 Hz, but halves subsequent neural iterations per call so the recurrent brain receives approximately the same number of iterations per physical second; the initial 20 Hz call uses four iterations so its initial action exactly matches baseline. Physics, policy weights, seed, rewards and evolutionary update are otherwise unchanged. No route cue, action override, reward change or production source edit. The historical unscaled 20 Hz report was generated from different application-source hashes and is therefore not treated as a direct comparator.',
      boundary:'One paired natural generation only. This can distinguish the prior doubled-neural-timescale artifact from a 20 Hz sensor/action-refresh effect; it cannot establish learning or convergence. App sources, save, version, release, portable and installer remain untouched.'};
    if(!saveUnchanged||!sourcesUnchanged)throw Error('The save or application sources changed during replay');
    fs.mkdirSync(out,{recursive:false});
    const reportPath=path.join(out,'report.json');
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('V3_CONTROL_RATE_RESCALED_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      control:report.comparison.baseline10Hz,candidate:report.comparison.candidate20HzTimeNormalized,
      unscaled20Hz:report.comparison.prior20HzUnscaled,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
    if(!report.passed)process.exitCode=1;
  }finally{Dense.step=originalStep;}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
