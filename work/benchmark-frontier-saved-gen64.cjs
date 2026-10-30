'use strict';
// Read-only, in-memory fork of worker 0 from the user's exact V3/Monza save.
// It never writes to or replaces the supplied save.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),savePath=process.argv[2]||'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const source=fs.readFileSync(path.join(root,'outputs/simulation.js'),'utf8');
const needle='const progressExplorer=baseMutation>0&&progressLeader.bestProgress>winner.bestProgress+EVOLUTION_RULES.progressTieTolerance&&!reproductionPool.includes(progressLeader)?progressLeader:null;';
assert.ok(source.includes(needle),'Current frontier branch was not found');
function loadControl(){const filename=path.join(root,'outputs/simulation.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source.replace(needle,'const progressExplorer=null;'),filename);return m.exports;}
const F=require('../outputs/simulation.js'),Control=loadControl(),Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js');
const raw=fs.readFileSync(savePath,'utf8'),file=JSON.parse(raw),data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
const descriptor=new F.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});
async function main(){
  const verified=await Progress.decode(raw,'5.6.0');
  const payload=Progress.validatePayload(verified.payload,{graph:descriptor.graph,circuits:descriptor.circuits});
  assert.equal(payload.modelId,'v3');assert.equal(payload.circuitId,'monza');assert.equal(payload.workers.length,5);
  function run(Engine,state,label,workerIndex){
    const sim=new Engine.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});
    Progress.restore(sim,state);assert.equal(sim.generation,state.generation);assert.equal(sim.population,state.population);assert.equal(sim.running,false);
    const original=sim.evolve.bind(sim);sim.evolve=function(){
      const eligible=this.cars.filter(car=>!car.diagnosticVehicle),ranked=eligible.slice().sort(Engine.compareAgents);
      const progressLeader=eligible.slice().sort((a,b)=>b.bestProgress-a.bestProgress||Engine.compareAgents(a,b))[0],winner=ranked[0];
      const poolCount=this.optimizer&&winner.genome.policyWeights?Math.min(ranked.length,Engine.EVOLUTION_RULES.eliteCount):Math.max(2,Math.min(ranked.length,Math.ceil(ranked.length*(this.stagnation>=1?Engine.EVOLUTION_RULES.parentPoolFraction:.35))));
      this.branchDiagnostic={fitnessRank:ranked.indexOf(progressLeader)+1,gap:progressLeader.bestProgress-winner.bestProgress,
        progress:progressLeader.bestProgress,winnerProgress:winner.bestProgress,insideMutationParents:ranked.indexOf(progressLeader)<poolCount};
      return original();
    };
    const start=performance.now(),generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks<14000){sim.tick();ticks++;}
    if(sim.generation===generation)sim.evolve();
    const row=sim.history.at(-1);
    return {label,workerIndex,ticks,wallSeconds:(performance.now()-start)/1000,bestProgress:row.bestProgress,meanProgress:row.meanProgress,
      bestFitness:row.best,laps:row.laps,maxLaps:row.maxLaps,offspring:sim.lastFrontierOffspringCount||0,candidate:sim.branchDiagnostic};
  }
  const workers=[];
  for(let i=0;i<payload.workers.length;i++){
    const state=payload.workers[i].state;assert.equal(state.population,40);
    const control=run(Control,state,'branch-disabled',i),treatment=run(F,state,'current',i);
    workers.push({workerIndex:i,seed:state.seed,frontier:{progress:state.learningFrontier.progress,laps:state.learningFrontier.laps},control,treatment,
      delta:{progress:treatment.bestProgress-control.bestProgress,laps:treatment.maxLaps-control.maxLaps,offspring:treatment.offspring-control.offspring}});
  }
  const report={format:'male-cns-saved-gen64-frontier-ab-v1',appVersion:'5.6.0',saveSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    compatibility:'Decode checksum, exact app version, V3 graph, Monza circuit revision, physics revision and every worker/population passed the app save validator. Each worker was restored into ephemeral in-memory copies; original file is read-only.',
    sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),save:{modelId:payload.modelId,circuitId:payload.circuitId,workerCount:payload.workers.length,workers:payload.workers.map(({index,state})=>({index,generation:state.generation,population:state.population,frontierProgress:state.learningFrontier.progress,laps:state.learningFrontier.laps}))},
    workers,boundary:'One next-generation fork per saved worker. Not training convergence, not a complete-lap proof, and not evidence across all seeds.'};
  console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
