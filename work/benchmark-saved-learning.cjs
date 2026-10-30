'use strict';
// Equal-generation, deterministic comparisons. Saved training is read-only;
// each case runs in a disposable worker and reports actual natural episodes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const tagArg=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)||workerData?.tag||'initial';
if(!/^[a-z0-9-]+$/.test(tagArg))throw Error('Invalid report tag');
const output=path.join(root,'.impeccable/review/learning-actuators-560',tagArg);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(isMainThread){
  const arg=(name,otherwise)=>{const i=process.argv.indexOf('--'+name);return i<0?otherwise:process.argv[i+1];};
  const generations=Number(arg('generations',6)),indices=arg('workers','0,4').split(',').map(Number),variants=arg('variants','baseline,fixed').split(',');
  if(!Number.isInteger(generations)||generations<1||generations>100||indices.some(i=>!Number.isInteger(i)||i<0||i>4)||variants.some(v=>!['baseline','fixed'].includes(v)))throw Error('Invalid comparison configuration');
  fs.mkdirSync(output,{recursive:true});
  const queue=indices.flatMap(index=>variants.map(variant=>({index,variant,generations,tag:tagArg}))),results=[];
  const initialSaveSha=hash(savePath);
  async function run(options){
    return new Promise((resolve,reject)=>{
      const w=new Worker(__filename,{workerData:options}),guard=setTimeout(()=>{w.terminate();reject(Error('Only disposable comparison timed out '+JSON.stringify(options)));},600000);
      w.on('message',m=>{
        if(m.type==='progress')console.log('LEARNING_IN_PROGRESS '+JSON.stringify(m.value));
        if(m.type==='generation')console.log('LEARNING_EPISODE '+JSON.stringify(m.value));
        if(m.type==='result'){clearTimeout(guard);fs.writeFileSync(path.join(output,options.variant+'-worker-'+options.index+'-gen'+generations+'.json'),JSON.stringify(m.value,null,2));results.push(m.value);resolve(m.value);}
      });
      w.once('error',e=>{clearTimeout(guard);reject(e);});w.once('exit',code=>{if(code){clearTimeout(guard);reject(Error('Comparison worker exit '+code));}});
    });
  }
  (async()=>{
    for(let i=0;i<queue.length;i+=2)await Promise.all(queue.slice(i,i+2).map(run));
    const report={cases:results,saveUnchanged:hash(savePath)===initialSaveSha,saveSha256:initialSaveSha,boundary:'One saved population per case, original genomes/settings/seed/optimizer, equal natural generation counts; CPU/headless using actual simulator modules. No future inter-worker champion exchange. No manual driving, track projection, teacher or shortened forced episodes. This is a training comparison, not a frame-rate/GPU benchmark or proof of general convergence.'};
    fs.writeFileSync(path.join(output,'comparison-gen'+generations+'.json'),JSON.stringify(report,null,2));
    console.log('LEARNING_COMPARISON_DONE '+JSON.stringify({saveUnchanged:report.saveUnchanged,cases:results.map(r=>({variant:r.variant,worker:r.workerIndex,generations:r.history.length,initial:r.history[0].bestProgress,best:Math.max(...r.history.map(h=>h.bestProgress)),laps:Math.max(...r.history.map(h=>h.maxLaps)),last:r.history.at(-1).bestProgress,wallSeconds:r.wallSeconds}))}));
  })().catch(e=>{console.error(e.stack);process.exitCode=1;});
}else{
  (async()=>{
    const options=workerData,base=options.variant==='baseline'?path.join(root,'dist-first-person-dev-560/win-unpacked/resources/app'):root;
    const F=require(path.join(base,'outputs/simulation.js')),P=require(path.join(base,'outputs/progress-save.js')),Legacy=require(path.join(base,'outputs/legacy-models.js'));
    const file=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0'),state=file.payload.workers[options.index].state;
    const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(base,'outputs/data/connectome.json'),'utf8'))),catalog=JSON.parse(fs.readFileSync(path.join(base,'outputs/data/circuits.json'),'utf8'));
    const sim=new F.Simulation(data,{population:state.population,circuitId:state.circuitId,circuits:catalog}),history=[];
    P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
    const sourceSha256=Object.fromEntries(['simulation.js','neural-learning.js','vehicle-992.js','rewards.js','progress-save.js'].map(f=>[f,hash(path.join(base,'outputs',f))]));
    const topologyHash=crypto.createHash('sha256').update(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)).digest('hex');
    let finalCars=null,lastProgress=performance.now();
    sim.onTrialTick=s=>{
      if(performance.now()-lastProgress>20000){lastProgress=performance.now();parentPort.postMessage({type:'progress',value:{variant:options.variant,worker:options.index,generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,bestProgress:Math.max(...s.cars.map(c=>c.bestProgress)),laps:Math.max(...s.cars.map(c=>c.laps))}});}
      if(s.cars.every(c=>!c.alive))finalCars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason,clusters:c.brain.policyExperience?.centres.length||0}));
    };
    const started=performance.now();
    for(let g=0;g<options.generations;g++){
      const generation=sim.generation;let ticks=0;while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation)throw Error('Natural generation did not finish; no forced evolution is allowed');
      const h=sim.history.at(-1),entry={...h,reasons:finalCars.reduce((m,c)=>(m[c.reason]=(m[c.reason]||0)+1,m),{}),agentsAt750:finalCars.filter(c=>c.progress>=750).length,agentsAt850:finalCars.filter(c=>c.progress>=850).length,practiceEvaluations:sim.practiceEvaluations||0,practiceResults:sim.practiceResults||[]};
      history.push(entry);parentPort.postMessage({type:'generation',value:{variant:options.variant,worker:options.index,generation:h.generation,bestProgress:h.bestProgress,meanProgress:h.meanProgress,laps:h.maxLaps,fitness:h.best,at750:entry.agentsAt750,at850:entry.agentsAt850,practiceEvaluations:entry.practiceEvaluations,practiceResults:entry.practiceResults,wallSeconds:(performance.now()-started)/1000}});
    }
    const result={variant:options.variant,workerIndex:options.index,version:file.appVersion,configuration:{circuit:state.circuitId,population:state.population,mutation:state.mutation,seed:state.seed,savedGeneration:state.generation,requestedGenerations:options.generations},sourceSha256,history,
      wallSeconds:(performance.now()-started)/1000,topologyUnchanged:topologyHash===crypto.createHash('sha256').update(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)).digest('hex'),trainingOnlyNeuralMutation:true};
    parentPort.postMessage({type:'result',value:result});
  })().catch(e=>{console.error(e.stack);process.exitCode=1;});
}
