'use strict';
// Matched natural V3 generations: control vs convex blends between a safe
// frontier driver and a nearby, actually evaluated collision candidate.
// The experiment is injected into an in-memory module; production sources,
// published saves, and app version are never modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const input=path.join(base,'progress8-practice-fine-scale-continue2-rtx-20261029/checkpoint-0.private.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const originalSaveSha256='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(path.join(root,file))]));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(condition,message)=>{if(!condition)throw Error(message);};
const arg=name=>{const prefix=`--${name}=`;const item=process.argv.find(value=>value.startsWith(prefix));return item?.slice(prefix.length);};
const branch=arg('branch');
check(branch==='control'||branch==='blend','Use --branch=control or --branch=blend');
check(process.versions.node==='24.19.0','Pinned Node 24.19.0 is required');
const out=path.join(base,'progress8-safe-risky-weight-blend-ab-rtx-20261029',branch);
check(!fs.existsSync(out),'Refusing to overwrite an existing branch report');
const P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const circuits=require('../outputs/data/circuits.json'),connectome=require('../outputs/data/connectome.json');

function instrumentedSimulation(experiment){
  let source=fs.readFileSync(path.join(root,'outputs/simulation.js'),'utf8');
  if(experiment.branch==='blend'){
    const breedingMarker='       this.lastOptimizerSampleCount=optimizerSampleCount;';
    check(source.split(breedingMarker).length===2,'Breeding insertion point changed or is ambiguous');
    const breedingCode=`        const experimentBlendPlan=[];
        if(safeProgressLeader&&this.modelId==='v3'&&genomes.length===this.population){
          const blendDonor=eligible.filter(car=>!isSafeLearningOutcome(car)&&!car.censored&&!car.overlap&&car.genome?.policyWeights&&
            (car.reason==='urto'||car.reason==='collision')&&!(Number(car.rewardBreakdown?.penalties?.offTrack)>0)&&!(Number(car.rewardBreakdown?.penalties?.invalid)>0)&&
            car.bestProgress>safeProgressLeader.bestProgress+safeProgressTolerance&&car.bestProgress<=safeProgressLeader.bestProgress+riskRepairWindow)
            .sort((a,b)=>b.bestProgress-a.bestProgress||compareAgents(a,b))[0]||null;
          const safeWeights=safeProgressLeader.genome.policyWeights,donorWeights=blendDonor?.genome?.policyWeights;
          if(blendDonor&&Array.isArray(safeWeights)&&Array.isArray(donorWeights)&&safeWeights.length===donorWeights.length){
            const alphas=[.1,.2,.35,.5],slots=Math.min(alphas.length,Math.max(0,this.population-immigrantCount));
            const first=this.population-immigrantCount-slots;
            const replaced=new Set();
            for(let n=0;n<slots;n++){
              const index=first+n,alpha=alphas[n],child=cloneGenome(safeProgressLeader.genome);
              child.policyWeights=safeWeights.map((weight,j)=>weight+alpha*(donorWeights[j]-weight));
              if(!child.policyWeights.every(Number.isFinite))throw Error('Non-finite interpolated policy');
              genomes[index]=child;replaced.add(index);
              experimentBlendPlan.push({index,alpha,safeParentId:safeProgressLeader.id,unsafeDonorId:blendDonor.id,
                safeParentProgressM:safeProgressLeader.bestProgress/(this.track.pixelsPerMeter||1),unsafeDonorProgressM:blendDonor.bestProgress/(this.track.pixelsPerMeter||1),
                donorReason:blendDonor.reason,weightCount:child.policyWeights.length});
            }
            for(let i=optimizerSampleIdsForNext.length-1;i>=0;i--)if(replaced.has(optimizerSampleIdsForNext[i]))optimizerSampleIdsForNext.splice(i,1);
          }
        }
`;
    source=source.replace(breedingMarker,breedingCode+breedingMarker);
    const spawnMarker='this.generation++;this.spawn(genomes,false,optimizerSampleIdsForNext);';
    check(source.split(spawnMarker).length===2,'Spawn insertion point changed or is ambiguous');
    const spawnCode=`this.generation++;this.spawn(genomes,false,optimizerSampleIdsForNext);
        this.experimentBlendTargets=experimentBlendPlan.map(target=>({...target,carId:this.cars[target.index]?.id,generation:this.generation}));
        for(const target of this.experimentBlendTargets){const car=this.cars[target.index];if(car)car.experimentBlend={alpha:target.alpha,safeParentId:target.safeParentId,unsafeDonorId:target.unsafeDonorId};}`;
    source=source.replace(spawnMarker,spawnCode);
  }
  const simulatedModule={exports:{}};
  const mappedRequire=id=>id.startsWith('.')?require(path.resolve(root,'outputs',id)):require(id);
  new Function('module','exports','require',source)(simulatedModule,simulatedModule.exports,mappedRequire);
  return simulatedModule.exports;
}

async function main(){
  check(fs.existsSync(input)&&sha(original)===originalSaveSha256,'Research checkpoint or user save verification failed');
  const cp=JSON.parse(fs.readFileSync(input,'utf8'));
  check(cp.state.generation===95&&cp.state.population===40&&cp.state.seed===7717&&cp.state.circuitId==='monza'&&cp.state.rewardRevision==='progress-7-moving-pace','Unexpected starting checkpoint');
  const before=sourceHashes();
  const F=instrumentedSimulation({branch});
  check(typeof F.Simulation==='function'&&typeof F.isSafeLearningOutcome==='function','Simulation module failed to load');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(connectome)),{population:40,modelId:'v3',circuitId:'monza',circuits,seed:cp.state.seed});
  P.restore(sim,structuredClone(cp.state));
  check(hash(P.capture(sim))===hash(cp.state),'Checkpoint did not round-trip exactly');
  P.validateTraining(P.capture(sim),sim.graph,sim.circuits);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.mkdirSync(out,{recursive:false});
  const settings={branch,model:'V3',circuit:'Monza',seed:cp.state.seed,population:cp.state.population,startGeneration:cp.state.generation,generations:4,
    intervention:branch==='blend'?'At each completed generation, replace four ordinary non-immigrant offspring with convex policy-weight blends at alpha 0.10, 0.20, 0.35, 0.50 between the generation safe-progress leader and the nearest-to-frontier eligible collision candidate. Both parents were evaluated with the real V3 controller, sensors and physics. No route/action teacher.':'Natural current V3 evolution from the identical checkpoint; no intervention.',
    backend:'private exact V3 CUDA kernel',checkpointSha256:sha(input),originalSaveSha256,sourceHashes:before};
  fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-v3-safe-risky-policy-blend-ab-v1',settings,
    boundary:'One matched research branch from one checkpoint, seed and circuit. In-memory instrumentation only. Not an app save, migration, build, or release.'},null,2)+'\n',{flag:'wx'});
  sim.running=true;
  let terminal=new Map(),ticksInGeneration=0,started=Date.now(),lastLog=started;const rows=[];
  sim.onTrialTick=s=>{
    const ppm=s.track.pixelsPerMeter||1;
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason,
      safe:F.isSafeLearningOutcome(car),fitness:car.fitness,brake:car.outputs?.[2]??null,steering:car.outputs?.[0]??null,
      experimentBlend:car.experimentBlend?{...car.experimentBlend}:null});
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('V3_BLEND_AB_PROGRESS '+JSON.stringify({branch,generation:s.generation,alive:s.cars.filter(car=>car.alive).length,
      bestM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  const oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    while(rows.length<4){
      const completedGeneration=sim.generation;sim.tick();ticksInGeneration++;
      if(sim.generation!==completedGeneration){
        check(terminal.size===40,`Generation ${completedGeneration}: terminal census ${terminal.size}/40`);
        const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(item=>item.safe);
        const issuedBlends=structuredClone(sim.experimentBlendTargets||[]);
        const safeFrontier=sim.safeLearningFrontier?.progress??sim.learningFrontier?.progress??null;
        const row={completedGeneration,nextGeneration:sim.generation,ticks:ticksInGeneration,safeCount:safe.length,
          collisionCount:outcomes.filter(item=>item.reason==='urto'||item.reason==='collision').length,
          bestSafeProgressM:safe.length?Math.max(...safe.map(item=>item.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(item=>item.laps)):0,
          safeAtLeast700M:safe.filter(item=>item.progressM>=700).length,safeFrontierM:Number.isFinite(safeFrontier)?safeFrontier/(sim.track.pixelsPerMeter||1):safeFrontier,
          issuedBlends,blendOutcomes:outcomes.filter(item=>item.experimentBlend),outcomes};
        rows.push(row);
        const saved={format:'private-v3-safe-risky-policy-blend-checkpoint-v1',settings,sourceHashes:before,completedGenerations:rows.length,
          lastGeneration:completedGeneration,nextGeneration:sim.generation,workerIndex:cp.workerIndex,state:P.capture(sim),rows:rows.map(({outcomes,...small})=>small)};
        P.validateTraining(saved.state,sim.graph,sim.circuits);
        const cpFile=path.join(out,`checkpoint-${rows.length%2}.private.json`);fs.writeFileSync(cpFile,JSON.stringify(saved)+'\n');
        const short={branch,generation:completedGeneration,nextGeneration:sim.generation,safe:safe.length,collisions:row.collisionCount,
          bestSafeProgressM:row.bestSafeProgressM,safeFrontierM:row.safeFrontierM,laps:row.maxSafeLaps,
          issuedBlends:issuedBlends.length,observedBlendOutcomes:row.blendOutcomes.length,gpuCalls:Cuda.stats().gpuCalls,
          checkpointSha256:sha(cpFile),wallSeconds:(Date.now()-started)/1000};
        fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');console.log('V3_BLEND_AB_GENERATION '+JSON.stringify(short));
        terminal=new Map();ticksInGeneration=0;
      }
      if(ticksInGeneration>=60000)throw Error('Generation tick guard exceeded; last private checkpoint is preserved');
    }
    sim.running=false;const gpu=Cuda.stats(),after=sourceHashes();
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA RTX 4060 or zero CPU fallback was not confirmed');
    check(JSON.stringify(before)===JSON.stringify(after)&&sha(input)===settings.checkpointSha256&&sha(original)===originalSaveSha256,'Source, checkpoint, or user save changed');
    const report={passed:true,learningSucceeded:rows.some(row=>row.maxSafeLaps>=2),approvedForApp:false,settings,checkpointSha256:settings.checkpointSha256,
      originalSaveSha256,sourceHashes:{before,after},gpu,rows,
      boundary:'Four natural full generations from the exact same research checkpoint are run independently for each A/B branch. A single seed and Monza do not establish generalization. No policy is promoted to the app.'};
    const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('V3_BLEND_AB_REPORT '+JSON.stringify({branch,report:reportPath,sha256:sha(reportPath),generations:rows.length,
      safeCounts:rows.map(row=>row.safeCount),frontier:rows.map(row=>row.safeFrontierM),safeProgress:rows.map(row=>row.bestSafeProgressM),
      laps:rows.map(row=>row.maxSafeLaps),issuedBlendCounts:rows.map(row=>row.issuedBlends.length),blendOutcomes:rows.map(row=>row.blendOutcomes.length),gpu}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(error=>{console.error('V3_BLEND_AB_FAILED '+(error.stack||error));process.exitCode=1;});
