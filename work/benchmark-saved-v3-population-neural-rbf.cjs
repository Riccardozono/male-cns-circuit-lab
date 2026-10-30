'use strict';
// Full-population V3 counterfactual: only saved leader id 3 receives a
// compact-support residual over its 64 real descending-neuron features.
// The gate is fitted from the exact same 40-car baseline replay, not a solo run.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-population-neural-rbf-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),atanh=value=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,value))),
  rms=(a,b)=>Math.sqrt(a.reduce((sum,value,index)=>sum+(value-b[index])**2,0)/a.length),
  support=(features,centre,radius)=>{const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);};
const targets=[.3,.6,.9],MAX_TICKS=14000;
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing full-population neural-RBF test');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state),
    reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-targeted-terminal-telemetry-3gen-20261021-01/report.json'),'utf8')),
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  if(!reference.passed||reference.save?.sha256!==saveSha||state.generation!==64||state.population!==40||state.seed!==7717||state.rewardRevision!=='progress-3')
    throw Error('Exact generation-64 V3/Monza checkpoint and protected population reference are required');
  const sourceHashes={simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  if(sourceHashes.simulation!==reference.sourceHashes.simulation||sourceHashes.learning!==reference.sourceHashes.learning)
    throw Error('Current application sources differ from the protected population reference');
  const expectedGeneration=reference.treatment.records.find(row=>row.generation===64),leader=expectedGeneration?.safeProgressLeader,
    expectedOutcomes=expectedGeneration?.terminal;
  if(!leader||!leader.trace?.length||!expectedOutcomes?.length)throw Error('Protected full-generation baseline trace is missing');
  const referenceByTick=new Map(leader.trace.map(row=>[row.tick,row]));
  function execute(label,baselineTrace,desiredLongitudinal=null){
    const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(state));sim.running=true;
    for(const car of sim.cars){car.brain.experimentAgentId=car.id;car.brain.experimentCar=car;}
    const sourceTrace=baselineTrace||[],moving=sourceTrace.map((row,index)=>({row,index})).filter(item=>item.row.speedMps>.25),lastMovingIndex=moving.at(-1)?.index??-1,
      stationary=sourceTrace.slice(lastMovingIndex+1).filter(row=>row.speedMps<=.25);
    let centres=[],maxPreStopGate=0;
    if(desiredLongitudinal!==null){
      if(lastMovingIndex<0||stationary.length<12)throw Error('Full-population baseline has no observed move-to-stop transition');
      const protectedRows=sourceTrace.slice(0,lastMovingIndex+1);
      centres=stationary.slice(-12).map(row=>{
        const nearest=Math.min(...protectedRows.map(previous=>rms(row.features,previous.features)));
        if(!(nearest>1e-8))throw Error('A stopped neural state overlaps an earlier moving neural context');
        return {tick:row.tick,features:row.features.slice(),radius:.9*nearest,nearestProtectedDistance:nearest};
      });
      maxPreStopGate=Math.max(0,...protectedRows.map(row=>Math.max(0,...centres.map(centre=>support(row.features,centre.features,centre.radius)))));
      if(maxPreStopGate!==0)throw Error('RBF gate is not exactly zero on the full observed pre-stop trajectory');
    }
    const originalCommands=Learning.commands,gate={max:0,firstTick:null,activeControls:0},targetObservations=[],sampleTrace=[],outcomeSamples=[];
    if(desiredLongitudinal!==null){
      Learning.commands=function(graph,brain,genome,enabled=true,edgesEnabled=true){
        const base=originalCommands(graph,brain,genome,enabled,edgesEnabled);
        if(brain.experimentAgentId!==leader.id||!centres.length)return base;
        const features=Array.from(graph.learning.nodes,index=>Math.tanh(8*(Number(brain.activity[index])||0))),activation=Math.max(0,...centres.map(centre=>support(features,centre.features,centre.radius)));
        gate.max=Math.max(gate.max,activation);
        if(activation<=0)return base;
        gate.activeControls++;if(gate.firstTick===null)gate.firstTick=sim.ticks;
        const longitudinal=base[1]-base[2],corrected=Math.tanh(atanh(longitudinal)+activation*(atanh(desiredLongitudinal)-atanh(leader.trace.at(-1).outputs[1]-leader.trace.at(-1).outputs[2])));
        const outputs=[base[0],Math.max(0,corrected),Math.max(0,-corrected)];
        targetObservations.push({tick:sim.ticks,activation,speedMps:brain.experimentCar.vehicle?.speedMps??0,base:base.slice(),outputs:outputs.slice()});
        return outputs;
      };
    }
    let terminal=null,ticks=0,matched=0,maxFeatureDelta=0,maxOutputDelta=0,maxProgressDeltaM=0,maxSpeedDeltaMps=0;
    sim.onTrialTick=s=>{
      const car=s.cars.find(item=>item.id===leader.id),referenceRow=referenceByTick.get(s.ticks);
      if(car){
        const features=Array.from(s.graph.learning.nodes,index=>Math.tanh(8*(Number(car.brain.activity[index])||0))),row={tick:s.ticks,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),speedMps:car.vehicle?.speedMps??0,outputs:car.outputs.slice(),features};
        sampleTrace.push(row);
        if(referenceRow){matched++;maxFeatureDelta=Math.max(maxFeatureDelta,...features.map((value,index)=>Math.abs(value-referenceRow.neuralFeatures[index])));
          maxOutputDelta=Math.max(maxOutputDelta,...row.outputs.map((value,index)=>Math.abs(value-referenceRow.outputs[index])));
          maxProgressDeltaM=Math.max(maxProgressDeltaM,Math.abs(row.progressM-referenceRow.bestProgressM));maxSpeedDeltaMps=Math.max(maxSpeedDeltaMps,Math.abs(row.speedMps-referenceRow.speedMps));}
        if(desiredLongitudinal!==null&&s.ticks%6===0&&row.tick>= (gate.firstTick??Infinity))outcomeSamples.push({tick:row.tick,progressM:row.progressM,speedMps:row.speedMps,outputs:row.outputs});
      }
      if(s.cars.every(car=>!car.alive))terminal=s.cars.map(car=>({id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason,safe:F.isSafeLearningOutcome(car)}));
    };
    try{while(sim.generation===64&&ticks<MAX_TICKS){sim.tick();ticks++;}}
    finally{Learning.commands=originalCommands;}
    if(sim.generation!==65||!terminal)throw Error(`${label}: full generation did not end naturally`);
    const actual=terminal.slice().sort((a,b)=>a.id-b.id),actualOutcomes=actual.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})),
      expected=expectedOutcomes.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})).sort((a,b)=>a.id-b.id),outcomesMatch=JSON.stringify(actualOutcomes)===JSON.stringify(expected);
    if(baselineTrace===null&&(!outcomesMatch||matched!==leader.trace.length||maxFeatureDelta!==0||maxOutputDelta!==0||maxProgressDeltaM!==0||maxSpeedDeltaMps!==0))
      throw Error(`Exact baseline does not match its protected full-population reference: ${JSON.stringify({outcomesMatch,matched,expectedSamples:leader.trace.length,maxFeatureDelta,maxOutputDelta,maxProgressDeltaM,maxSpeedDeltaMps})}`);
    return {label,passed:baselineTrace===null?outcomesMatch&&matched===leader.trace.length&&maxFeatureDelta===0&&maxOutputDelta===0&&maxProgressDeltaM===0&&maxSpeedDeltaMps===0:true,executionCompleted:true,
      populationOutcomesMatchReference:outcomesMatch,ticks,leader:actual.find(row=>row.id===leader.id),populationBestSafeM:Math.max(...actual.filter(row=>row.safe).map(row=>row.progressM)),
      telemetryAgreement:{matchedSamples:matched,maxFeatureDelta,maxOutputDelta,maxProgressDeltaM,maxSpeedDeltaMps},
      gate:desiredLongitudinal===null?null:{desiredLongitudinal,centres:centres.map(({tick,radius,nearestProtectedDistance})=>({tick,radius,nearestProtectedDistance})),maxPreStopGate,maxActivation:gate.max,firstTick:gate.firstTick,activeControls:gate.activeControls,activatedObservations:targetObservations.length,firstActivations:targetObservations.slice(0,12),lastActivations:targetObservations.slice(-12)},
      sampleTrace:baselineTrace===null?sampleTrace:null,postActivation:desiredLongitudinal===null?null:outcomeSamples};
  }
  const baseline=execute('exact 40-agent baseline',null),results=[];
  console.log('V3_POPULATION_RBF_BASELINE '+JSON.stringify({passed:baseline.passed,leader:baseline.leader,telemetryAgreement:baseline.telemetryAgreement}));
  for(const desiredLongitudinal of targets){
    const result=execute(`neural RBF target ${desiredLongitudinal}`,baseline.sampleTrace,desiredLongitudinal);results.push(result);
    console.log('V3_POPULATION_RBF_CANDIDATE '+JSON.stringify({target:desiredLongitudinal,ticks:result.ticks,leader:result.leader,populationBestSafeM:result.populationBestSafeM,gate:result.gate}));
  }
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,report={format:'male-cns-saved-v3-population-neural-rbf-v1',appVersion:'5.6.0',passed:baseline.passed&&saveUnchanged,
    learningSucceeded:results.some(row=>row.leader?.laps>=2),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    sourceHashes,settings:{runtime:'Node 24.19.0 CPU V3 solver',fullOriginalPopulation:true,modifiedAgentsPerTreatment:1,leaderId:leader.id,leaderNeurons:64,desiredLongitudinalTargets:targets,initialTrajectoryMustMatch:true},
    baseline:{label:baseline.label,leader:baseline.leader,populationBestSafeM:baseline.populationBestSafeM,ticks:baseline.ticks,telemetryAgreement:baseline.telemetryAgreement},
    candidates:results.map(({sampleTrace,postActivation,...result})=>({...result,postActivationSamples:postActivation?.length||0,postActivationProgressMRange:postActivation?.length?[Math.min(...postActivation.map(row=>row.progressM)),Math.max(...postActivation.map(row=>row.progressM))]:null})),
    method:'Replays the exact complete 40-car generation on CPU and first verifies all 40 outcomes plus the saved leader neural trace bit-for-bit. The candidate changes only one real V3 policy output through a compact-support RBF of that leader’s 64 actual descending-neuron features; support is proven zero over the leader’s entire observed pre-stop trajectory. No route, timing, lap, reward, physics, save, production source or version enters the residual. Every candidate is a single-generation counterfactual, not training or a promoted model.',
    boundary:'Even a candidate that advances farther is not a learned policy until natural generations and complete two-lap full-start validation succeed. No app source, save, version, release, portable or installer is changed.'};
  if(!report.passed||!saveUnchanged)throw Error('Protected baseline or save integrity failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_POPULATION_RBF_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,candidates:report.candidates,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
