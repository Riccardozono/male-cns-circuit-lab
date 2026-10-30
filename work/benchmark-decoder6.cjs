'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const root=path.resolve(__dirname,'..'),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
  migrated=path.join(root,'.impeccable/review/decoder6/migration/Circuit-Lab-5.6.0-v3-decoder6-monza-gen64.malecns-save');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
if(isMainThread){
  const generations=Number(arg('generations','3')),index=Number(arg('worker','0')),tag=arg('tag','initial'),variants=arg('variants','control,decoder6').split(',');
  if(!Number.isInteger(generations)||generations<1||generations>30||!Number.isInteger(index)||index<0||index>4||!/^[a-z0-9-]+$/.test(tag)||variants.some(v=>!['baseline','control','decoder6'].includes(v)))throw Error('Invalid benchmark options');
  const output=path.join(root,'.impeccable/review/decoder6',tag);fs.mkdirSync(output,{recursive:true});
  const originalHash=hash(original),copyHash=hash(migrated);
  const run=variant=>new Promise((resolve,reject)=>{
    const thread=new Worker(__filename,{workerData:{variant,generations,index,output}}),guard=setTimeout(()=>{thread.terminate();reject(Error('Disposable experiment wall guard reached'));},900000);
    thread.on('message',message=>{
      if(message.type==='generation'){
        fs.writeFileSync(path.join(output,variant+'-worker-'+index+'-partial.json'),JSON.stringify(message.value,null,2));
        console.log('DECODER6_GENERATION '+JSON.stringify(message.value.summary));
      }
      if(message.type==='progress')console.log('DECODER6_RUNNING '+JSON.stringify(message.value));
      if(message.type==='result'){clearTimeout(guard);fs.writeFileSync(path.join(output,variant+'-worker-'+index+'.json'),JSON.stringify(message.value,null,2));resolve(message.value);}
    });
    thread.once('error',e=>{clearTimeout(guard);reject(e);});thread.once('exit',code=>{if(code){clearTimeout(guard);reject(Error('Worker exited '+code));}});
  });
  (async()=>{
    const cases=[];for(let i=0;i<variants.length;i+=2)cases.push(...await Promise.all(variants.slice(i,i+2).map(run)));
    const summary={cases,originalUnchanged:hash(original)===originalHash,migratedUnchanged:hash(migrated)===copyHash,sourceSha256:originalHash,copySha256:copyHash,
      boundary:'Equal natural generation counts and starting saved populations; migrated residual weights zero and only copied history reset. CPU headless true neural/vehicle/reward modules, no future cross-worker champion exchange, no teacher, imposed line, projected motion or forced generation completion. Wall time includes auxiliary real-physics practice; not a rendering/GPU speed benchmark.'};
    fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(summary,null,2));
    console.log('DECODER6_BENCHMARK_DONE '+JSON.stringify({originalUnchanged:summary.originalUnchanged,migratedUnchanged:summary.migratedUnchanged,cases:cases.map(c=>({variant:c.variant,worker:c.workerIndex,generations:c.history.length,best:Math.max(...c.history.map(h=>h.bestProgress)),laps:Math.max(...c.history.map(h=>h.maxLaps)),wallSeconds:c.wallSeconds}))}));
  })().catch(e=>{console.error(e.stack);process.exitCode=1;});
}else{
  (async()=>{
    const {variant,generations,index,output}=workerData,base=variant==='baseline'?path.join(root,'dist-first-person-dev-560/win-unpacked/resources/app'):variant==='decoder6'?path.join(root,'.impeccable/experimental-decoder6'):root;
    const F=require(path.join(base,'outputs/simulation.js')),P=require(path.join(base,'outputs/progress-save.js')),Legacy=require(path.join(base,'outputs/legacy-models.js'));
    const file=await P.decode(fs.readFileSync(variant==='decoder6'?migrated:original,'utf8'),'5.6.0'),state=file.payload.workers[index].state;
    const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
    const data=variant==='decoder6'?require('./decoder6-model.cjs').model(source):Legacy.tagV3(source),catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
    const sim=new F.Simulation(data,{population:state.population,circuitId:state.circuitId,circuits:catalog});
    P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
    const history=[],started=performance.now();let cars=[],last=started,maxBrake=0,maxSteering=0;
    sim.onTrialTick=s=>{
      for(const c of s.cars){if(c.speed/(c.pixelsPerMeter||1)>2){maxBrake=Math.max(maxBrake,c.slowOutputs?.[2]||0);maxSteering=Math.max(maxSteering,Math.abs(c.slowOutputs?.[0]||0));}}
      if(performance.now()-last>20000){last=performance.now();parentPort.postMessage({type:'progress',value:{variant,worker:index,generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}});}
      if(s.cars.every(c=>!c.alive))cars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason}));
    };
    for(let iteration=0;iteration<generations;iteration++){
      maxBrake=0;maxSteering=0;const generation=sim.generation;let ticks=0;
      while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation)throw Error('Natural generation unfinished; refusing forced evolve');
      const h={...sim.history.at(-1),maxBrake,maxSteering,cars,agentsAt750:cars.filter(c=>c.progress>=750).length,agentsAt850:cars.filter(c=>c.progress>=850).length,agentsAt1200:cars.filter(c=>c.progress>=1200).length,practiceEvaluations:sim.practiceEvaluations||0,practiceResults:sim.practiceResults||[]};history.push(h);
      parentPort.postMessage({type:'generation',value:{history,summary:{variant,worker:index,generation:h.generation,bestProgress:h.bestProgress,meanProgress:h.meanProgress,laps:h.maxLaps,at750:h.agentsAt750,at850:h.agentsAt850,at1200:h.agentsAt1200,maxBrake,maxSteering,practiceEvaluations:h.practiceEvaluations,wallSeconds:(performance.now()-started)/1000}}});
    }
    const result={variant,workerIndex:index,appVersion:file.appVersion,graph:P.compatibleGraph(sim.graph),settings:{population:state.population,mutation:state.mutation,circuitId:state.circuitId,seed:state.seed,savedGeneration:state.generation},history,wallSeconds:(performance.now()-started)/1000,
      sourceSha256:Object.fromEntries(['simulation.js','neural-learning.js','progress-save.js','vehicle-992.js','rewards.js'].map(f=>[f,hash(path.join(base,'outputs',f))]))};
    fs.writeFileSync(path.join(output,variant+'-worker-'+index+'-result.malecns-save'),await P.encode(P.fromSimulation(sim),'5.6.0'));
    parentPort.postMessage({type:'result',value:result});
  })().catch(e=>{console.error(e.stack);process.exitCode=1;});
}
