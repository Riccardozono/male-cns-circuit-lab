'use strict';
// Paired, headless ablation of progress-frontier inheritance on the real V3 graph and Monza.
// Control runs the current engine with only the frontier-lineage branch disabled in memory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),simFile=path.join(root,'outputs/simulation.js'),out=path.join(root,'.impeccable/review/neural-sacl/frontier-lineage-ab-monza-v3');
const source=fs.readFileSync(simFile,'utf8'),needle='const progressExplorer=baseMutation>0&&progressLeader.bestProgress>winner.bestProgress+EVOLUTION_RULES.progressTieTolerance&&!parentPool.includes(progressLeader)?progressLeader:null;';
assert.ok(source.includes(needle),'Expected current frontier lineage implementation');
function loadAblation(){const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(source.replace(needle,'const progressExplorer=null;'),simFile);return m.exports;}
const Current=require('../outputs/simulation.js'),Control=loadAblation(),data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function run(F,seed){
  const sim=new F.Simulation(data,{population:16,mutation:.16,seed,circuits,circuitId:'monza'}),iterations=8,maxTicksPerGeneration=14000,history=[];
  for(let i=0;i<iterations;i++){
    const generation=sim.generation,started=performance.now();let ticks=0;
    while(sim.generation===generation&&ticks<maxTicksPerGeneration){sim.tick();ticks++;}
    if(sim.generation===generation)sim.evolve();
    const row=sim.history.at(-1);assert.equal(row.generation,generation);
    history.push({generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgress:row.bestProgress,meanProgress:row.meanProgress,
      laps:row.laps,maxLaps:row.maxLaps,fitnessWinner:row.best,stagnation:row.stagnation,immigrantCount:row.immigrantCount,
      frontierOffspringCount:sim.lastFrontierOffspringCount||0});
  }
  return {modelId:sim.modelId,seed,population:sim.population,circuitId:sim.circuitId,history,
    maxProgress:Math.max(...history.map(row=>row.bestProgress)),totalLaps:history.reduce((n,row)=>n+row.laps,0),
    firstLapGeneration:history.find(row=>row.maxLaps>0)?.generation??null,sourceConnectomeSha256:hash(fs.readFileSync(path.join(root,'outputs/data/connectome.json')))};
}
assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:false});
const seed=7717,started=performance.now(),control=run(Control,seed),frontier=run(Current,seed);
const comparison={seed,pairedGenerations:8,controlMaxProgress:control.maxProgress,frontierMaxProgress:frontier.maxProgress,
  maxProgressDelta:frontier.maxProgress-control.maxProgress,controlFirstLapGeneration:control.firstLapGeneration,frontierFirstLapGeneration:frontier.firstLapGeneration,
  controlHistory:control.history.map(row=>row.bestProgress),frontierHistory:frontier.history.map(row=>row.bestProgress)};
const report={passed:true,format:'male-cns-frontier-lineage-ablation-v1',createdAt:new Date().toISOString(),appVersion:require('../package.json').version,
  method:'Two sequential deterministic headless V3/Monza trials, same seed, 16 cars and 0.16 mutation. Control is the current source compiled in memory with only the progress-explorer branch disabled; treatment is current source. Each generation runs up to 14,000 real simulation ticks, matching the existing cold-start learning benchmark cap. This is a bounded ablation, not a full lap or two-lap claim.',
  sourceSha256:hash(Buffer.from(source)),connectomeSha256:control.sourceConnectomeSha256,control,frontier,comparison,wallSeconds:(performance.now()-started)/1000,
  boundary:'No control commands, routes, rewards, sensor data, mutations, saves or app source are fabricated or rewritten. The temporary control exists only in this Node process. A single seed is directional evidence, not statistical proof.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,comparison,wallSeconds:report.wallSeconds,report:path.join(out,'report.json')}));
