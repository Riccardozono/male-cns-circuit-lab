'use strict';
// Read-only investigation of the current Windows bundle. All training here is
// disposable, from zero, and never opens/imports the author's progress files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),appRoot=path.join(root,'dist-first-person-dev-560/win-unpacked/resources/app');
const output=path.join(root,'.impeccable/review/actuators-monza-final'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedNames=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/progress-save.js','outputs/desktop-runtime.js','outputs/desktop-state.js','outputs/app.js','outputs/model-profiles.js','outputs/legacy-models.js','outputs/data/connectome-full.bin','outputs/data/connectome-full.json','outputs/data/connectome.json','outputs/data/circuits.json','desktop/engine.cjs','desktop/worker.cjs','desktop/main.cjs','package.json'];
const files=protectedNames.flatMap(file=>[path.join(root,file),path.join(appRoot,file)]);
function physicalChecks(){
  const V=require(path.join(appRoot,'outputs/vehicle-992.js')),F=require(path.join(appRoot,'outputs/simulation.js'));
  const car=(kmh=0)=>{const c={id:0,x:0,y:0,heading:0,speed:kmh/3.6,_physicsSpeed:kmh/3.6,pixelsPerMeter:1,distance:0,lifetime:0,vehicle:V.createState()};V.synchroniseSpeed(c.vehicle,kmh/3.6);return c;};
  const braking=[],steering=[];
  for(const kmh of [60,100,160])for(const pedal of [0,.1,.3,1]){
    const c=car(kmh);let stopped=null,peakDeceleration=0,absTicks=0;
    for(let tick=0;tick<900;tick++){V.step(c,F.normalizeDriveCommands([0,0,pedal]),1/60);peakDeceleration=Math.min(peakDeceleration,c.vehicle.ax);absTicks+=Number(c.vehicle.absActive);if(c.vehicle.speedMps<.1&&stopped===null){stopped=(tick+1)/60;break;}}
    braking.push({startKmh:kmh,pedal,endKmh:c.vehicle.speedMps*3.6,stopSeconds:stopped,distanceM:c.distance,peakDecelerationMps2:peakDeceleration,absTicks});
  }
  for(const kmh of [60,100,160])for(const command of [0,.025,.05,.1,.2]){
    const c=car(kmh);let peakG=0,peakSlip=0;
    for(let tick=0;tick<60;tick++){V.step(c,[command,0,0],1/60);peakG=Math.max(peakG,Math.abs(c.lateralG));peakSlip=Math.max(peakSlip,Math.abs(c.slipAngle));}
    steering.push({startKmh:kmh,command,roadWheelDeg:c.vehicle.steeringAngle*180/Math.PI,peakLateralG:peakG,peakBodySlipDeg:peakSlip*180/Math.PI,headingChangeDeg:c.heading*180/Math.PI,lateralMetres:c.y,endKmh:c.vehicle.speedMps*3.6});
  }
  const checks=[{name:'Full brake stops from 60, 100 and 160 km/h',passed:braking.filter(x=>x.pedal===1).every(x=>x.stopSeconds!==null&&x.endKmh<.36)},
    {name:'Increasing brake pressure shortens stopping distance',passed:[60,100,160].every(kmh=>{const rows=braking.filter(x=>x.startKmh===kmh);return rows[3].distanceM<rows[2].distanceM&&rows[2].distanceM<rows[1].distanceM&&rows[1].distanceM<rows[0].distanceM;})},
    {name:'Normalized equal pedals cancel, a pure brake does not',passed:JSON.stringify(F.normalizeDriveCommands([.1,.8,.8]))===JSON.stringify([.1,0,0])&&F.normalizeDriveCommands([0,0,1])[2]===1}];
  return {checks,braking,steering,steeringMap:{maxRoadWheelDeg:F.PHYSICS.maxSteerAngle*180/Math.PI,roadWheelDegAtPoint1:F.PHYSICS.maxSteerAngle*.1*180/Math.PI,controlRateHz:10},boundary:'Same reduced SI vehicle for V2-V5, flat ground, isolated synthetic initial speeds, no track walls or traffic. Simulation values, not measured Porsche braking or steering specifications.'};
}
if(!process.versions.electron){
  fs.mkdirSync(output,{recursive:true});const {spawn}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'malecns-actuator-diagnostic-'));
  const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[__filename,'--model-benchmark','--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));
  child.stdout.on('data',b=>process.stdout.write(b));
  const guard=setTimeout(()=>{console.error('Only the disposable diagnostic process reached its wall guard');child.kill();},420000);
  child.once('error',error=>{clearTimeout(guard);console.error(error);process.exitCode=1;});child.once('exit',code=>{clearTimeout(guard);console.log('ACTUATOR_EXIT '+code);process.exitCode=code===0?0:1;});
}else{
  const {app}=require('electron'),before=Object.fromEntries(files.map(file=>[file,hash(file)])),cases=[],statsByCase=new Map(),decoderByCase=new Map();let activeCase=null;
  const profile=process.argv.find(x=>x.startsWith('--user-data-dir='))?.slice(16);if(!profile)throw Error('A disposable profile is required');app.setAppPath(appRoot);app.setPath('userData',profile);
  const threads=require('node:worker_threads'),OriginalWorker=threads.Worker;
  threads.Worker=class extends OriginalWorker{
    constructor(file,options){
      const key=activeCase?.key,own=options?.workerData&&path.resolve(file)===path.join(appRoot,'desktop/worker.cjs');
      super(own&&key?path.join(__dirname,'actuator-probe-worker.cjs'):file,own&&key?{...options,workerData:{...options.workerData,seed:activeCase.seed,actuatorOriginalWorker:file}}:options);
      if(own&&key)this.on('message',message=>{if(message.type==='actuator-diagnostic')statsByCase.set(key,message);if(message.type==='actuator-decoder')decoderByCase.set(key,message);});
    }
  };
  const engineModule=require(path.join(appRoot,'desktop/engine.cjs')),OriginalEngine=engineModule.DesktopEngine,instances=[];
  engineModule.DesktopEngine=class extends OriginalEngine{constructor(...args){super(...args);instances.push(this);}start(options,...args){return super.start({...options,workerCount:1,running:false},...args);}};
  const harness=require(path.join(appRoot,'desktop/model-benchmark.cjs'));
  harness.run=async window=>{
    const wc=window.webContents,errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),js=code=>wc.executeJavaScript(code,true);
    wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
    const until=async(fn,label,limit=45000)=>{const start=performance.now();while(!await fn()){if(performance.now()-start>limit)throw Error('Diagnostic timeout '+label);await wait(80);}};
    await until(()=>js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert)'),'startup');
    const engine=instances[0],physics=physicalChecks();fs.writeFileSync(path.join(output,'physics.json'),JSON.stringify(physics,null,2));
    console.log('PHYSICAL_ACTUATORS '+JSON.stringify({checks:physics.checks,brake100:physics.braking.filter(x=>x.startKmh===100),steer100:physics.steering.filter(x=>x.startKmh===100)}));
    // No screenshots are claimed: keep the actual rendering idle to avoid
    // competing with this diagnostic's neural GPU work and the author's app.
    await js('document.getElementById("circuit-view").hidden=true;document.getElementById("brain-view").hidden=true');
    for(const modelId of ['v3','v2','v4','v5'])for(const seed of [7717,19037]){
      activeCase={modelId,seed,key:modelId+'-'+seed};console.log('ACTUATOR_START '+JSON.stringify(activeCase));
      if(await js('circuitLab.sim.modelId')!==modelId){await js('document.getElementById("controller-select").value='+JSON.stringify(modelId)+';document.getElementById("controller-select").dispatchEvent(new Event("change",{bubbles:true}))');await until(()=>js('circuitLab.sim.modelId==='+JSON.stringify(modelId)+'&&!document.getElementById("controller-select").disabled'),'model '+modelId);}
      await engine.start({modelId,circuitId:'monza',population:32,mutation:.16,speedMultiplier:30,mode:'connectome',running:false,workerCount:1,rendererToken:engine.options.rendererToken});
      await js('circuitLab.sim.reconnect()');await until(()=>js('circuitLab.sim.population===32&&circuitLab.sim.circuitId==="monza"&&!circuitLab.sim.running'),'cold start');
      const started=performance.now();await js('circuitLab.sim.running=true');await engine.command({type:'pause',value:true});
      while(performance.now()-started<25000){const s=engine.states[0];if(s?.generation>=13&&performance.now()-started>=4000)break;await wait(150);}
      await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});await wait(250);
      const nativeState=engine.states[0],stats=statsByCase.get(activeCase.key)?.stats,decoder=decoderByCase.get(activeCase.key);
      if(!stats||!decoder)throw Error('Missing per-tick telemetry '+activeCase.key);
      const denominator=Math.max(1,stats.carTicks),moving=Math.max(1,stats.movingTicks);
      const item={...activeCase,wallSeconds:(performance.now()-started)/1000,nativeGeneration:nativeState.generation,censored:nativeState.generation<13,gpu:{...engine.gpu},decoder,stats,
        brakeFraction:stats.brakeTicks/denominator,brakeMovingFraction:stats.brakeWhileMovingTicks/moving,meanBrake:stats.brakeSum/denominator,meanGas:stats.throttleSum/denominator,meanAbsSteering:stats.steeringSum/denominator,
        meanSteeringStep:stats.steeringDeltaSum/Math.max(1,stats.controlChanges),perGeneration:statsByCase.get(activeCase.key).perGeneration,
        history:(nativeState.history||[]).map(h=>({generation:h.generation,laps:h.laps,bestProgress:h.bestProgress,bestLapTime:h.bestLapTime}))};
      cases.push(item);fs.writeFileSync(path.join(output,activeCase.key+'.json'),JSON.stringify(item,null,2));
      console.log('ACTUATOR_CASE '+JSON.stringify({...item,decoder:undefined,perGeneration:undefined,history:undefined}));activeCase=null;
    }
    const unchanged=files.every(file=>hash(file)===before[file]),version=await js('circuitLab.version');
    const report={passed:unchanged&&!errors.length&&cases.length===8&&cases.every(c=>c.decoder.passed&&c.stats.overlapTicks===0)&&physics.checks.every(c=>c.passed),version,bundle:appRoot,configuration:{circuit:'monza',models:['v2','v3','v4','v5'],seeds:[7717,19037],population:32,mutation:.16,speed:30,workers:1,stopAfterGeneration:12,minWallSeconds:4,maxWallSeconds:25},physics,cases,productionFilesUnchanged:unchanged,sourceSha256:before,consoleErrors:errors,
      boundary:'Actual current Windows-bundle neural/physical workers, per-tick observation, independent cold starts in a disposable profile, synthetic decoder/flat-ground fixtures separately labelled. No user progress imported/read/modified; no source fixes, forced evolve or driving aid. Bounded cases are not the user live V3 state, training convergence or a Porsche validation.'};
    fs.writeFileSync(path.join(output,'diagnosis.json'),JSON.stringify(report,null,2));console.log('ACTUATOR_DONE '+JSON.stringify({passed:report.passed,cases:cases.length,productionFilesUnchanged:unchanged,consoleErrors:errors}));return report;
  };
  require(path.join(appRoot,'desktop/main.cjs'));
}
