'use strict';
// Matched V3 A/B: preserve the safe parent's sensor pathway and steering
// action head while gradually mixing only the longitudinal (gas/brake) head
// from a nearby actually evaluated collision candidate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const input=path.join(base,'progress8-practice-fine-scale-continue2-rtx-20261029/checkpoint-0.private.json');
const controlReport=path.join(base,'progress8-safe-risky-weight-blend-ab-rtx-20261029/control/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const originalSaveSha256='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const out=path.join(base,'progress8-longitudinal-head-fine-transfer-ab-rtx-20261029-retry/treatment');
const alphas=[.05,.1,.15,.2],generations=2;
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(path.join(root,file))]));
const check=(condition,message)=>{if(!condition)throw Error(message);};

function instrumentSimulation(){
  let source=fs.readFileSync(path.join(root,'outputs/simulation.js'),'utf8');
  const breedingMarker='       this.lastOptimizerSampleCount=optimizerSampleCount;';
  check(source.split(breedingMarker).length===2,'Breeding insertion point changed or ambiguous');
  const breedingCode=`        const longitudinalTransferPlan=[];
        if(safeProgressLeader&&this.modelId==='v3'&&genomes.length===this.population){
          const transferDonor=eligible.filter(car=>!isSafeLearningOutcome(car)&&!car.censored&&!car.overlap&&car.genome?.policyWeights&&
            (car.reason==='urto'||car.reason==='collision')&&!(Number(car.rewardBreakdown?.penalties?.offTrack)>0)&&!(Number(car.rewardBreakdown?.penalties?.invalid)>0)&&
            car.bestProgress>safeProgressLeader.bestProgress+safeProgressTolerance&&car.bestProgress<=safeProgressLeader.bestProgress+riskRepairWindow)
            .sort((a,b)=>b.bestProgress-a.bestProgress||compareAgents(a,b))[0]||null;
          const safeWeights=safeProgressLeader.genome.policyWeights,donorWeights=transferDonor?.genome?.policyWeights,policy=ensureLearning(this.graph);
          if(transferDonor&&Array.isArray(safeWeights)&&Array.isArray(donorWeights)&&safeWeights.length===donorWeights.length){
            const localAlphas=${JSON.stringify(alphas)},slots=Math.min(localAlphas.length,Math.max(0,this.population-immigrantCount));
            const first=this.population-immigrantCount-slots,replaced=new Set(),stride=policy.readoutStride??2,biasOffset=policy.biasOffset??safeWeights.length-(policy.actionCount??2);
            for(let n=0;n<slots;n++){
              const index=first+n,alpha=localAlphas[n],child=cloneGenome(safeProgressLeader.genome);
              for(let feature=0;feature<policy.nodes.length;feature++){
                const weightIndex=policy.readoutOffset+feature*stride+1;
                child.policyWeights[weightIndex]=safeWeights[weightIndex]+alpha*(donorWeights[weightIndex]-safeWeights[weightIndex]);
              }
              const longitudinalBias=biasOffset+1;
              child.policyWeights[longitudinalBias]=safeWeights[longitudinalBias]+alpha*(donorWeights[longitudinalBias]-safeWeights[longitudinalBias]);
              if(!child.policyWeights.every(Number.isFinite))throw Error('Non-finite longitudinal-head candidate');
              genomes[index]=child;replaced.add(index);
              longitudinalTransferPlan.push({index,alpha,safeParentId:safeProgressLeader.id,unsafeDonorId:transferDonor.id,
                safeParentProgressM:safeProgressLeader.bestProgress/(this.track.pixelsPerMeter||1),unsafeDonorProgressM:transferDonor.bestProgress/(this.track.pixelsPerMeter||1),
                donorReason:transferDonor.reason,transferredReadoutWeights:policy.nodes.length+1,steeringWeightsCopiedFrom:'safe-parent'});
            }
            for(let i=optimizerSampleIdsForNext.length-1;i>=0;i--)if(replaced.has(optimizerSampleIdsForNext[i]))optimizerSampleIdsForNext.splice(i,1);
          }
        }
`;
  source=source.replace(breedingMarker,breedingCode+breedingMarker);
  const spawnMarker='this.generation++;this.spawn(genomes,false,optimizerSampleIdsForNext);';
  check(source.split(spawnMarker).length===2,'Spawn insertion point changed or ambiguous');
  const spawnCode=`this.generation++;this.spawn(genomes,false,optimizerSampleIdsForNext);
        this.experimentBlendTargets=longitudinalTransferPlan.map(target=>({...target,carId:this.cars[target.index]?.id,generation:this.generation}));
        for(const target of this.experimentBlendTargets){const car=this.cars[target.index];if(car)car.experimentBlend={alpha:target.alpha,safeParentId:target.safeParentId,unsafeDonorId:target.unsafeDonorId};}`;
  source=source.replace(spawnMarker,spawnCode);
  const simulatedModule={exports:{}};
  const mappedRequire=id=>id.startsWith('.')?require(path.resolve(root,'outputs',id)):require(id);
  new Function('module','exports','require',source)(simulatedModule,simulatedModule.exports,mappedRequire);
  return simulatedModule.exports;
}

async function main(){
  check(process.versions.node==='24.19.0','Pinned Node 24.19.0 is required');
  check(fs.existsSync(input)&&fs.existsSync(controlReport)&&sha(original)===originalSaveSha256,'Checkpoint, control report or user-save verification failed');
  check(!fs.existsSync(out),'Refusing to overwrite an existing run');
  const cp=JSON.parse(fs.readFileSync(input,'utf8')),control=JSON.parse(fs.readFileSync(controlReport,'utf8'));
  check(cp.state.generation===95&&cp.state.population===40&&cp.state.seed===7717&&cp.state.circuitId==='monza','Unexpected starting checkpoint');
  check(control.passed&&control.checkpointSha256===sha(input)&&control.settings.startGeneration===cp.state.generation,'Control does not match treatment checkpoint');
  const before=sourceHashes(),F=instrumentSimulation();
  check(typeof F.Simulation==='function'&&typeof F.isSafeLearningOutcome==='function','Instrumented simulation did not load');
  const P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
  const circuits=require('../outputs/data/circuits.json'),connectome=require('../outputs/data/connectome.json');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(connectome)),{population:40,modelId:'v3',circuitId:'monza',circuits,seed:cp.state.seed});
  P.restore(sim,structuredClone(cp.state));check(hash(P.capture(sim))===hash(cp.state),'Checkpoint did not round-trip exactly');P.validateTraining(P.capture(sim),sim.graph,sim.circuits);
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out,{recursive:false});
  const settings={model:'V3',circuit:'Monza',seed:cp.state.seed,population:cp.state.population,startGeneration:cp.state.generation,generations,alphas,
    intervention:`Four offspring per generation retain the safe parent sensor pathway and complete steering readout; only the longitudinal readout (gas/brake) is blended from the nearest eligible evaluated collision candidate at alpha ${alphas.join(', ')}.`,
    actionHeadLayout:'Two decoded heads: steering and signed longitudinal command; positive longitudinal output is gas, negative is brake.',backend:'private exact V3 CUDA kernel',
    checkpointSha256:sha(input),controlReportSha256:sha(controlReport),originalSaveSha256,sourceHashes:before,
    boundary:'In-memory full-generation experiment. Real V3 controller, sensors, physics and circuit. Single seed; no route/action teacher; no app changes or policy promotion.'};
  fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-v3-longitudinal-head-transfer-ab-v1',settings},null,2)+'\n',{flag:'wx'});
  sim.running=true;let terminal=new Map(),ticks=0,started=Date.now(),lastLog=started;const rows=[];
  sim.onTrialTick=s=>{
    const ppm=s.track.pixelsPerMeter||1;
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason,
      safe:F.isSafeLearningOutcome(car),fitness:car.fitness,steering:car.outputs?.[0]??null,gas:car.outputs?.[1]??null,brake:car.outputs?.[2]??null,
      experimentBlend:car.experimentBlend?{...car.experimentBlend}:null});
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('V3_LONG_HEAD_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(car=>car.alive).length,
      bestM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  const oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    while(rows.length<generations){
      const completedGeneration=sim.generation;sim.tick();ticks++;
      if(sim.generation!==completedGeneration){
        check(terminal.size===40,`Generation ${completedGeneration}: terminal census ${terminal.size}/40`);
        const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(item=>item.safe);
        const issuedTransfers=structuredClone(sim.experimentBlendTargets||[]),frontier=sim.safeLearningFrontier?.progress??sim.learningFrontier?.progress??null;
        const row={completedGeneration,nextGeneration:sim.generation,ticks,safeCount:safe.length,
          collisionCount:outcomes.filter(item=>item.reason==='urto'||item.reason==='collision').length,
          bestSafeProgressM:safe.length?Math.max(...safe.map(item=>item.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(item=>item.laps)):0,
          safeAtLeast700M:safe.filter(item=>item.progressM>=700).length,safeFrontierM:Number.isFinite(frontier)?frontier/(sim.track.pixelsPerMeter||1):frontier,
          issuedTransfers,transferOutcomes:outcomes.filter(item=>item.experimentBlend),outcomes};
        rows.push(row);const saved={format:'private-v3-longitudinal-head-transfer-checkpoint-v1',settings,sourceHashes:before,
          completedGenerations:rows.length,lastGeneration:completedGeneration,nextGeneration:sim.generation,workerIndex:cp.workerIndex,state:P.capture(sim),rows:rows.map(({outcomes,...small})=>small)};
        P.validateTraining(saved.state,sim.graph,sim.circuits);const cpFile=path.join(out,`checkpoint-${rows.length%2}.private.json`);
        fs.writeFileSync(cpFile,JSON.stringify(saved)+'\n');const short={generation:completedGeneration,nextGeneration:sim.generation,safe:safe.length,
          collisions:row.collisionCount,bestSafeProgressM:row.bestSafeProgressM,safeFrontierM:row.safeFrontierM,laps:row.maxSafeLaps,
          issuedTransfers:issuedTransfers.length,observedTransferOutcomes:row.transferOutcomes.length,gpuCalls:Cuda.stats().gpuCalls,
          checkpointSha256:sha(cpFile),wallSeconds:(Date.now()-started)/1000};
        fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');console.log('V3_LONG_HEAD_GENERATION '+JSON.stringify(short));
        terminal=new Map();ticks=0;
      }
      if(ticks>=60000)throw Error('Generation tick guard exceeded; last private checkpoint is preserved');
    }
    sim.running=false;const gpu=Cuda.stats(),after=sourceHashes();
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'RTX 4060 or zero CPU fallback was not confirmed');
    check(JSON.stringify(before)===JSON.stringify(after)&&sha(input)===settings.checkpointSha256&&sha(original)===originalSaveSha256,'Source, checkpoint or user save changed');
    const report={passed:true,learningSucceeded:rows.some(row=>row.maxSafeLaps>=2),approvedForApp:false,settings,gpu,checkpointSha256:settings.checkpointSha256,
      originalSaveSha256,sourceHashes:{before,after},rows,
      comparison:{control:control.rows.map(row=>({generation:row.completedGeneration,safe:row.safeCount,bestSafeProgressM:row.bestSafeProgressM,laps:row.maxSafeLaps})),
        treatment:rows.map(row=>({generation:row.completedGeneration,safe:row.safeCount,bestSafeProgressM:row.bestSafeProgressM,laps:row.maxSafeLaps}))},
      boundary:'Four natural full generations per branch from the same research checkpoint. One seed and Monza only; no weights promoted to app.'};
    const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('V3_LONG_HEAD_REPORT '+JSON.stringify({report:reportPath,sha256:sha(reportPath),safeCounts:rows.map(row=>row.safeCount),
      safeProgress:rows.map(row=>row.bestSafeProgressM),frontier:rows.map(row=>row.safeFrontierM),laps:rows.map(row=>row.maxSafeLaps),
      issuedTransfers:rows.map(row=>row.issuedTransfers.length),transferOutcomes:rows.map(row=>row.transferOutcomes.length),gpu}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(error=>{console.error('V3_LONG_HEAD_FAILED '+(error.stack||error));process.exitCode=1;});
