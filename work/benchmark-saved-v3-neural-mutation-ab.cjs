'use strict';
// Evaluate isolated offspring from the saved safe V3 leader using the app's
// existing neural-context-preserving motor mutation and real Monza physics.
// The user's file and production controller remain read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_MUTATION_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-neural-mutation-ab-20261020-01'));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const Learning=require(path.join(root,'outputs/neural-learning.js')),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function outcome(car,ticks,wallSeconds,base,weights){const off=base.readoutOffset,n=base.nodes.length;let longitudinalChanges=0,steeringChanges=0;
  for(let j=0;j<n;j++){if(weights[off+j*2]!==base.weights[off+j*2])steeringChanges++;if(weights[off+j*2+1]!==base.weights[off+j*2+1])longitudinalChanges++;}
  return {ticks,wallSeconds,fitness:car.fitness,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),safe:F.isSafeLearningOutcome(car),reason:car.reason||'',
    gas:car.outputs[1],brake:car.outputs[2],speedMps:car.vehicle?.speedMps??0,steer:car.outputs[0],steeringWeightsChanged:steeringChanges,longitudinalWeightsChanged:longitudinalChanges,
    longitudinalBias:weights.at(-1),steeringBias:weights.at(-2)};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing neural-mutation report');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  const simSha=sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learningSha=sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')));
  if(!control.passed||control.settings?.model!=='V3'||control.settings?.circuit!=='Monza'||control.settings?.startGeneration!==64||control.sourceHashes?.simulation!==simSha||control.sourceHashes?.learning!==learningSha)throw Error('Exact current-source V3/Monza control required');
  const saveRaw=fs.readFileSync(savePath),saveSha=sha(saveRaw),decoded=await Progress.decode(saveRaw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const baseSim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});Progress.validatePayload(decoded.payload,{graph:baseSim.graph,circuits:baseSim.circuits});Progress.restore(baseSim,state);baseSim.running=true;
  const target=Number(control.treatment.results[0].safeProgressLeader.id),gen=baseSim.generation,terminal=new Map();let ticks=0,leader=null,lastLog=performance.now();
  baseSim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
    const c=s.cars.find(car=>car.id===target);if(c&&!c.alive&&!leader)leader={genome:F.cloneGenome(c.genome),experience:structuredClone(c.brain.policyExperience||null),safe:F.isSafeLearningOutcome(c)};
    if(performance.now()-lastLog>15000){lastLog=performance.now();console.log('MUTATION_BASELINE_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,leaderProgressM:c.bestProgress/(s.track.pixelsPerMeter||1)}));}};
  while(baseSim.generation===gen&&ticks++<60000)baseSim.tick();
  if(baseSim.generation===gen||terminal.size!==state.population||!leader?.experience)throw Error('Current-source saved generation or neural-context capture is incomplete');
  const actual=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Generation-64 baseline does not exactly match the protected current-source control');
  const parent=leader.genome,policy=baseSim.graph.learning,experience=leader.experience;
  if(!parent.policyWeights||parent.adapterVersion!==policy.version||!Learning.valid(baseSim.graph,parent.policyWeights))throw Error('Safe leader policy is incompatible with current neural graph');
  const base={weights:parent.policyWeights.slice(),readoutOffset:policy.readoutOffset,nodes:policy.nodes},random=F.rng(20261020),mutationAmount=Number.isFinite(state.mutation)?state.mutation:.16;
  const evaluateStage=async(parentGenome,parentExperience,randomSeed,label)=>{
    const parentBase={weights:parentGenome.policyWeights.slice(),readoutOffset:policy.readoutOffset,nodes:policy.nodes},stageRandom=F.rng(randomSeed),variants=[];
    for(let attempt=0;attempt<160&&variants.length<16;attempt++){
      const weights=Learning.safeMotorMutation(baseSim.graph,parentGenome.policyWeights,stageRandom,mutationAmount,parentExperience);
      const changed=weights.some((value,i)=>value!==parentGenome.policyWeights[i]);
      const longitudinalChanged=Array.from({length:policy.nodes.length},(_,j)=>weights[policy.readoutOffset+j*2+1]!==parentGenome.policyWeights[policy.readoutOffset+j*2+1]).some(Boolean)||weights.at(-1)!==parentGenome.policyWeights.at(-1);
      if(changed&&longitudinalChanged)variants.push({attempt,weights});
    }
    if(variants.length<16)throw Error(`${label}: only ${variants.length} longitudinally distinct variants were produced`);
    const rows=[];
    for(let index=0;index<variants.length;index++){
      const variant=variants[index],sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0}),car=sim.cars[0];
      car.genome=F.cloneGenome(parentGenome);car.genome.policyWeights=variant.weights.slice();F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;
      let steps=0,terminalCar=null,terminalExperience=null,last=performance.now();
      sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!terminalCar){terminalCar=c;terminalExperience=structuredClone(c.brain.policyExperience||null);}
        if(performance.now()-last>20000){last=performance.now();console.log('MUTATION_CANDIDATE_PROGRESS '+JSON.stringify({stage:label,candidate:index+1,ticks:s.ticks,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),speedMps:c.vehicle?.speedMps??0}));}};
      const start=performance.now();while(sim.generation===1&&steps++<60000)sim.tick();const wallSeconds=(performance.now()-start)/1000;
      if(sim.generation===1||!terminalCar)throw Error(`${label} offspring ${index+1} did not terminate naturally`);
      rows.push({attempt:variant.attempt,...outcome(terminalCar,steps,wallSeconds,parentBase,variant.weights),weights:variant.weights,experience:terminalExperience});sim.running=false;
    }
    const ranked=rows.slice().sort((a,b)=>Number(b.safe)-Number(a.safe)||b.progressM-a.progressM||b.fitness-a.fitness);
    return {label,randomSeed,candidateCount:rows.length,ranked,results:rows};
  };
  const firstStage=await evaluateStage(parent,experience,20261020,'figli-diretti-dal-salvataggio');
  const firstBest=firstStage.ranked.find(row=>row.safe)||firstStage.ranked[0];
  if(!firstBest?.experience)throw Error('No neural-context experience was captured from the best direct mutation');
  const secondParent=F.cloneGenome(parent);secondParent.policyWeights=firstBest.weights.slice();
  const secondStage=await evaluateStage(secondParent,firstBest.experience,20261021,'figli-del-miglior-mutante');
  const publicRows=stage=>stage.results.map(({weights,experience,...row})=>row),publicBest=stage=>stage.ranked.slice(0,5).map(({weights,experience,...row})=>row);
  const anyLap=[...firstStage.results,...secondStage.results].some(r=>r.safe&&r.laps>=2);
  const report={format:'male-cns-saved-v3-existing-neural-mutation-two-stage-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:anyLap,
    save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision,leaderId:target},
    method:'Replays the exact saved generation-64 population, verifies all 40 per-agent outcomes, then evaluates 16 offspring from the app safeMotorMutation function. The best safe direct mutation becomes an in-memory parent for a second set of 16 descendants, using its own recorded neural-context experience. Only variants changing the learned longitudinal readout are included. All trials use the same Monza track, initial pose, physics and historical reward revision; no route controller, source mutation, save migration, promotion or training-state write.',
    sourceHashes:{simulation:simSha,learning:learningSha,vehicle:sha(fs.readFileSync(path.join(root,'outputs/vehicle-992.js'))),rewards:sha(fs.readFileSync(path.join(root,'outputs/rewards.js'))),save:saveSha},
    parent:{id:target,safe:leader.safe,policyVersion:parent.adapterVersion,parameters:parent.policyWeights.length,readoutNodes:policy.nodes.length,contextSamples:experience.samples,contextCentres:experience.centres.length,mutationAmount},
    stages:[{label:firstStage.label,randomSeed:firstStage.randomSeed,candidateCount:firstStage.candidateCount,rankedBest:publicBest(firstStage),results:publicRows(firstStage)},
      {label:secondStage.label,randomSeed:secondStage.randomSeed,parent:{progressM:firstBest.progressM,safe:firstBest.safe,reason:firstBest.reason,contextSamples:firstBest.experience.samples,contextCentres:firstBest.experience.centres.length},candidateCount:secondStage.candidateCount,rankedBest:publicBest(secondStage),results:publicRows(secondStage)}],
    boundary:'Two finite mutation batches from one saved checkpoint, one circuit and one start. This tests the app’s existing context-preserving motor exploration, not robust convergence or generalization; any promising child still needs multiple seeds, generations and circuits.'};
  if(!report.save.unchanged)throw Error('Original V3 save SHA changed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('MUTATION_AB_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged:report.save.unchanged,parent:report.parent,stages:report.stages.map(s=>({label:s.label,candidateCount:s.candidateCount,rankedBest:s.rankedBest})),report:path.join(out,'report.json')}));baseSim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
