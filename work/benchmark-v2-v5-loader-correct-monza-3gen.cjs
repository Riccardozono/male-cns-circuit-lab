'use strict';
// Cold-start cross-model learning check using the exact profile loaders used
// by outputs/app.js. Headless CPU reference only; no save or production file is written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/v2-v5-loader-correct-monza-3gen-20261022-01');
const F=require(path.join(root,'outputs/simulation.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  Profiles=require(path.join(root,'outputs/model-profiles.js'));
const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  metadata=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome-full.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json')),
  types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array},
  fullBytes=fs.readFileSync(path.join(root,'outputs/data',metadata.binary)),
  fullBuffer=fullBytes.buffer.slice(fullBytes.byteOffset,fullBytes.byteOffset+fullBytes.byteLength),full={...metadata,compact:true};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fullBytes.length!==metadata.binaryBytes||hash(fullBytes)!==metadata.binarySha256)throw Error('Full connectome checksum/size mismatch');
for(const [name,d]of Object.entries(metadata.arrays)){const T=types[d.dtype];if(!T)throw Error(`Unknown array type ${d.dtype}`);full[name]=new T(fullBuffer,d.offset,d.length);}
const modelData={v2:Legacy.buildV2(source),v3:Legacy.tagV3(source),v4:full,v5:Profiles.buildV5(full)},
  expected={v2:{nodes:1121,edges:32351},v3:{nodes:7721,edges:242486},v4:{nodes:166700,edges:6242118},v5:{nodes:166700,edges:6242118}},
  settings={circuit:'monza',seed:7717,population:16,mutation:.16,naturalGenerations:3,rewardRevision:F.Rewards.REVISION,maxTicksPerGeneration:120000};
function summarize(car,ppm){return {id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason||'',safe:F.isSafeLearningOutcome(car),
  fitness:car.fitness,bestLapTime:Number.isFinite(car.bestLapTime)?car.bestLapTime:null,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0};}
function summarizeGeneration(cars,sim,ticks){
  const ppm=sim.track.pixelsPerMeter||1,rows=cars.map(car=>summarize(car,ppm)),safe=rows.filter(car=>car.safe).sort((a,b)=>b.progressM-a.progressM||b.fitness-a.fitness),
    raw=rows.slice().sort((a,b)=>b.progressM-a.progressM||b.fitness-a.fitness),reasons={};
  for(const car of rows)reasons[car.reason]=(reasons[car.reason]||0)+1;
  return {generation:sim.history.at(-1)?.generation??sim.generation-1,ticks,bestProgressM:Math.max(...rows.map(car=>car.progressM)),
    meanProgressM:rows.reduce((sum,car)=>sum+car.progressM,0)/rows.length,maxLaps:Math.max(...rows.map(car=>car.laps)),
    oneLapAgents:rows.filter(car=>car.laps>=1).length,twoLapAgents:rows.filter(car=>car.laps>=2).length,safeCount:safe.length,
    safeLeader:safe[0]||null,rawLeader:raw[0]||null,reasonCounts:reasons};
}
async function runModel(modelId){
  const data=modelData[modelId],sim=new F.Simulation(data,{modelId,population:settings.population,circuitId:settings.circuit,circuits,
    seed:settings.seed,mutation:settings.mutation,learningEnabled:true}),expectedModel=expected[modelId];
  if(sim.graph.n!==expectedModel.nodes||sim.graph.edgeCount!==expectedModel.edges)throw Error(`${modelId}: profile loader mismatch (${sim.graph.n}/${sim.graph.edgeCount})`);
  const caseResult={modelId,modelLabel:sim.modelLabel||modelId,graph:{nodes:sim.graph.n,edges:sim.graph.edgeCount,full:!!sim.graph.full,
    slotBudget:sim.graph.solver?.activeNeuronBudget??null,passes:sim.graph.solver?.iterationsPerControlTick??null,
    readoutNeurons:sim.graph.learning?.nodes.length??null},generations:[],completed:false,error:null};
  let finalCars=null,lastLog=Date.now();
  sim.onTrialTick=s=>{if(s.cars.every(car=>!car.alive))finalCars=s.cars.map(car=>({...car}));};
  try{
    for(let index=0;index<settings.naturalGenerations;index++){
      const generation=sim.generation,start=Date.now();let ticks=0;
      while(sim.generation===generation&&ticks++<settings.maxTicksPerGeneration){
        sim.tick();
        if(Date.now()-lastLog>=15000){lastLog=Date.now();console.log('MODEL_BENCH_PROGRESS '+JSON.stringify({modelId,generation,
          alive:sim.cars.filter(car=>car.alive).length,ticks,bestProgressM:Math.max(...sim.cars.map(car=>car.bestProgress))/(sim.track.pixelsPerMeter||1)}));}
      }
      if(sim.generation===generation)throw Error(`natural generation guard reached at ${ticks} ticks; generation was not forced`);
      if(!finalCars||finalCars.length!==settings.population)throw Error('terminal generation telemetry missing');
      const summary=summarizeGeneration(finalCars,sim,ticks);summary.wallSeconds=Number(((Date.now()-start)/1000).toFixed(2));
      caseResult.generations.push(summary);finalCars=null;
      console.log('MODEL_BENCH_GENERATION '+JSON.stringify({modelId,...summary}));
    }
    caseResult.completed=caseResult.generations.length===settings.naturalGenerations;
  }catch(error){caseResult.error=String(error?.stack||error);}
  sim.running=false;return caseResult;
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing benchmark report');
  const sourceHashes=Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','legacy-models.js','model-profiles.js','full-connectome-loader.js']
    .map(file=>[file,hash(fs.readFileSync(path.join(root,'outputs',file)))]));
  const results=[];for(const modelId of ['v2','v3','v4','v5'])results.push(await runModel(modelId));
  const report={format:'male-cns-cold-start-cross-model-monza-3gen-v1',passed:results.every(row=>row.completed),
    learningSucceeded:results.some(row=>row.generations.some(g=>g.twoLapAgents>0)),oneLapSucceeded:results.some(row=>row.generations.some(g=>g.oneLapAgents>0)),
    settings,execution:{kind:'headless CPU reference solver',node:process.versions.node,platform:process.platform,cpu:os.cpus()[0]?.model||'unknown',noWebGPU:true},
    dataset:{fullNodeCount:metadata.nodeCount,fullEdgeCount:metadata.edgeCount,binaryBytes:metadata.binaryBytes,binarySha256:metadata.binarySha256},
    sourceHashes,results,boundary:'Fresh independently seeded populations on Monza, using the app loader for each anatomical profile and natural generations. No route, target action, imported save, forced evolve, or application change. This checks short-horizon learning, not convergence or all-circuit generalization.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('MODEL_BENCH_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,oneLapSucceeded:report.oneLapSucceeded,
    results:results.map(r=>({modelId:r.modelId,graph:r.graph,completed:r.completed,generations:r.generations.map(g=>({generation:g.generation,
      bestProgressM:g.bestProgressM,maxLaps:g.maxLaps,oneLapAgents:g.oneLapAgents,twoLapAgents:g.twoLapAgents,safeCount:g.safeCount})),error:r.error})),
    report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
