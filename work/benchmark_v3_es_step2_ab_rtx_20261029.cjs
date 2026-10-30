'use strict';
// A matched, in-memory ablation of V3 Evolution Strategy mean learning rate.
// Only the ES mean step is doubled; physics, rewards, sensors and genomes are
// otherwise the ordinary current simulation from the same private checkpoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const input=path.join(base,'progress8-practice-fine-scale-continue2-rtx-20261029/checkpoint-0.private.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const originalSaveSha256='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const controlReport=path.join(base,'progress8-safe-risky-weight-blend-ab-rtx-20261029/control/report.json');
const out=path.join(base,'progress8-es-step2-ab-rtx-20261029/treatment');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(path.join(root,file))]));
const check=(condition,message)=>{if(!condition)throw Error(message);};
async function main(){
  check(process.versions.node==='24.19.0','Pinned Node 24.19.0 is required');
  check(fs.existsSync(input)&&fs.existsSync(controlReport)&&sha(original)===originalSaveSha256,'Checkpoint, control report or user-save verification failed');
  check(!fs.existsSync(out),'Refusing to overwrite an existing research run');
  const cp=JSON.parse(fs.readFileSync(input,'utf8')),control=JSON.parse(fs.readFileSync(controlReport,'utf8'));
  check(cp.state.generation===95&&cp.state.population===40&&cp.state.seed===7717&&cp.state.circuitId==='monza','Unexpected start checkpoint');
  check(control.passed&&control.checkpointSha256===sha(input)&&control.settings.startGeneration===cp.state.generation,'Control does not match the treatment checkpoint');
  const before=sourceHashes();
  const Learning=require('../outputs/neural-learning.js'),priorUpdate=Learning.EvolutionStrategy.prototype.update;
  const multiplier=2;let scaledUpdates=0;
  Learning.EvolutionStrategy.prototype.update=function(...args){
    const meanBefore=this.mean.slice(),updatesBefore=this.updates,result=priorUpdate.apply(this,args);
    if(this.updates>updatesBefore){
      this.mean=this.mean.map((value,index)=>Math.max(-8,Math.min(8,meanBefore[index]+multiplier*(value-meanBefore[index]))));
      if(this.mean.some((value,index)=>value!==meanBefore[index]))scaledUpdates++;
    }
    return result;
  };
  const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
  const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
  const circuits=require('../outputs/data/circuits.json'),connectome=require('../outputs/data/connectome.json');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(connectome)),{population:40,modelId:'v3',circuitId:'monza',circuits,seed:cp.state.seed});
  P.restore(sim,structuredClone(cp.state));
  check(hash(P.capture(sim))===hash(cp.state),'Checkpoint did not round-trip exactly');
  P.validateTraining(P.capture(sim),sim.graph,sim.circuits);
  const initialMean=sim.optimizer.mean.slice();fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out,{recursive:false});
  const settings={model:'V3',circuit:'Monza',seed:cp.state.seed,population:cp.state.population,startGeneration:cp.state.generation,generations:4,
    baselineMeanStep:.325,treatmentMeanStep:.65,meanStepMultiplier:multiplier,otherESUpdates:'Unchanged: ranking, noise scales, rewards, selection and all simulator dynamics.',
    backend:'private exact V3 CUDA kernel',checkpointSha256:sha(input),controlReportSha256:sha(controlReport),originalSaveSha256,sourceHashes:before,
    boundary:'One matched checkpoint, seed and circuit. Mean update multiplier is injected at runtime only. It is a research ablation, not a production change or generalization claim.'};
  fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-v3-es-step2-ab-v1',settings},null,2)+'\n',{flag:'wx'});
  sim.running=true;let terminal=new Map(),ticks=0,started=Date.now(),lastLog=started;const rows=[];
  sim.onTrialTick=s=>{
    const ppm=s.track.pixelsPerMeter||1;
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason,
      safe:F.isSafeLearningOutcome(car),fitness:car.fitness,steering:car.outputs?.[0]??null,gas:car.outputs?.[1]??null,brake:car.outputs?.[2]??null});
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('V3_ES_STEP2_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(car=>car.alive).length,
      bestM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  const oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    while(rows.length<4){
      const completedGeneration=sim.generation;sim.tick();ticks++;
      if(sim.generation!==completedGeneration){
        check(terminal.size===40,`Generation ${completedGeneration}: terminal census ${terminal.size}/40`);
        const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(item=>item.safe),mean=sim.optimizer.mean;
        const safeFrontier=sim.safeLearningFrontier?.progress??sim.learningFrontier?.progress??null;
        const row={completedGeneration,nextGeneration:sim.generation,ticks,safeCount:safe.length,
          collisionCount:outcomes.filter(item=>item.reason==='urto'||item.reason==='collision').length,
          bestSafeProgressM:safe.length?Math.max(...safe.map(item=>item.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(item=>item.laps)):0,
          safeAtLeast700M:safe.filter(item=>item.progressM>=700).length,safeFrontierM:Number.isFinite(safeFrontier)?safeFrontier/(sim.track.pixelsPerMeter||1):safeFrontier,
          esUpdates:sim.optimizer.updates,scaledMeanUpdates:scaledUpdates,meanDeltaRms:Math.sqrt(mean.reduce((sum,value,index)=>sum+(value-initialMean[index])**2,0)/mean.length),outcomes};
        rows.push(row);const saved={format:'private-v3-es-step2-checkpoint-v1',settings,sourceHashes:before,completedGenerations:rows.length,
          lastGeneration:completedGeneration,nextGeneration:sim.generation,workerIndex:cp.workerIndex,state:P.capture(sim),rows:rows.map(({outcomes,...small})=>small)};
        P.validateTraining(saved.state,sim.graph,sim.circuits);const cpFile=path.join(out,`checkpoint-${rows.length%2}.private.json`);
        fs.writeFileSync(cpFile,JSON.stringify(saved)+'\n');const short={generation:completedGeneration,nextGeneration:sim.generation,safe:safe.length,
          collisions:row.collisionCount,bestSafeProgressM:row.bestSafeProgressM,safeFrontierM:row.safeFrontierM,laps:row.maxSafeLaps,
          esUpdates:row.esUpdates,scaledMeanUpdates:row.scaledMeanUpdates,meanDeltaRms:row.meanDeltaRms,gpuCalls:Cuda.stats().gpuCalls,
          checkpointSha256:sha(cpFile),wallSeconds:(Date.now()-started)/1000};
        fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');console.log('V3_ES_STEP2_GENERATION '+JSON.stringify(short));
        terminal=new Map();ticks=0;
      }
      if(ticks>=60000)throw Error('Generation tick guard exceeded; last private checkpoint is preserved');
    }
    sim.running=false;const gpu=Cuda.stats(),after=sourceHashes();
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA RTX 4060 or zero CPU fallback was not confirmed');
    check(JSON.stringify(before)===JSON.stringify(after)&&sha(input)===settings.checkpointSha256&&sha(original)===originalSaveSha256,'Source, checkpoint or user save changed');
    const report={passed:true,learningSucceeded:rows.some(row=>row.maxSafeLaps>=2),approvedForApp:false,settings,gpu,checkpointSha256:settings.checkpointSha256,
      originalSaveSha256,sourceHashes:{before,after},rows,
      comparison:{controlGenerations:control.rows.map(row=>({generation:row.completedGeneration,safe:row.safeCount,bestSafeProgressM:row.bestSafeProgressM,laps:row.maxSafeLaps})),
        treatmentGenerations:rows.map(row=>({generation:row.completedGeneration,safe:row.safeCount,bestSafeProgressM:row.bestSafeProgressM,laps:row.maxSafeLaps}))},
      boundary:'Four natural full generations per branch from the same research checkpoint. Single-seed Monza result; no weights promoted to app.'};
    const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('V3_ES_STEP2_REPORT '+JSON.stringify({report:reportPath,sha256:sha(reportPath),safeCounts:rows.map(row=>row.safeCount),
      frontier:rows.map(row=>row.safeFrontierM),safeProgress:rows.map(row=>row.bestSafeProgressM),laps:rows.map(row=>row.maxSafeLaps),
      updates:rows.map(row=>row.esUpdates),scaledMeanUpdates:scaledUpdates,gpu}));
  }finally{Dense.step=oldStep;Cuda.close();Learning.EvolutionStrategy.prototype.update=priorUpdate;}
}
main().catch(error=>{console.error('V3_ES_STEP2_FAILED '+(error.stack||error));process.exitCode=1;});
