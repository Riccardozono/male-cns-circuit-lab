'use strict';
// Reuses the established CMA runner while redirecting only its child runtime
// to an in-memory post-lap actuator model; no production module is edited.
const path=require('node:path'),crypto=require('node:crypto'),child=require('node:child_process'),fsp=require('node:fs/promises'),fs=require('node:fs'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tau=.15,runner=path.join(__dirname,'benchmark-statehead-cma-full.cjs'),
  worker=path.join(__dirname,'neural-statehead-cuda-worker-postlap-lag.cjs'),outFlag=process.argv.slice(2).find(a=>a.startsWith('--output='));
if(!outFlag)throw Error('An explicit new --output directory is required');const output=path.resolve(outFlag.slice('--output='.length));
const originalFork=child.fork;
child.fork=function(modulePath,args,options){
  if(path.basename(modulePath)==='neural-statehead-cuda-worker.cjs'){
    const config=JSON.parse(args[0]);config.actuatorTau=tau;
    return originalFork(worker,[JSON.stringify(config)],options);
  }
  return originalFork(modulePath,args,options);
};
const originalWrite=fsp.writeFile.bind(fsp);
fsp.writeFile=async function(file,data,options){
  if(path.resolve(String(file))===path.join(output,'report.json')){
    const report=JSON.parse(String(data));report.settings.postLapActuatorLagSeconds=tau;
    report.settings.postLapActuatorLagScope='Only after lap 1; first-order lag on steering/throttle/brake; exclusive pedal actuator retained.';
    report.method+=' A diagnostic in-memory actuator lag (tau 0.15 s) is applied only after lap 1 to the car command stream; the first lap remains identical to the protected no-lag replay.';
    report.sourceHashes.postLapLagHarness=crypto.createHash('sha256').update(await fsp.readFile(__filename)).digest('hex');
    report.sourceHashes.postLapLagWorker=crypto.createHash('sha256').update(await fsp.readFile(worker)).digest('hex');
    report.boundary='Changed actuator response is an experimental training environment, not a production change. The old champion is replayed but is protected from replacement unless a safe outcome wins. Any candidate must still complete two laps, exactly replay, and generalize across seeds before promotion.';
    data=JSON.stringify(report,null,2);
  }
  return originalWrite(file,data,options);
};
const runnerSource=fs.readFileSync(runner,'utf8'),before="resumeChampionRow=resume.generations.flatMap(g=>g.results).find(r=>JSON.stringify(r.weights)===JSON.stringify(resume.protectedChampion.weights));",
  after="resumeChampionRow=resume.generations.flatMap(g=>g.results).find(r=>JSON.stringify(r.weights)===JSON.stringify(resume.protectedChampion.weights)&&resumeVerification.replays.some(replay=>replay.id===r.id));";
if(runnerSource.split(before).length!==2)throw Error('Refusing an unrecognized CMA resume validator');
const compiled=new Module(runner,module);compiled.filename=runner;compiled.paths=Module._nodeModulePaths(path.dirname(runner));
process.argv=[process.execPath,runner,...process.argv.slice(2)];compiled._compile(runnerSource.replace(before,after),runner);
