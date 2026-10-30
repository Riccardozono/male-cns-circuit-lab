'use strict';
// Read-only, current-source A/B from the user's V3/Monza generation-64 save.
// Treatment focuses only learned steering-readout mutations after a no-lap
// stall; throttle/brake remain controlled by the existing neural policy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),focusMode=process.argv.find(a=>a.startsWith('--focus='))?.slice(8)||'steering',savePath=process.argv.slice(2).find(a=>!a.startsWith('--'))||'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',out=path.join(root,`.impeccable/review/learning-ml/${focusMode==='steering'?'steering':'joint-steering-longitudinal'}-focus-current-v3-gen64-20261020`);
assert.ok(['steering','joint'].includes(focusMode),'Use --focus=steering or --focus=joint');
assert.equal(fs.existsSync(savePath),true,'Expected user-supplied V3/Monza save not found');
assert.equal(fs.existsSync(out),false,'Refusing to overwrite an existing report');
const raw=fs.readFileSync(savePath,'utf8'),saveSha256=crypto.createHash('sha256').update(raw).digest('hex'),simFile=path.join(root,'outputs/simulation.js'),learningFile=path.join(root,'outputs/neural-learning.js'),simSource=fs.readFileSync(simFile,'utf8'),learningSource=fs.readFileSync(learningFile,'utf8');
function replaceExactly(text,before,after,count=1){assert.equal(text.split(before).length-1,count,`Expected ${count} occurrences of source contract: ${before}`);return text.replaceAll(before,after);}
function makeLearning(treatment){
  let text=learningSource;
  if(treatment){
    text=replaceExactly(text,'function safeMotorMutation(graph,values,r,amount,experience){','function safeMotorMutation(graph,values,r,amount,experience,focusMode=null){');
    text=replaceExactly(text,'const roll=r(),actions=roll<.35?[0]:roll<.7?[1]:[0,1],child=values.slice();',`const roll=r(),actions=focusMode==='steering'?[0]:focusMode==='joint'?[0,1]:roll<.35?[0]:roll<.7?[1]:[0,1],child=values.slice();`);
  }
  const m=new Module(learningFile,module);m.filename=learningFile;m.paths=Module._nodeModulePaths(path.dirname(learningFile));m._compile(text,learningFile);return m.exports;
}
function makeEngine(focusMode=null){
  const treatment=Boolean(focusMode);
  const learning=makeLearning(treatment),stats={focusedMutationCalls:0};
  if(treatment){
    const original=learning.safeMotorMutation;
    learning.safeMotorMutation=(...args)=>{if(args[5])stats.focusedMutationCalls++;return original(...args);};
  }
  let text=simSource;
  if(treatment){
    text=replaceExactly(text,'frontierParent.brain.policyExperience);',`frontierParent.brain.policyExperience,this.stagnation>=2&&maxLaps<1?'${focusMode}':null);`);
    text=replaceExactly(text,'parent.brain.policyExperience);',`parent.brain.policyExperience,this.stagnation>=2&&maxLaps<1?'${focusMode}':null);`);
  }
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const requireWithLearning=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?learning:requireWithLearning(request);
  m._compile(text,simFile);return {Simulation:m.exports.Simulation,compareAgents:m.exports.compareAgents,stats};
}
const Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js'),circuits=require('../outputs/data/circuits.json'),compact=require('../outputs/data/connectome.json');
function makeData(){return Legacy.tagV3(compact);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use the pinned Node 24.19.0 runtime');
  const data=makeData(),baseEngine=makeEngine(false),descriptor=new baseEngine.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'}),decoded=await Progress.decode(raw,'5.6.0'),payload=Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits}),state=payload.workers[0].state;
  assert.equal(state.generation,64);assert.equal(state.population,40);assert.equal(state.seed,7717);
  function run(label,engine){
    const sim=new engine.Simulation(makeData(),{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});Progress.restore(sim,state);
    const results=[],started=performance.now();
    for(let i=0;i<2;i++){
      const generation=sim.generation,startedGeneration=performance.now();let ticks=0;
      while(sim.generation===generation&&ticks<14000){sim.tick();ticks++;}
      if(sim.generation===generation)throw Error(`${label}: natural generation guard reached at ${generation}`);
      const h=sim.history.at(-1),cars=sim.cars.filter(c=>!c.diagnosticVehicle),ranked=cars.slice().sort(engine.compareAgents),progressLeader=cars.slice().sort((a,b)=>b.bestProgress-a.bestProgress||engine.compareAgents(a,b))[0];
      results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-startedGeneration)/1000,bestProgressMeters:h.bestProgress/(sim.track.pixelsPerMeter||1),meanProgressMeters:h.meanProgress/(sim.track.pixelsPerMeter||1),maxLaps:h.maxLaps,bestFitness:h.best,stagnation:h.stagnation,mutationAmount:h.mutationAmount,frontierOffspring:sim.lastFrontierOffspringCount,focusedMutationCalls:engine.stats.focusedMutationCalls,progressLeaderFitnessRank:ranked.indexOf(progressLeader)+1,progressLeaderSteering:progressLeader.outputs?.[0]??null,progressLeaderGas:progressLeader.outputs?.[1]??null,progressLeaderBrake:progressLeader.outputs?.[2]??null,reasons:cars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),practiceEvaluations:sim.practiceEvaluations||0,practiceImprovements:(sim.practiceResults||[]).filter(r=>r.improved).length});
      engine.stats.focusedMutationCalls=0;
    }
    return {label,generationStart:state.generation,population:state.population,seed:state.seed,results,wallSeconds:(performance.now()-started)/1000};
  }
  const control=run('balanced-current',baseEngine),focused=run(`${focusMode}-focused-current`,makeEngine(focusMode));
  const saveAfter=crypto.createHash('sha256').update(fs.readFileSync(savePath)).digest('hex');assert.equal(saveAfter,saveSha256,'Original save changed during read-only benchmark');
  const actionDescription=focusMode==='steering'?'only steering readout weights are mutated':'steering and longitudinal readout weights are mutated together';
  const report={format:'male-cns-saved-v3-current-motor-focus-ab-v1',appVersion:'5.6.0',saveSha256,sourceSha256:{simulation:crypto.createHash('sha256').update(simSource).digest('hex'),learning:crypto.createHash('sha256').update(learningSource).digest('hex')},settings:{model:'V3',circuit:'Monza',seed:state.seed,startGeneration:state.generation,population:state.population,updatesPerArm:2,focusMode,focusCondition:`stagnation >= 2 and maxLaps < 1; ${actionDescription}; the existing neural policy still chooses actual actions`},method:'Two in-memory branches restored from the same validated save worker. Control uses current source. Treatment modifies only the per-process mutation action selector when the condition is met. Same physics, reward revision, sensors, neural state, optimizer, RNG state and natural termination. No save, app release, route policy, teacher or target steering labels are written.',control,focused,delta:focused.results.map((r,i)=>({generation:r.generation,bestProgressMeters:r.bestProgressMeters-control.results[i].bestProgressMeters,meanProgressMeters:r.meanProgressMeters-control.results[i].meanProgressMeters,laps:r.maxLaps-control.results[i].maxLaps,focusedCalls:r.focusedMutationCalls})),saveUnchanged:saveAfter===saveSha256,boundary:'A two-generation single-save experiment can show a local causal signal, not generalization across seeds or circuits and not a verified two-lap model.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STEERING_FOCUS_CURRENT '+JSON.stringify({report:path.join(out,'report.json'),saveUnchanged:report.saveUnchanged,control:control.results,focused:focused.results,delta:report.delta}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
