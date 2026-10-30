'use strict';
// Sustained, resumable training of the existing neural adapter on the user's PC.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),SequentialCuda=require('./cuda-exact-v3-runtime.cjs');
const BatchTick=require('./cuda-v3-batch-tick.cjs'),{BatchCudaPass}=require('./cuda-exact-v3-batch-pass.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');if(i<3||!s.startsWith('--'))throw Error('Use --name=value');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(args.save||'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-cuda-20261022-01');
const generations=Number(args.generations||50),population=Number(args.population||100),riskRepairEnabled=args['risk-repair']==='true',riskRepairRate=args['risk-repair-rate']===undefined?F.EVOLUTION_RULES.riskRepairOffspringRate:Number(args['risk-repair-rate']),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const batched=args.batch==='true';let Cuda=SequentialCuda,batchEngine=null;
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/progress-save.js','outputs/rewards.js','outputs/dense-neural.js','outputs/vehicle-992.js','work/cuda-exact-v3-runtime.cjs','work/cuda-exact-v3-pass.cjs'];
if(batched)sourceFiles.push('work/cuda-exact-v3-batch-pass.cjs','work/cuda-v3-batch-tick.cjs');
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
const before=sourceHashes(),runnerSha256=sha(fs.readFileSync(__filename));
if(process.versions.node!=='24.19.0')throw Error('Node 24.19.0 required');
if(!Number.isInteger(generations)||generations<1||generations>500||!Number.isInteger(population)||population<4||population>100)throw Error('Invalid training settings');
if(!Number.isFinite(riskRepairRate)||riskRepairRate<0||riskRepairRate>.25)throw Error('Invalid risk-repair rate');
if(fs.existsSync(out))throw Error('Preserve existing training folders');

async function main(){
  const raw=fs.readFileSync(input),inputSha256=sha(raw),file=await P.decode(raw.toString('utf8'),'5.6.0');
  if(file.payload.modelId!=='v3'||file.payload.circuitId!=='monza'||file.payload.workers.length<1)throw Error('V3 Monza checkpoint required');
  const state=file.payload.workers[0].state,data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
  const originalSave=state.generation===64&&inputSha256==='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
  const reference=originalSave?require('../.impeccable/review/learning-ml/saved-v3-functional-block-crossover-source-saved-rng-ab-20261022-01/report.json').control.rows[0].terminalOutcomes:null;
  let batchProof=null;
  if(batched){
    const proofFile=path.resolve(root,args['batch-proof']||'.impeccable/review/learning-ml/exact-v3-batch-verification-20261022-01/report.json'),proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
    assert.ok(proof.passed&&proof.sourceFilesUnchanged&&proof.checks.some(c=>c.population===100)&&proof.checks.some(c=>c.all40PhysicalOutcomesExactlyReproduced));
    for(const [file,hash] of Object.entries(proof.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash);
    batchProof={path:proofFile,sha256:sha(fs.readFileSync(proofFile))};batchEngine=new BatchCudaPass();
    Cuda={pass:batchEngine.pass,stats:()=>batchEngine.stats(),identity:()=>batchEngine.identity(),close:()=>batchEngine.close()};
  }
  fs.mkdirSync(out,{recursive:false});fs.mkdirSync(path.join(out,'checkpoints'));
  const status={phase:'starting',backend:batched?'exact-batched-cuda':'exact-sequential-cuda',inputSha256,input,startGeneration:state.generation,population,generations,riskRepairEnabled,riskRepairRate,completedGenerations:0,rows:[],started:new Date().toISOString()};
  const progress=()=>fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(status,null,2));progress();
  const originalDenseStep=Dense.step;let sim=null;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(state));sim.riskRepairEnabled=riskRepairEnabled;sim.riskRepairOffspringRate=riskRepairRate;
    assert.deepEqual(P.capture(sim),state,'Restored checkpoint must retain genomes, archive, optimizer, history and RNG');status.exactCheckpointStateRecovered=true;
    sim.population=population;sim.running=true;
    let lastLog=performance.now(),terminal=null;
    sim.onTrialTick=s=>{
      if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,fitness:c.fitness,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);
      if(performance.now()-lastLog>20000){lastLog=performance.now();status.phase='training';status.current={generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,progressM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)};progress();console.log('CONTINUOUS_PROGRESS '+JSON.stringify(status.current));}
    };
    const started=performance.now();
    for(let index=0;index<generations;index++){
      const generation=sim.generation;let ticks=0;
      while(sim.generation===generation){if(batched)BatchTick.tick(sim,batchEngine);else sim.tick();ticks++;}
      if(sim.generation===generation||!terminal)throw Error('Generation did not finish naturally');
      if(index===0&&reference){const select=xs=>xs.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));assert.deepEqual(select(terminal),select(reference));status.originalGeneration64ExactlyReplayed=true;}
      const safe=terminal.filter(c=>c.safe),h=sim.history.at(-1),row={generation,evaluatedPopulation:terminal.length,ticks,wallSeconds:(performance.now()-started)/1000,
        safeAgentCount:safe.length,bestSafeProgressM:safe.length?Math.max(...safe.map(c=>c.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(c=>c.laps)):0,
        bestProgressM:Math.max(...terminal.map(c=>c.progressM)),stagnation:h.stagnation,mutationAmount:h.mutationAmount,
        riskRepairRate,
        riskRepairOffspringCount:sim.lastRiskRepairOffspringCount||0,riskRepairParentProgressM:Number.isFinite(sim.lastRiskRepairParentProgress)?sim.lastRiskRepairParentProgress/(sim.track.pixelsPerMeter||1):null,
        offspringGeneration:sim.generation,functionalCrossoverCount:sim.lastFunctionalCrossoverCount||0,outcomes:terminal};
      const payload=P.fromSimulation(sim);P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
      const text=await P.encode(payload,'5.6.0'),roundtrip=await P.decode(text,'5.6.0');assert.deepEqual(roundtrip.payload,payload);
      const filename=P.filename(payload,'5.6.0');fs.writeFileSync(path.join(out,'checkpoints',filename),text,{flag:'wx'});row.checkpoint=filename;row.checkpointSha256=sha(text);
      status.rows.push(row);status.completedGenerations=status.rows.length;status.current=null;progress();
      console.log('CONTINUOUS_GENERATION '+JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='outcomes'))));terminal=null;
      if(row.maxSafeLaps>=2){status.twoLapsObserved=true;break;}
    }
    const after=sourceHashes(),gpu=Cuda.stats(),unchanged=JSON.stringify(before)===JSON.stringify(after),inputUnchanged=sha(fs.readFileSync(input))===inputSha256;
    const report={format:'male-cns-sustained-v3-cuda-training-v1',appVersion:'5.6.0',riskRepairEnabled,riskRepairRate,passed:unchanged&&inputUnchanged&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:status.rows.some(r=>r.maxSafeLaps>=2),input:{path:input,sha256:inputSha256,unchanged:inputUnchanged},initialGeneration:state.generation,checkpointPopulation:state.population,
      trainingPopulation:population,requestedGenerations:generations,completedGenerations:status.rows.length,rewardRevision:sim.rewardRevision,seed:sim.seed,
      sourceHashes:before,sourceFilesUnchanged:unchanged,runnerSha256,gpu,cudaIdentity:Cuda.identity(),backend:status.backend,batchProof,exactCheckpointStateRecovered:status.exactCheckpointStateRecovered,rows:status.rows,
      summary:{bestSafeProgressM:Math.max(0,...status.rows.map(r=>r.bestSafeProgressM||0)),maxSafeLaps:Math.max(...status.rows.map(r=>r.maxSafeLaps))},
      boundary:'A continuous training run from one historical V3 Monza worker. Physical episodes finish naturally. Checkpoints are real validated canonical 5.6.0 payloads for the current development source, with original reward revision preserved. Two laps still require separate from-line checkpoint replay and other models/circuits/cold starts are not established by this run. User source/save, version and released binaries are not written.'};
    if(!report.passed)throw Error('Training integrity failed');
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});status.phase='complete';status.learningSucceeded=report.learningSucceeded;progress();
    console.log('CONTINUOUS_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,completedGenerations:report.completedGenerations,summary:report.summary,gpu,report:path.join(out,'report.json')}));
  }catch(e){status.phase='failed';status.error=e.stack||String(e);progress();throw e;}
  finally{if(sim)sim.running=false;Dense.step=originalDenseStep;Cuda.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
