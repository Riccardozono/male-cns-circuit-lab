'use strict';
// Verifies the saved V3 leader inside its complete original 40-car generation.
// This is a CPU-only baseline control before any new decoder intervention.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-population-exact-control-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing exact-population control');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state),
    reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-targeted-terminal-telemetry-3gen-20261021-01/report.json'),'utf8')),
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  if(!reference.passed||reference.save?.sha256!==saveSha||state.generation!==64||state.population!==40||state.seed!==7717||state.rewardRevision!=='progress-3')
    throw Error('Exact generation-64 V3/Monza checkpoint and protected reference are required');
  const sourceHashes={simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  if(sourceHashes.simulation!==reference.sourceHashes.simulation||sourceHashes.learning!==reference.sourceHashes.learning)
    throw Error('Current application sources differ from the protected population reference');
  const expectedGeneration=reference.treatment.records.find(row=>row.generation===64),leader=expectedGeneration?.safeProgressLeader,
    expectedOutcomes=expectedGeneration?.terminal,expectedTrace=leader?.trace;
  if(!leader||!expectedTrace?.length||!expectedOutcomes?.length)throw Error('Protected complete-generation outcomes or neural trace are missing');
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
  const traceByTick=new Map(expectedTrace.map(row=>[row.tick,row]));let terminal=null,ticks=0;
  let matchedSamples=0,maxFeatureDelta=0,maxOutputDelta=0,maxProgressDeltaM=0,maxSpeedDeltaMps=0,anchor=null;
  sim.onTrialTick=s=>{
    const car=s.cars.find(item=>item.id===leader.id),expected=traceByTick.get(s.ticks);
    if(car&&expected){
      const features=Array.from(s.graph.learning.nodes,index=>Math.tanh(8*(Number(car.brain.activity[index])||0))),outputs=car.outputs.slice(),
        progressM=car.bestProgress/(s.track.pixelsPerMeter||1),speedMps=car.vehicle?.speedMps??0;
      matchedSamples++;
      maxFeatureDelta=Math.max(maxFeatureDelta,...features.map((value,index)=>Math.abs(value-expected.neuralFeatures[index])));
      maxOutputDelta=Math.max(maxOutputDelta,...outputs.map((value,index)=>Math.abs(value-expected.outputs[index])));
      maxProgressDeltaM=Math.max(maxProgressDeltaM,Math.abs(progressM-expected.bestProgressM));
      maxSpeedDeltaMps=Math.max(maxSpeedDeltaMps,Math.abs(speedMps-expected.speedMps));
      if(s.ticks===4002)anchor={tick:s.ticks,outputs,expectedOutputs:expected.outputs,maxFeatureDelta:Math.max(...features.map((value,index)=>Math.abs(value-expected.neuralFeatures[index])))};
    }
    if(s.cars.every(item=>!item.alive))terminal=s.cars.map(item=>({id:item.id,progressM:item.bestProgress/(s.track.pixelsPerMeter||1),laps:item.laps,reason:item.reason}));
  };
  while(sim.generation===64&&ticks<14000){sim.tick();ticks++;}
  if(sim.generation!==65||!terminal)throw Error('The restored 40-car generation did not finish naturally');
  const compare=(a,b)=>a.id-b.id,actual=terminal.sort(compare),expected=expectedOutcomes.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})).sort(compare);
  const outcomesMatch=JSON.stringify(actual)===JSON.stringify(expected),traceMatch=matchedSamples===expectedTrace.length&&maxFeatureDelta===0&&maxOutputDelta===0&&maxProgressDeltaM===0&&maxSpeedDeltaMps===0,
    saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const report={format:'male-cns-saved-v3-population-exact-control-v1',appVersion:'5.6.0',passed:outcomesMatch&&traceMatch&&saveUnchanged,
    learningSucceeded:false,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    sourceHashes,runtime:'Node 24.19.0 current CPU V3 solver',settings:{restoredCompletePopulation:true,population:state.population,targetLeaderId:leader.id,referenceSamples:expectedTrace.length,matchedSamples},
    outcomes:{matched:outcomesMatch,expectedLeader:{id:leader.id,progressM:leader.progressM,laps:leader.laps,reason:leader.reason},actualLeader:actual.find(row=>row.id===leader.id),expectedSafeMaximumM:expectedGeneration.bestProgressM},
    neuralTrace:{exact:traceMatch,matchedSamples,maxFeatureDelta,maxOutputDelta,maxProgressDeltaM,maxSpeedDeltaMps,anchorTick4002:anchor},
    method:'Restores the original 40-genome save with its native seed, optimizer and reward revision; advances the whole population using the actual Simulation.tick() loop; compares all 40 terminal outcomes and the selected leader neural/physical telemetry against the protected same-source generation report. No policy, reward, physics, model, save, app source, version, tag or release is changed.',
    boundary:'A matching population baseline is required before testing any intervention from the saved leader. This control alone does not improve learning or complete a lap.'};
  if(!report.passed)throw Error(`Exact complete-population baseline did not reproduce its protected outcomes/trace: ${JSON.stringify({outcomesMatch,traceMatch,matchedSamples,expectedSamples:expectedTrace.length,maxFeatureDelta,maxOutputDelta,maxProgressDeltaM,maxSpeedDeltaMps,anchor})}`);
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_POPULATION_EXACT_CONTROL '+JSON.stringify({passed:report.passed,saveUnchanged,leader:report.outcomes.actualLeader,neuralTrace:report.neuralTrace,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
