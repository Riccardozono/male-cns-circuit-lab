'use strict';
// Isolated research: optimize measured physical progress from a verified stalled-prefix checkpoint.
// This objective is exploration-only. Collision candidates can guide search but can never qualify for promotion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),NODE=path.join(ROOT,'.impeccable/runtime-node24/node.exe'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const TAG_DEFAULT='frontier-progress-only-270m-16x16-r1',RISK_MULTIPLIER=1200,POPULATION=16,ENVIRONMENTS=4,SEED=191026,SIGMA=.28;
const PREFLIGHT=path.join(BASE,'frontier3-current-driver-preflight/verification.json');
const REFERENCE=path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json');
const PRIOR_DIR=path.join(BASE,'learned-prior-frontier-risk-400-16x16');
const PRIOR_EVENT=path.join(PRIOR_DIR,'iteration-008.json'),PRIOR_VERIFICATION=path.join(PRIOR_DIR,'verification.json');
const MODEL=path.join(BASE,'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function valid(e){return e.complete&&!e.censored&&e.overlap===0;}
function clean(e){return valid(e)&&!['urto','fuori pista','progresso non valido'].includes(e.result.reason);}
function promotionCandidate(e,reference){const r=e.result;return clean(e)&&e.validationMode==='full-from-line'&&r.laps>=reference.laps&&r.bestProgress>=reference.bestProgress&&r.fitness>reference.fitness+1e-6;}
function frontierScore(e){assert.ok(valid(e));const score=e.actualNewProgress+10000*e.actualNewLapGates;assert.ok(Number.isFinite(score));return score;}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});}
function closeNumber(a,b){return Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b));}

class Pipe{
  constructor(script,initialization,wrapConfiguration=true){this.pending=new Map();this.nextId=0;this.stderr='';this.closed=false;
    this.child=cp.spawn(NODE,[script],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.lines=readline.createInterface({input:this.child.stdout,crlfDelay:Infinity});
    this.lines.on('line',line=>{let message;try{message=JSON.parse(line);}catch(error){return this.fail(new Error(`Malformed child output: ${error}`));}
      const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);
      if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.result);
    });
    this.child.stderr.on('data',data=>{this.stderr=(this.stderr+data.toString()).slice(-8192);});
    this.child.on('error',error=>this.fail(error));
    this.child.on('exit',(code,signal)=>{if(!this.closed)this.fail(new Error(`Worker exited (${code??signal}): ${this.stderr}`));});
    this.ready=this.request('init',wrapConfiguration?{configuration:initialization}:initialization);
  }
  fail(error){for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();}
  request(op,fields={}){if(this.closed)return Promise.reject(new Error('Worker is closed'));const id=++this.nextId;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Worker request timed out (${op}): ${this.stderr}`));},360000);
      this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,op,...fields})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});});
  }
  async close(){if(this.closed)return;this.closed=true;this.lines.close();this.child.stdin.end();
    await Promise.race([new Promise(resolve=>this.child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,1500))]);
    if(this.child.exitCode===null)this.child.kill();this.fail(new Error('Worker closed'));
  }
}

async function run({tag=TAG_DEFAULT,generations=8}={}){
  assert.match(tag,/^[a-z0-9-]+$/);assert.ok(Number.isInteger(generations)&&generations>=1&&generations<=16);
  const out=path.join(BASE,tag);fs.mkdirSync(out,{recursive:false});
  const preflight=json(PREFLIGHT),referenceProof=json(REFERENCE),priorProof=json(PRIOR_VERIFICATION),priorEvent=json(PRIOR_EVENT);
  assert.ok(preflight.passed&&referenceProof.passed&&priorProof.passed);
  assert.equal(priorProof.promoted,false);assert.equal(priorProof.eligibleForIndependentNativeProof,false);
  const priorEventHash=hash(PRIOR_EVENT),priorReportHash=hash(path.join(PRIOR_DIR,'report.json'));
  assert.equal(priorProof.recordHashes['iteration-008.json'],priorEventHash);
  const parent=priorEvent.evaluated.find(row=>row.candidate===9);
  assert.ok(parent&&parent.episode.complete&&parent.episode.result.reason==='urto');
  assert.ok(parent.episode.actualNewProgress>247&&parent.episode.actualNewProgress<300);
  for(const [file,digest] of Object.entries(preflight.sourceHashes))assert.equal(hash(path.join(ROOT,file)),digest,file);
  const sourcePaths=['work/train_neural_prior_gated_kernel_frontier_progress.cjs','work/verify_neural_prior_gated_kernel_frontier_progress.cjs',
    'work/neural-prior-gated-kernel-risk-env.cjs','work/neural-prior-gated-common-search.cjs','work/neural-prior-greedy-kernel-search.cjs',
    'work/neural-prior-kernel-search.cjs','work/neural-head-cma-transport.cjs','work/neural-cma.cjs','work/neural-prior-greedy-kernel-motors.cjs',
    'work/neural-prior-gated-kernel-native-driver-refresh.cjs','work/neural-prior-memory-core-driver-refresh.cjs','work/neural-prior-memory-native.cjs',
    'work/neural-prior-control-live-r2.cjs','work/neural-instant-context.cjs','work/neural-statehead-model.cjs','work/neural-statehead.cjs',
    'work/neural-frontier-chain.cjs','work/neural-context-stack.cjs','work/neural-json-head.cjs','work/exact-dense.cjs','work/cuda-exact-v3-packed-runtime.cjs',
    'work/neural-prior-training-objective-r8.cjs','work/neural-direct-training-objective-r7.cjs',
    '.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js',
    '.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js',
    '.impeccable/experimental-context8/outputs/neural-learning.js','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'];
  const Identity=require('./neural-research-source-identity.cjs');
  const sourceHashes=Object.fromEntries(sourcePaths.map(file=>[file,hash(path.join(ROOT,file))]));
  const sourceClosure=Identity.collect(['work/neural-prior-gated-kernel-risk-env.cjs','work/neural-prior-gated-kernel-native-driver-refresh.cjs',
    'work/neural-prior-memory-core-driver-refresh.cjs','.impeccable/experimental-penalty5/outputs/simulation.js',
    '.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/vehicle-992.js',
    '.impeccable/experimental-context8/outputs/progress-save.js','outputs/data/connectome.json','outputs/data/circuits.json']);
  const identity={format:'male-cns-progress-only-frontier-research-v1',appVersion:'5.6.0',circuit:'Monza',model:'V3/current-driver MaleCNS prior with 16 experimental motor coefficients',
    objective:'actual new physical progress in metres + 10000 * actually completed new lap gates; no risk penalty or R5 fitness enters optimizer ranking',
    dimensions:16,population:POPULATION,environments:ENVIRONMENTS,seed:SEED,sigma:SIGMA,generations,
    parentCandidate:9,parentCheckpoint:'actual 6350 m first-lap prefix from the fixed verified prior',parentGenes:parent.genes,
    parentPracticeProgress:parent.episode.actualNewProgress,parentPracticeResult:parent.episode.result,
    parentIterationSha256:priorEventHash,parentReportSha256:priorReportHash,parentVerificationSha256:hash(PRIOR_VERIFICATION),
    preflightSha256:hash(PREFLIGHT),globalReferenceSha256:hash(REFERENCE),modelSha256:hash(MODEL),sourceHashes,sourceClosure,
    boundary:'Isolated exploration only. Physical simulator, controller, sensors and app rewards remain unchanged. The evaluator records the actual risk ledger for audit but neither risk nor R5 fitness changes optimizer scores. Terminal collisions are retained as exploratory samples only; promotion requires clean complete full-from-line runs exceeding the independent global reference on laps, progress and raw fitness, followed by separate native proof. No scripted controls, routes, teacher actions, imported user saves, production integration, version bump or release.'};
  write(path.join(out,'identity.json'),identity);
  const envs=[],records=[],summaries=[],fullEvaluations=[];let optimizer=null,elite=parent.genes.slice(),bestPractice=null,bestFull=null;
  const started=performance.now(),progress=(phase,extra={})=>fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({phase,actualCandidateEpisodes:records.length,wallSeconds:(performance.now()-started)/1000,pids:envs.map(e=>e.child.pid),...extra},null,2));
  try{
    progress('initializing-four-independent-gpu-environments');
    await Promise.all(Array.from({length:ENVIRONMENTS},async()=>{const env=new Pipe(path.join(ROOT,'work/neural-prior-gated-kernel-risk-env.cjs'),{modelFile:MODEL,riskMultiplier:RISK_MULTIPLIER});envs.push(env);await env.ready;}));
    const metadata=await Promise.all(envs.map(env=>env.request('metadata')));write(path.join(out,'metadata.json'),{environments:metadata});
    const parentReplay=await Promise.all(envs.map(env=>env.request('evaluate',{weights:elite,mode:'practice'})));
    for(const episode of parentReplay){assert.ok(valid(episode));assert.deepEqual(episode.result,parent.episode.result);assert.equal(episode.actionTraceSha256,parent.episode.actionTraceSha256);
      assert.ok(closeNumber(episode.actualNewProgress,parent.episode.actualNewProgress));}
    assert.equal(new Set(parentReplay.map(episode=>episode.actionTraceSha256)).size,1);
    const baselineFull=await envs[0].request('evaluate',{weights:Array(16).fill(0),mode:'full'});
    assert.ok(valid(baselineFull)&&same(baselineFull.result,preflight.baseline.result));assert.equal(baselineFull.actionTraceSha256,preflight.baseline.actionTraceSha256);
    write(path.join(out,'preflight.json'),{passed:true,parentReplay,parentHistory:parent.episode,baselineFull,globalReference:referenceProof.result});
    bestPractice={genes:elite.slice(),episode:parentReplay[0]};
    optimizer=new Pipe(path.join(ROOT,'work/neural-prior-gated-common-search.cjs'),{mean:elite,sigma:SIGMA,population:POPULATION,seed:SEED},false);await optimizer.ready;
    for(let generation=1;generation<=generations;generation++){
      const protectedElite=elite.slice(),genes=await optimizer.request('ask',{elite:protectedElite});
      assert.equal(genes.length,POPULATION);assert.deepEqual(genes[0],protectedElite);
      write(path.join(out,`asked-${String(generation).padStart(3,'0')}.json`),{genes,protectedElite});
      const evaluated=Array(POPULATION);progress('evaluating-actual-physical-frontier-progress',{generation,completedInBatch:0});
      await Promise.all(envs.map(async(env,lane)=>{for(let index=lane;index<POPULATION;index+=ENVIRONMENTS){
        const episode=await env.request('evaluate',{weights:genes[index],mode:'practice'});assert.ok(valid(episode));
        evaluated[index]={candidate:index,environment:lane,genes:genes[index],episode};records.push(evaluated[index]);
        progress('evaluating-actual-physical-frontier-progress',{generation,completedInBatch:evaluated.filter(Boolean).length});
      }}));
      assert.equal(evaluated[0].episode.actionTraceSha256,bestPractice.episode.actionTraceSha256);
      const scores=evaluated.map(row=>frontierScore(row.episode));
      for(const row of evaluated)if(frontierScore(row.episode)>frontierScore(bestPractice.episode)+1e-9){bestPractice=row;elite=row.genes.slice();}
      await optimizer.request('tell',{fitness:scores});const optimizerState=await optimizer.request('state');assert.equal(optimizerState.optimizer.generation,generation);
      const event={generation,protectedElite,evaluated,scores,optimizerState};
      if(generation===1||generation%4===0||generation===generations){
        const episode=await envs[0].request('evaluate',{weights:elite,mode:'full'}),row={generation,genes:elite.slice(),episode};fullEvaluations.push(row);event.fullFromLineEvaluation=episode;
        if(promotionCandidate(episode,referenceProof.result)&&(!bestFull||episode.result.fitness>bestFull.episode.result.fitness))bestFull=row;
      }
      write(path.join(out,`iteration-${String(generation).padStart(3,'0')}.json`),event);
      const summary={generation,actualCandidateEpisodes:records.length,bestPractice:bestPractice.episode.result,
        bestPracticeProgress:bestPractice.episode.actualNewProgress,bestPracticeNewLaps:bestPractice.episode.actualNewLapGates,
        bestPracticeReason:bestPractice.episode.result.reason,maxPracticeProgress:Math.max(...evaluated.map(row=>row.episode.actualNewProgress)),
        collisions:evaluated.filter(row=>row.episode.result.reason==='urto').length,
        fullFromLine:event.fullFromLineEvaluation?.result||null,globalCleanCandidate:Boolean(bestFull),sigma:optimizerState.optimizer.sigma};
      summaries.push(summary);fs.writeFileSync(path.join(out,'training-progress.json'),JSON.stringify({iterations:summaries,bestPractice,bestGlobalCandidate:bestFull},null,2));
      progress('generation-complete',{generation});console.log(JSON.stringify(summary));
    }
    const fullProofs=[];if(bestFull)for(let lane=0;lane<2;lane++)fullProofs.push(await envs[lane].request('evaluate',{weights:bestFull.genes,mode:'full'}));
    const eligible=Boolean(bestFull&&fullProofs.length===2&&fullProofs.every(episode=>promotionCandidate(episode,referenceProof.result)&&episode.actionTraceSha256===bestFull.episode.actionTraceSha256));
    const report={passed:true,identity,baselineFull,actualCandidateEpisodes:records.length,
      actualNewCandidateControls:records.reduce((sum,row)=>sum+row.episode.actualNewControls,0),iterations:summaries,bestPractice,
      fullEvaluations,bestGlobalCandidate:bestFull,fullProofs,eligibleForIndependentNativeProof:eligible,promoted:false,
      cudaByEnvironment:await Promise.all(envs.map(env=>env.request('metadata'))),wallSeconds:(performance.now()-started)/1000};
    write(path.join(out,'report.json'),report);progress('finished',{eligibleForIndependentNativeProof:eligible});
    console.log(JSON.stringify({finished:true,episodes:records.length,eligible,bestPracticeProgress:bestPractice.episode.actualNewProgress,
      bestPracticeReason:bestPractice.episode.result.reason,wallSeconds:report.wallSeconds}));
  }catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error?.stack||error),actualCandidateEpisodes:records.length},null,2),{flag:'wx'});throw error;}
  finally{if(optimizer)await optimizer.close();await Promise.all(envs.map(env=>env.close()));}
}

if(require.main===module){run({tag:process.argv[2]||TAG_DEFAULT,generations:Number(process.argv[3]||8)}).catch(error=>{console.error(error.stack||error);process.exitCode=1;});}
module.exports={run,frontierScore,valid,clean,promotionCandidate};
