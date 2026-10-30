'use strict';
// Finite-difference neural diagnostic on actually reached brain states.
// Sensor perturbations are counterfactual neural probes, NOT driving episodes,
// desired actions, optimizer examples or a claim of biological validation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const Model=require('./neural-statehead-model.cjs'),Identity=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),sha=Identity.sha;
function run({tag='neuronal-sensory-coverage-6590',modelFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json')}={}){
  if(!/^[a-z0-9-]+$/.test(tag)||process.versions.node!=='24.19.0')throw Error('Isolated name and pinned runtime required');
  const out=path.join(root,'.impeccable/review/neural-sacl',tag);fs.mkdirSync(out,{recursive:false});
  const loaded=Model.load(modelFile),env=Model.createFromLoaded(loaded),{graph,runtime}=env;
  const inputs=new Set(graph.inputs),reachable=new Uint8Array(graph.n),queue=Array.from(inputs);for(const i of queue)reachable[i]=1;
  for(let k=0;k<queue.length;k++){const i=queue[k];for(let e=graph.rowOffsets[i];e<graph.rowOffsets[i+1];e++){const j=graph.targets[e];if(!reachable[j]){reachable[j]=1;queue.push(j);}}}
  const descending=[];for(let i=0;i<graph.n;i++)if(!inputs.has(i)&&reachable[i]&&graph.classNames[graph.classCodes[i]]==='descending_neuron')descending.push(i);
  const old=Array.from(env.model.head.environment.readoutNodes),oldSet=new Set(old),readout64=Array.from(graph.learning.nodes),snapshots=[];
  const trace=crypto.createHash('sha256'),started=performance.now(),wanted=new Set([0,500,4000,8000]);let count=0;
  const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
  function probe(){
    const car=env.currentCar(),activity=car.brain.activity.slice(),sensors=car.sensorVector.slice(),genome=runtime.cloneGenome(car.genome);
    if(sensors.length!==28)throw Error('Actual28sensor vector required');
    const result={control:count,simulationSeconds:env.state().totalSimulationSeconds,progress:car.bestProgress,sensors,
      brainActivitySha256:sha(Buffer.from(activity.buffer,activity.byteOffset,activity.byteLength)),horizons:[]};
    function neuralResponse(values,horizon,edgesEnabled=true){const b=runtime.makeBrain(graph);b.activity.set(activity);b.decoderMemory=car.brain.decoderMemory.slice();for(let j=0;j<horizon;j++)runtime.neuralStep(graph,b,genome,values,true,edgesEnabled);return descending.map(i=>Math.tanh(8*b.activity[i]));}
    for(const horizon of [1,4]){
      const baseline=neuralResponse(sensors,horizon),channels=[];
      for(let channel=0;channel<28;channel++){
        const lo=sensors.slice(),hi=sensors.slice(),minimum=channel<11?0:-1;
        lo[channel]=Math.max(minimum,sensors[channel]-.05);hi[channel]=Math.min(1,sensors[channel]+.05);
        if(!(hi[channel]>lo[channel]))throw Error('Actual sensor outside its declared bounds');
        const a=neuralResponse(lo,horizon),b=neuralResponse(hi,horizon),jacobian=a.map((v,j)=>(b[j]-v)/(hi[channel]-lo[channel]));
        const sensitive=descending.filter((_,j)=>Math.abs(b[j]-a[j])>1e-7);
        channels.push({channel,actual:sensors[channel],probeRange:[lo[channel],hi[channel]],jacobian,
          allResponsive:sensitive.length,old128Responsive:sensitive.filter(i=>oldSet.has(i)).length,
          old64Responsive:sensitive.filter(i=>readout64.includes(i)).length,
          rmsDerivative:Math.sqrt(jacobian.reduce((s,v)=>s+v*v,0)/jacobian.length)});
      }
      result.horizons.push({neuralControls:horizon,baseline,channels});
    }
    snapshots.push(result);write('partial.json',{actualControl:count,snapshots});
  }
  while(!env.state().complete){if(performance.now()-started>180000)throw Error('Wall watchdog is censoring, not a physical terminal');if(wanted.has(count))probe();const s=env.step();count++;trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
  const state=env.state(),result={bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,lapTimes:state.lapTimes},hash=trace.digest('hex');
  const expected=loaded.data.expectedResult;
  if(!['bestProgress','fitness','laps','reason','totalSimulationSeconds'].every(k=>result[k]===expected[k])||JSON.stringify(result.lapTimes)!==JSON.stringify(expected.lapTimes)||hash!==loaded.data.fullTraceSha256||snapshots.length!==wanted.size)throw Error('Diagnostic changed the original physical episode or missed an actual state');
  const summary=snapshots.map(s=>({control:s.control,progress:s.progress,horizons:s.horizons.map(h=>({neuralControls:h.neuralControls,
    channelsSeenOld128:h.channels.filter(c=>c.old128Responsive>0).length,channelsSeenAll:h.channels.filter(c=>c.allResponsive>0).length,
    missingOld128:h.channels.filter(c=>c.old128Responsive===0).map(c=>c.channel),missingAll:h.channels.filter(c=>c.allResponsive===0).map(c=>c.channel)}))}));
  const report={passed:true,format:'male-cns-actual-neural-sensory-coverage-v1',modelSha256:loaded.sha256,result,actionTraceSha256:hash,
    sources:Identity.collect(['work/audit-neural-sensory-coverage.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe']),
    nodeCount:graph.n,edgeCount:graph.edgeCount,descendingNodes:descending,descendingBodyIds:descending.map(i=>graph.bodyIds[i]),
    oldReadout128:old,oldReadout64:readout64,snapshots,summary,physicalEpisodes:1,physicalControls:count,wallSeconds:(performance.now()-started)/1000,
    boundary:'Actual full parent trajectory unchanged. Finite sensor counterfactuals at4reached states, holding vehicle fixed for1or4neural controls. Not actual alternative driving transitions, no target actions, no training, no proof of universal observability or biological physiology.'};
  write('report.json',report);process.stdout.write(JSON.stringify({passed:true,descending:descending.length,physicalControls:count,summary,wallSeconds:report.wallSeconds})+'\n');return report;
}
if(require.main===module)run();module.exports={run};
