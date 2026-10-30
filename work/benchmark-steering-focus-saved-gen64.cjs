'use strict';
// Two-generation A/B fork from an exact, validated, read-only V3 save worker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),savePath=process.argv[2]||'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',out=path.join(root,'.impeccable/review/neural-sacl/steering-focus-saved-gen64');
assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:false});
const simFile=path.join(root,'outputs/simulation.js'),source=fs.readFileSync(simFile,'utf8');
const focusDeclaration='const steeringExploration=baseMutation>0&&this.stagnation>=EVOLUTION_RULES.stagnationWindow&&maxLaps===0;';
assert.ok(source.includes(focusDeclaration),'Current steering-focus condition missing');
function loadControl(){const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(source.replace(focusDeclaration,'const steeringExploration=false;'),simFile);return m.exports;}
const F=require('../outputs/simulation.js'),Control=loadControl(),Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js');
const raw=fs.readFileSync(savePath,'utf8'),data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
async function main(){
  const file=await Progress.decode(raw,'5.6.0'),descriptor=new F.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});
  const payload=Progress.validatePayload(file.payload,{graph:descriptor.graph,circuits:descriptor.circuits}),state=payload.workers[0].state;
  assert.equal(state.generation,64);assert.equal(state.population,40);
  function run(Engine,label){
    const sim=new Engine.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});Progress.restore(sim,state);
    const original=sim.evolve.bind(sim);sim.evolve=function(){
      const ranked=this.cars.filter(car=>!car.diagnosticVehicle).slice().sort(Engine.compareAgents),progressLeader=this.cars.filter(car=>!car.diagnosticVehicle).slice().sort((a,b)=>b.bestProgress-a.bestProgress||Engine.compareAgents(a,b))[0];
      this.preEvolution={fitnessRank:ranked.indexOf(progressLeader)+1,progressGap:progressLeader.bestProgress-ranked[0].bestProgress,
        maxProgress:progressLeader.bestProgress,maxLaps:Math.max(...ranked.map(car=>car.laps)),
        steeringMean:ranked.reduce((n,car)=>n+Math.abs(car.outputs?.[0]||0),0)/ranked.length,
        brakeMean:ranked.reduce((n,car)=>n+(car.outputs?.[2]||0),0)/ranked.length,
        reasons:ranked.reduce((a,car)=>(a[car.reason||'n/a']=(a[car.reason||'n/a']||0)+1,a),{})};
      const result=original();this.postEvolution={practiceEvaluations:this.practiceEvaluations,
        practiceResults:this.practiceResults.map(({parentId,baseline,best,improved})=>({parentId,baselineProgress:baseline.progress,bestProgress:best.progress,baselineFitness:baseline.fitness,bestFitness:best.fitness,improved})),
        frontierOffspring:this.lastFrontierOffspringCount||0};return result;
    };
    const results=[],start=performance.now();
    for(let generationIndex=0;generationIndex<2;generationIndex++){
      const generation=sim.generation,started=performance.now();let ticks=0;
      while(sim.generation===generation&&ticks<14000){sim.tick();ticks++;}
      if(sim.generation===generation)sim.evolve();
      const row=sim.history.at(-1);assert.equal(row.generation,generation);
      results.push({generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgress:row.bestProgress,meanProgress:row.meanProgress,
        bestFitness:row.best,maxLaps:row.maxLaps,stagnation:row.stagnation,frontier:sim.preEvolution,optimizer:sim.postEvolution});
    }
    return {label,seed:state.seed,population:state.population,generationStart:state.generation,results,wallSeconds:(performance.now()-start)/1000};
  }
  const control=run(Control,'steering-focus-disabled'),treatment=run(F,'steering-focus-enabled');
  const report={format:'male-cns-steering-focus-saved-gen64-ab-v1',appVersion:'5.6.0',saveSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    validation:'Exact save checksum/version/schema and all five V3/Monza workers passed the official app validator; worker 0 alone was restored into two independent in-memory forks.',
    sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),method:'Control and treatment start from identical saved worker 0 state (generation64, 40 agents, seed7717). Same current source and strict-progress lineage in both; only the no-lap/stagnation steering-focus gate is disabled for control. Two actual generations are run per arm with real sensors, V3 policy, physics and rewards.',
    control,treatment,delta:treatment.results.map((row,i)=>({generation:row.generation,progress:row.bestProgress-control.results[i].bestProgress,laps:row.maxLaps-control.results[i].maxLaps,steeringFocusPracticeEvaluations:row.optimizer.practiceEvaluations-control.results[i].optimizer.practiceEvaluations})),
    boundary:'Original save remains read-only. This is a deterministic two-generation single-worker experiment, not a complete-lap or multi-seed proof.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({report:path.join(out,'report.json'),control,treatment,delta:report.delta},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
