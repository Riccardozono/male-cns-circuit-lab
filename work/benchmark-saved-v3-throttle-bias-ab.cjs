'use strict';
// Isolated one-car actuator-head experiment on a clone of the protected
// generation-64 safe V3 leader. No route signals, save migration or source
// controller changes; the baseline must reproduce before variants are read.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_BIAS_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-throttle-bias-ab-20261020-01'));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summarize(car,ticks,wallSeconds,biasDelta,initialBias){return {biasDelta,initialLongitudinalBias:initialBias,finalLongitudinalBias:initialBias+biasDelta,ticks,wallSeconds,
  progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),reason:car.reason,fitness:car.fitness,outputs:car.outputs.slice(),speedMps:car.vehicle?.speedMps??0,
  gas:car.outputs[1],brake:car.outputs[2],gear:car.vehicle?.gear??null,rpm:car.vehicle?.rpm??null};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite an existing A/B report');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  const simSha=sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learningSha=sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')));
  if(!control.passed||control.settings?.model!=='V3'||control.settings?.circuit!=='Monza'||control.settings?.startGeneration!==64||control.sourceHashes?.simulation!==simSha||control.sourceHashes?.learning!==learningSha)throw Error('Exact current-source V3/Monza control required');
  const saveRaw=fs.readFileSync(savePath),saveSha=sha(saveRaw),decoded=await Progress.decode(saveRaw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const source=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});Progress.validatePayload(decoded.payload,{graph:source.graph,circuits:source.circuits});Progress.restore(source,state);
  const target=Number(control.treatment.results[0].safeProgressLeader.id),parent=F.cloneGenome(source.cars[target].genome),weights=parent.policyWeights;
  if(!Array.isArray(weights)||parent.adapterVersion!==source.graph.learning.version)throw Error('Saved V3 leader does not use the verified neural readout adapter');
  const initialBias=weights.at(-1),biasDeltas=[0,.12,.2,.3],results=[];
  for(const biasDelta of biasDeltas){
    const sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
    const car=sim.cars[0];car.genome=F.cloneGenome(parent);car.genome.policyWeights[car.genome.policyWeights.length-1]+=biasDelta;
    F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;let ticks=0,terminal=null,lastLog=performance.now();
    sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!terminal)terminal={...summarize(c,s.ticks,0,biasDelta,initialBias),reason:c.reason||''};
      if(performance.now()-lastLog>15000){lastLog=performance.now();console.log('THROTTLE_BIAS_PROGRESS '+JSON.stringify({biasDelta,ticks:s.ticks,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),speedMps:c.vehicle?.speedMps??0,gas:c.outputs[1],brake:c.outputs[2]}));}};
    const start=performance.now();while(sim.generation===1&&ticks++<60000)sim.tick();const wallSeconds=(performance.now()-start)/1000;
    if(sim.generation===1||!terminal)throw Error(`Bias ${biasDelta} trial failed to finish naturally`);
    terminal.wallSeconds=wallSeconds;results.push(terminal);sim.running=false;
    if(biasDelta===0){const expected=control.treatment.results[0].outcomes.find(row=>row.id===target);
      if(terminal.progressM!==expected.progressM||terminal.laps!==expected.laps||terminal.reason!==expected.reason)throw Error('One-car baseline did not exactly reproduce the saved leader outcome');}
  }
  const report={format:'male-cns-saved-v3-throttle-bias-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.laps>=2),
    save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision,leaderId:target},
    method:'Four natural one-agent Monza rollouts from the exact saved safe-leader genome, changing only its final learned longitudinal policy bias by 0, +0.12, +0.20 or +0.30. The unmodified baseline must reproduce the saved current-source per-agent outcome exactly. Physics, sensors, reward revision, topology, steering weights and all other motor parameters are held fixed. CPU-only; all changes remain in memory.',
    sourceHashes:{simulation:simSha,learning:learningSha,vehicle:sha(fs.readFileSync(path.join(root,'outputs/vehicle-992.js'))),rewards:sha(fs.readFileSync(path.join(root,'outputs/rewards.js'))),save:saveSha},
    initialReadout:{adapterVersion:parent.adapterVersion,policyWeightCount:weights.length,longitudinalBias:initialBias},results,
    boundary:'Small local sensitivity test on one saved genome and one seed. It can show whether the learned negative throttle bias is causally relevant for this trajectory; it does not prove population-level learning, multi-seed robustness, or generalization and does not alter or migrate the user save.'};
  if(!report.save.unchanged)throw Error('Original V3 save SHA changed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('THROTTLE_BIAS_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged:report.save.unchanged,initialReadout:report.initialReadout,results,report:path.join(out,'report.json')}));source.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
