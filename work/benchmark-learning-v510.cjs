'use strict';
// Natural cold-start learning check, isolated from the user's saved training.
// Compare physical distance, not old/new points with different reward scales.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),tag=process.argv.find(s=>s.startsWith('--tag='))?.slice(6)||'final',output=path.join(root,'outputs','learning-verification-v510',tag);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/model-profiles.js'];
if(!process.versions.electron){
  fs.mkdirSync(output,{recursive:true});
  const {spawn}=require('node:child_process'),profile=path.join(os.tmpdir(),'male-cns-learning-diagnosis-'+crypto.randomUUID()),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(path.join(root,'node_modules','electron','dist','electron.exe'),[__filename,...process.argv.slice(2),'--model-benchmark','--model-output-dir='+output,'--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));
  child.stdout.on('data',b=>process.stdout.write(b));
  const guard=setTimeout(()=>{console.error('Diagnostic wall guard: stopping only our disposable process');child.kill();},600000);
  child.on('error',e=>{clearTimeout(guard);console.error(e);process.exitCode=1;});child.on('exit',code=>{clearTimeout(guard);console.log('DIAGNOSTIC_EXIT '+code);process.exitCode=code===0?0:1;});
}else{
  const {app}=require('electron'),sourceBefore=Object.fromEntries(sourceFiles.map(f=>[f,hash(path.join(root,f))]));
  app.setAppPath(root);const profile=process.argv.find(a=>a.startsWith('--user-data-dir='))?.slice(16);if(!profile)throw Error('Disposable profile required');app.setPath('userData',profile);
  const engineModule=require('../desktop/engine.cjs'),OriginalEngine=engineModule.DesktopEngine,instances=[];
  engineModule.DesktopEngine=class ObservedEngine extends OriginalEngine{constructor(...args){super(...args);instances.push(this);}};
  const harness=require('../desktop/model-benchmark.cjs');
  harness.run=async(window)=>{
    const wc=window.webContents,errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),js=async code=>{try{return await wc.executeJavaScript(code,true);}catch(e){throw Error(e.message+' · probe '+code+' · console '+JSON.stringify(errors));}};
    wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
    const until=async(code,ms=60000)=>{const start=Date.now();while(!await js(code)){if(Date.now()-start>ms)throw Error('Diagnostic wait: '+code);await wait(50);}};
    await until('Boolean(globalThis.circuitLab?.sim?.engine?.sessionId)&&!document.querySelector("main").inert');const engine=instances[0];if(!engine)throw Error('Engine not captured');
    await js('document.getElementById("track-mode-2d").click()');
    await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});await engine.command({type:'setWorkerCount',value:1});await js('circuitLab.sim.reconnect()');
    const cases=[];
    for(const modelId of ['v2','v3','v4','v5']){
      if(await js('circuitLab.sim.modelId')!==modelId){await js(`document.getElementById('controller-select').value=${JSON.stringify(modelId)};document.getElementById('controller-select').dispatchEvent(new Event('change',{bubbles:true}));`);await until(`circuitLab.sim.modelId===${JSON.stringify(modelId)}&&!document.getElementById('controller-select').disabled`);}
      await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});await engine.command({type:'setWorkerCount',value:1});await js('circuitLab.sim.reconnect()');
      await engine.command({type:'setCircuit',value:'monza'});await engine.command({type:'setMutation',value:.16});await engine.command({type:'setPopulation',value:16});await engine.command({type:'setSpeed',value:30});await engine.command({type:'reset'});
      await until('circuitLab.sim.circuitId===\'monza\'&&circuitLab.sim.generation===1&&circuitLab.sim.population===16&&!circuitLab.sim.running');
      const initial=await engine.exportProgress(),graph=await js('({neurons:circuitLab.sim.graph.n,parameters:circuitLab.sim.graph.learning.length,lengthMeters:circuitLab.sim.track.lengthMeters,ppm:circuitLab.sim.track.pixelsPerMeter,referenceLapSeconds:FlySim.Rewards.referenceLapTime(circuitLab.sim.track)})');
      const entries=new Map(),dead=new Map(),actions={samples:0,gas:0,brake:0,steer:0,gasAboveHalf:0,brakeAboveHalf:0,moving:0},emit=engine.emitSnapshot;
      engine.emitSnapshot=s=>{
        emit(s);if(s.circuitId!=='monza'||s.engine?.modelId&&s.engine.modelId!==modelId)return;
        for(const h of s.history||[])if(!entries.has(h.generation)){entries.set(h.generation,h);if(h.generation===1||h.generation%10===0)console.log('LEARNING_GENERATION '+JSON.stringify({modelId,generation:h.generation,best:h.best,baseBest:h.baseBest,bestMeters:h.bestProgress/graph.ppm,laps:h.laps,updates:h.learning?.updates}));}
        for(const c of s.cars||[]){if(!c.alive)dead.set(s.generation+':'+c.id,c.reason);else{actions.samples++;actions.gas+=c.outputs[1];actions.brake+=c.outputs[2];actions.steer+=Math.abs(c.outputs[0]);actions.gasAboveHalf+=Number(c.outputs[1]>.5);actions.brakeAboveHalf+=Number(c.outputs[2]>.5);actions.moving+=Number(Math.abs(c.speed/graph.ppm)>1);}}
      };
      const started=performance.now();await js('circuitLab.sim.running=true');
      while(entries.size<60&&performance.now()-started<90000){if(engine.states[0]?.learningStats?.updates>=60)break;await wait(100);}
      await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});const final=await engine.exportProgress();
      for(const h of final.workers[0].state.history)entries.set(h.generation,h);engine.emitSnapshot=emit;
      const before=initial.workers[0].state,after=final.workers[0].state,history=[...entries.values()].sort((a,b)=>a.generation-b.generation);
      const avg=values=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),median=values=>{const v=values.slice().sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:null;};
      const section=rows=>({generations:rows.length,medianBest:median(rows.map(h=>h.best)),medianBaseBest:median(rows.map(h=>h.baseBest)),medianBestMeters:median(rows.map(h=>h.bestProgress/graph.ppm)),medianSelectedMeters:median(rows.map(h=>h.rewardBreakdown.rewards.progress/5000*graph.lengthMeters)),meanProgressMeters:avg(rows.map(h=>h.meanProgress/graph.ppm))});
      const comparison=history.filter(h=>h.laps===0).map(h=>({generation:h.generation,furthestMeters:h.bestProgress/graph.ppm,selectedMeters:h.rewardBreakdown.rewards.progress/5000*graph.lengthMeters,selectedNet:h.best,selectedRewards:h.reward,selectedPenalties:h.penalty,penalties:h.rewardBreakdown.penalties}));
      const reasonCounts={};for(const reason of dead.values())reasonCounts[reason]=(reasonCounts[reason]||0)+1;
      const item={modelId,circuit:'monza',seed:before.seed,population:before.population,mutation:before.mutation,requestedSpeed:30,workerCount:1,graph,wallSeconds:(performance.now()-started)/1000,completedGenerations:after.generation-1,censored:after.optimizer.updates<60,optimizerUpdates:after.optimizer.updates,episodes:after.optimizer.episodes,meanRmsDelta:Math.sqrt(avg(after.optimizer.mean.map((v,i)=>(v-before.optimizer.mean[i])**2))),initialSigmaMean:avg(before.optimizer.sigma),finalSigmaMean:avg(after.optimizer.sigma),finalMeanSteeringBias:after.optimizer.mean.at(-2),finalMeanLongitudinalBias:after.optimizer.mean.at(-1),firstFive:section(history.slice(0,5)),lastFive:section(history.slice(-5)),bestMeters:Math.max(0,...history.map(h=>h.bestProgress/graph.ppm)),maxLaps:Math.max(0,...history.map(h=>h.laps)),anyLapAgents:history.reduce((n,h)=>n+16-h.noLapCount,0),selectedLessThanHalfFurthest:comparison.filter(h=>h.furthestMeters>20&&h.selectedMeters<h.furthestMeters/2).length,sampledActions:{...actions,meanGas:actions.gas/Math.max(1,actions.samples),meanBrake:actions.brake/Math.max(1,actions.samples),movingFraction:actions.moving/Math.max(1,actions.samples)},observedTerminalReasons:reasonCounts,reasonBoundary:'Dead cars visible in snapshots only, not a complete episode ledger.',gpu:engine.gpu,comparison,history};
      cases.push(item);fs.writeFileSync(path.join(output,modelId+'.json'),JSON.stringify(item,null,2));console.log('LEARNING_CASE '+JSON.stringify({...item,history:undefined,comparison:undefined}));
    }
    const unchanged=sourceFiles.every(f=>hash(path.join(root,f))===sourceBefore[f]);
    const report={passed:unchanged&&!errors.length&&cases.length===4,appVersion:await js('circuitLab.version'),generatedAt:new Date().toISOString(),configuration:{circuit:'monza',seed:7717,population:16,mutation:.16,speed:30,maxNaturalGenerations:60,maxRealSecondsPerModel:90},cases,sourceSha256:sourceBefore,productionFilesUnchanged:unchanged,consoleErrors:errors,boundary:'Independent cold starts in an isolated source-app profile. No user progress imported or modified. Natural generations only, no forced evolve. One circuit and seed, bounded observations, not a statistical guarantee or the user live session.'};
    fs.writeFileSync(path.join(output,'diagnosis.json'),JSON.stringify(report,null,2));return report;
  };
  require('../desktop/main.cjs');
}
