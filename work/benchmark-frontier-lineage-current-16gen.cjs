'use strict';
// Evaluate the corrected reproduction-pool criterion against the previous
// deterministic control, whose old frontier branch never activated.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/frontier-lineage-strict-progress-current-v3-17gen');
const priorPath=path.join(root,'.impeccable/review/neural-sacl/frontier-lineage-ab-monza-v3-long-16gen/report.json');
assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:false});
const prior=JSON.parse(fs.readFileSync(priorPath,'utf8'));
assert.equal(prior.control.seed,7717);assert.equal(prior.control.history.length,16);assert.equal(prior.frontier.history.reduce((n,row)=>n+row.frontierOffspringCount,0),0);
assert.deepEqual(prior.control.history.map(row=>row.bestProgress),prior.frontier.history.map(row=>row.bestProgress),'old control and treatment should be identical because old branch never activated');
const F=require('../outputs/simulation.js'),data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function run(seed){
  const sim=new F.Simulation(data,{population:16,mutation:.16,seed,circuits,circuitId:'monza'}),iterations=17,maxTicksPerGeneration=14000,history=[];
  const originalEvolve=sim.evolve.bind(sim);
  sim.evolve=function(){
    const eligible=this.cars.filter(car=>!car.diagnosticVehicle),ranked=eligible.slice().sort(F.compareAgents);
    const progressLeader=eligible.slice().sort((a,b)=>b.bestProgress-a.bestProgress||F.compareAgents(a,b))[0],winner=ranked[0];
    const reproductionCount=this.optimizer&&winner.genome.policyWeights?Math.min(ranked.length,F.EVOLUTION_RULES.eliteCount):Math.max(2,Math.min(ranked.length,Math.ceil(ranked.length*(this.stagnation>=1?F.EVOLUTION_RULES.parentPoolFraction:.35))));
    this.lastFrontierCandidate={fitnessRank:ranked.indexOf(progressLeader)+1,progressGap:progressLeader.bestProgress-winner.bestProgress,
      progress:progressLeader.bestProgress,winnerProgress:winner.bestProgress,insideMutationParents:ranked.indexOf(progressLeader)<reproductionCount};
    return originalEvolve();
  };
  for(let i=0;i<iterations;i++){
    const generation=sim.generation,started=performance.now();let ticks=0;
    while(sim.generation===generation&&ticks<maxTicksPerGeneration){sim.tick();ticks++;}
    if(sim.generation===generation){
      sim.evolve();
    }
    const row=sim.history.at(-1);assert.equal(row.generation,generation);
    history.push({generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgress:row.bestProgress,
      meanProgress:row.meanProgress,laps:row.laps,maxLaps:row.maxLaps,fitnessWinner:row.best,stagnation:row.stagnation,immigrantCount:row.immigrantCount,
      frontierCandidate:sim.lastFrontierCandidate,frontierOffspringCount:sim.lastFrontierOffspringCount||0});
    if((i+1)%4===0)console.log(JSON.stringify({completed:i+1,bestProgress:row.bestProgress,maxLaps:row.maxLaps,frontierOffspringCount:sim.lastFrontierOffspringCount||0,fitnessRank:sim.lastFrontierCandidate.fitnessRank,gap:sim.lastFrontierCandidate.progressGap}));
  }
  return {modelId:sim.modelId,seed,population:sim.population,circuitId:sim.circuitId,history,maxProgress:Math.max(...history.map(row=>row.bestProgress)),
    totalLaps:history.reduce((n,row)=>n+row.laps,0),firstLapGeneration:history.find(row=>row.maxLaps>0)?.generation??null,
    frontierOffspring:history.reduce((n,row)=>n+row.frontierOffspringCount,0),sourceConnectomeSha256:hash(fs.readFileSync(path.join(root,'outputs/data/connectome.json')))};
}
const seed=7717,started=performance.now(),treatment=run(seed),control=prior.control;
assert.equal(treatment.sourceConnectomeSha256,control.sourceConnectomeSha256);
const comparison={seed,pairedGenerations:16,controlMaxProgress:control.maxProgress,treatmentMaxProgress:treatment.maxProgress,
  maxProgressDelta:treatment.maxProgress-control.maxProgress,controlFirstLapGeneration:control.firstLapGeneration,treatmentFirstLapGeneration:treatment.firstLapGeneration,
  controlOffspring:0,treatmentOffspring:treatment.frontierOffspring,controlHistory:control.history.map(row=>row.bestProgress),treatmentHistory:treatment.history.map(row=>row.bestProgress)};
const report={passed:true,format:'male-cns-frontier-lineage-reproduction-parent-current-v1',createdAt:new Date().toISOString(),appVersion:require('../package.json').version,
  method:'Current source runs 17 deterministic cold-start generations at V3/Monza, seed7717, 16 agents and .16 mutation. Compared against a prior same-seed 16-generation no-branch control; its control and treatment were bit-for-bit identical because the old branch produced zero offspring. Generations through the first frontier branch are therefore same-seed comparisons; generation17 evaluates the new frontier offspring.',
  sourceSha256:hash(fs.readFileSync(path.join(root,'outputs/simulation.js'))),connectomeSha256:treatment.sourceConnectomeSha256,control,treatment,comparison,wallSeconds:(performance.now()-started)/1000,
  boundary:'Real simulator with no imported save, scripted route, teacher, fabricated controls, or reward changes. One deterministic seed is directional only and cannot establish two-lap learning.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,comparison,wallSeconds:report.wallSeconds,report:path.join(out,'report.json')}));
