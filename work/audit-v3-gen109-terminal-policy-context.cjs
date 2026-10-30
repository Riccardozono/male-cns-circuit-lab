'use strict';
// One-generation, read-only diagnostic of the saved V3/Monza gen.109 policy
// experience. It checks which learned context is nearest the final neural
// feature vector of each ended car; it does not alter rewards or offspring.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save');
const out=path.resolve(process.env.MALECNS_V3_CONTEXT_AUDIT_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/audit-v3-gen109-terminal-policy-context-20261022-01'));
const P=require(path.join(root,'outputs/progress-save.js')),F=require(path.join(root,'outputs/simulation.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/dense-neural.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function summarize(car,ppm){
  const brain=car.brain,features=brain?.policyFeatures,experience=brain?.policyExperience,centres=experience?.centres||[];
  let nearestIndex=null,nearestDistance=Infinity;
  if(features&&typeof features.length==='number')for(let index=0;index<centres.length;index++){
    const centre=centres[index];if(!centre.values||centre.values.length!==features.length)continue;
    let distance=0;for(let i=0;i<features.length;i++)distance+=(features[i]-centre.values[i])**2;distance/=Math.max(1,features.length);
    if(distance<nearestDistance){nearestDistance=distance;nearestIndex=index;}
  }
  const nearest=nearestIndex===null?null:centres[nearestIndex],topCount=centres.length?Math.max(...centres.map(c=>c.count||0)):null;
  return {id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car),
    speedMps:car.vehicle?.speedMps??car.speed??null,outputs:Array.isArray(car.outputs)?car.outputs.slice(0,3):null,
    featureType:features?.constructor?.name??null,featureCount:features?.length??null,experienceSamples:experience?.samples??null,
    centreCount:centres.length,topCentreCount:topCount,nearestCentreIndex:nearestIndex,nearestCentreCount:nearest?.count??null,
    nearestCentreIsMostFrequent:Boolean(nearest&&nearest.count===topCount),nearestCentreDistance:Number.isFinite(nearestDistance)?nearestDistance:null};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing diagnostic output: ${out}`);
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected exact V3/Monza gen.109 research checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json')),
    beforeSources=sourceHashes(),sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(state));sim.running=true;
  const first=sim.generation,started=performance.now(),terminal=new Map();let ticks=0,lastLog=started;const originalDenseStep=Dense.step;
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,summarize(car,s.track.pixelsPerMeter||1));
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('TERMINAL_CONTEXT_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size}));}
  };
  let gpu;
  try{Dense.step=(...args)=>Cuda.pass(...args);while(sim.generation===first){if(ticks>=60000)throw Error('Generation watchdog');sim.tick();ticks++;}gpu=Cuda.stats();}
  finally{Dense.step=originalDenseStep;Cuda.close();sim.running=false;}
  const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.fitness-b.fitness)[0]||null,
    sourceAfter=sourceHashes(),sourcesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(sourceAfter),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
    passed=Boolean(outcomes.length===state.population&&leader&&Math.abs(leader.progressM-801.0911972780737)<1e-6&&saveUnchanged&&sourcesUnchanged&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0),
    report={format:'male-cns-v3-gen109-terminal-policy-context-audit-v1',appVersion:'5.6.0',passed,learningSucceeded:false,
      checkpoint:{path:savePath,sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:109,seed:7717,population:100,rewardRevision:state.rewardRevision},
      method:'Replay exactly one natural generation from the saved checkpoint, capture each ended car before evolve(), and compare its current Float64Array policyFeatures to the nearest stored policyExperience centre. No candidate, reward, action, physics, or source mutation.',
      replay:{generation:first,ticks,census:outcomes.length,safeAgentCount:safe.length,leader,leaderCentres:leader?safe.find(x=>x.id===leader.id):null},
      sourceHashes:{before:beforeSources,after:sourceAfter,unchanged:sourcesUnchanged},cuda:gpu,wallSeconds:(performance.now()-started)/1000,
      boundary:'One V3/Monza seed and one saved generation. The closest experience centre is an observed neural context, not proof that changing it improves learning. This is diagnostic only; no application source, user save, version, release, tag, portable or installer is modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('TERMINAL_CONTEXT_RESULT '+JSON.stringify({passed,leader,leaderCentres:report.replay.leaderCentres,cuda:gpu,report:path.join(out,'report.json')}));
  if(!passed)throw Error('Reference replay, file integrity, or GPU-only validation failed; report preserved');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
