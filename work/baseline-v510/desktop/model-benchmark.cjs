'use strict';
// Bounded natural generations on the actual hybrid engine, with no force-evolve
// command, teacher, prior checkpoint or route-driven motor. Wall guard only.
const fs=require('node:fs/promises'),path=require('node:path');
async function run(window,{output,version,forceCpuFallback=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);if(d.message?.startsWith('MODEL_CASE '))console.log(d.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id);
    const until=async fn=>{const begin=performance.now();while(!fn()){if(performance.now()-begin>60000)throw Error('Model benchmark initialization timeout: '+fn.toString());await wait(50);}};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    let latest;const unsubscribe=desktopCompute.onSnapshot(s=>{if(s.cars)latest=s;});
    await until(()=>globalThis.circuitLab?.sim?.engine?.sessionId&&latest);
    const cases=[];
    for(const model of ['v4','v5']){
      if(circuitLab.sim.modelId!==model){change('controller-select',model);await until(()=>circuitLab.sim.modelId===model&&!$('controller-select').disabled);}
      const s=circuitLab.sim;s.running=false;await until(()=>latest.engine?.sessionId===s.engine.sessionId&&!latest.running);
      await desktopCompute.command({type:'setWorkerCount',value:1});await s.reconnect();
      change('population-range',16);await until(()=>s.cars.length===16&&latest.population===16);s.mutation=.16;
      for(const circuit of ['lab','monza','monaco','le-mans']){
        change('circuit-select',circuit);await until(()=>s.circuitId===circuit&&latest.circuitId===circuit&&s.generation===1);
        const begin=performance.now();let physicalSeconds=0,lastGeneration=1,lastElapsed=0,peakActive=0,maxProgress=0;
        const sample=x=>{
          if(x.engine?.sessionId!==s.engine.sessionId||x.circuitId!==circuit)return;
          if(x.generation===lastGeneration)physicalSeconds+=Math.max(0,x.elapsed-lastElapsed);else physicalSeconds+=Math.max(0,x.elapsed);
          lastGeneration=x.generation;lastElapsed=x.elapsed;
          for(const c of x.cars||[]){peakActive=Math.max(peakActive,c.brain?.activeCount||0);maxProgress=Math.max(maxProgress,c.bestProgress||0);}
        };
        const stopSamples=desktopCompute.onSnapshot(sample);s.speedMultiplier=30;s.running=true;
        while(s.history.length<2&&performance.now()-begin<90000)await wait(50);
        s.running=false;await until(()=>!latest.running);stopSamples();
        const history=JSON.parse(JSON.stringify(s.history.slice(0,2))),wallSeconds=(performance.now()-begin)/1000;
        const item={modelId:model,circuitId:circuit,seed:7717,population:s.population,mutation:s.mutation,requestedSpeed:30,completedGenerations:history.length,censored:history.length<2,wallSeconds,observedSimSeconds:physicalSeconds,observedSimWallRatio:physicalSeconds/wallSeconds,peakActiveNeurons:peakActive,neurons:s.graph.n,connections:s.graph.edgeCount,parameters:s.graph.learning.length,readoutNeurons:s.graph.learning.nodes.length,solver:s.graph.solver,gpu:s.engine.gpu,gpuBufferBytes:s.gpu?.ownedBuffers.reduce((n,b)=>n+b.size,0)??0,bestProgress:Math.max(maxProgress,...history.map(h=>h.bestProgress)),completedLaps:Math.max(0,...history.map(h=>h.laps)),optimizer:s.learningStats,history};
        cases.push(item);console.log('MODEL_CASE '+JSON.stringify(item));
      }
    }
    unsubscribe();return {cases,version:circuitLab.version,warmStart:false,forcedGenerations:false,boundary:'Two naturally finished generations per V4/V5 and circuit, 16 cars, one seed. Censored means the wall-time guard ended the observation, never a forced training completion. Throughput observed from snapshots may undercount inter-generation tails. Does not establish long-run convergence or superiority.'};
  })()`,true);
  result.generatedAt=new Date().toISOString();result.consoleErrors=errors;result.forceCpuFallback=forceCpuFallback;
  result.passed=result.cases.length===8&&result.cases.every(c=>c.parameters===(c.modelId==='v5'?346:202)&&c.population===16&&c.optimizer?.warmStart===false)&&!errors.length;
  await fs.writeFile(path.join(output,'model-benchmark.json'),JSON.stringify(result,null,2));return result;
}
module.exports={run};
