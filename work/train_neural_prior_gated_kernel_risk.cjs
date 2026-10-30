'use strict';
// Risk-shaped V3 research study. Each lane is a separate native/GPU process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),NODE=path.join(ROOT,'.impeccable/runtime-node24/node.exe'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const TAG_DEFAULT='learned-prior-risk-relative-1200-16x16',RISK_MULTIPLIER=1200;
const PREFLIGHT=path.join(BASE,'frontier3-current-driver-preflight/verification.json');
const REFERENCE=path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json');
const CALIBRATION=path.join(BASE,'reward-breakdown-v1/report.json');
const MODEL=path.join(BASE,'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const stable=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

class Pipe {
  constructor(script,initialization,wrapConfiguration=true){
    this.pending=new Map();this.nextId=0;this.stderr='';this.closed=false;
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
  request(op,fields={}){
    if(this.closed)return Promise.reject(new Error('Worker is closed'));
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Worker request timed out (${op}): ${this.stderr}`));},360000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,op,...fields})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
    });
  }
  async close(){if(this.closed)return;this.closed=true;this.lines.close();this.child.stdin.end();
    await Promise.race([new Promise(resolve=>this.child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,1500))]);
    if(this.child.exitCode===null)this.child.kill();this.fail(new Error('Worker closed'));
  }
}

function valid(e){return e.complete&&!e.censored&&e.overlap===0;}
function clean(e){return valid(e)&&!['urto','fuori pista','progresso non valido'].includes(e.result.reason);}
function globalBetter(e,reference){const r=e.result;return clean(e)&&e.validationMode==='full-from-line'&&r.laps>=reference.laps&&r.bestProgress>=reference.bestProgress&&r.fitness>reference.fitness+1e-6;}
function score(e){assert.ok(valid(e)&&e.riskMultiplier===RISK_MULTIPLIER);return e.trainingFitness;}
function closeNumber(a,b){return Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b));}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});}

async function run({tag=TAG_DEFAULT,generations=16}={}){
  assert.match(tag,/^[a-z0-9-]+$/);assert.ok(Number.isInteger(generations)&&generations>=1&&generations<=64);
  const out=path.join(BASE,tag);fs.mkdirSync(out,{recursive:false});
  const preflight=json(PREFLIGHT),referenceProof=json(REFERENCE),calibration=json(CALIBRATION);
  assert.ok(preflight.passed&&referenceProof.passed&&calibration.passed);
  for(const [file,digest] of Object.entries(preflight.sourceHashes))assert.equal(hash(path.join(ROOT,file)),digest,file);
  for(const [file,digest] of Object.entries(calibration.sourceHashes))assert.equal(hash(path.join(ROOT,file)),digest,file);
  const pilotRiskDelta=calibration.comparison.riskPenaltyDelta,pilotCollision=calibration.candidate.ledger.penalties.collision;
  assert.ok(pilotRiskDelta>0.45&&pilotRiskDelta<0.6&&pilotCollision>3200&&pilotCollision<3400);
  const sourcePaths=['work/train_neural_prior_gated_kernel_risk.cjs','work/neural-prior-gated-kernel-risk-env.cjs',
    'work/neural_ppo_parallel.py','work/neuronal_experiment_io_retry.py','work/neuronal_experiment_io.py',
    'work/neural-prior-gated-common-search.cjs','work/neural-prior-greedy-kernel-search.cjs','work/neural-prior-greedy-kernel-motors.cjs',
    'work/neural-prior-training-objective-r8.cjs','work/neural-direct-training-objective-r7.cjs',
    'work/neural-prior-gated-kernel-native-driver-refresh.cjs','work/neural-prior-memory-core-driver-refresh.cjs',
    'work/neural-prior-memory-native.cjs','work/neural-prior-control-live-r2.cjs','work/neural-instant-context.cjs',
    'work/neural-statehead-model.cjs','work/neural-statehead.cjs','work/neural-frontier-chain.cjs','work/neural-context-stack.cjs',
    'work/neural-json-head.cjs','work/exact-dense.cjs','work/cuda-exact-v3-packed-runtime.cjs',
    '.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js',
    '.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js',
    '.impeccable/experimental-context8/outputs/neural-learning.js','outputs/data/connectome.json','outputs/data/circuits.json',
    '.impeccable/runtime-node24/node.exe'];
  const Identity=require('./neural-research-source-identity.cjs');
  const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(path.join(ROOT,p))]));
  const sourceClosure=Identity.collect(['work/neural-prior-gated-kernel-risk-env.cjs','work/neural-prior-gated-kernel-native-driver-refresh.cjs',
    'work/neural-prior-memory-core-driver-refresh.cjs','.impeccable/experimental-penalty5/outputs/simulation.js',
    '.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/vehicle-992.js',
    '.impeccable/experimental-context8/outputs/progress-save.js','outputs/data/connectome.json','outputs/data/circuits.json']);
  const identity={format:'male-cns-baseline-relative-risk-training-v1',appVersion:'5.6.0',
    objective:'R8 actual episode fitness - 1200 * max(0, own-prefix stopping-risk exposure - measured zero-policy reference exposure)',
    dimensions:16,population:16,environments:4,seed:181026,sigma:.7,generations,riskMultiplier:RISK_MULTIPLIER,
    riskCalibrationReportSha256:hash(CALIBRATION),pilotRiskDelta,pilotCollisionPenalty:pilotCollision,
    pilotRiskCostAtMultiplier:RISK_MULTIPLIER*pilotRiskDelta,pilotRiskCostAsShareOfCollisionPenalty:RISK_MULTIPLIER*pilotRiskDelta/pilotCollision,
    preflightSha256:hash(PREFLIGHT),globalReferenceSha256:hash(REFERENCE),modelSha256:hash(MODEL),sourceHashes,sourceClosure,
    boundary:'Single-circuit V3/current-driver research only. Frozen verified MaleCNS prior with 16 trainable motor coefficients. Four independent RTX 4060 CUDA processes evaluate real vehicle physics. Risk is the unchanged forward stopping-distance ledger, measured only from the current candidate episode and compared with the same zero-policy prefix. 1200 is an experimental coefficient calibrated to make the observed candidate excess risk about 19% of that candidate collision cost; not a validated optimum. No scripted commands, steering/brake labels, routes, teacher actions, user saves, production app, version, release or model promotion.'};
  write(path.join(out,'identity.json'),identity);
  const envs=[],initial=Array(16).fill(0);let optimizer=null;const started=performance.now();
  const progress=(phase,extra={})=>fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({phase,actualCandidateEpisodes:records.length,wallSeconds:(performance.now()-started)/1000,pids:envs.map(e=>e.child.pid),...extra},null,2));
  const records=[],summaries=[],fullEvaluations=[];let elite=initial.slice(),bestPractice=null,bestFull=null;
  try{
    progress('initializing-four-independent-gpu-environments');
    await Promise.all(Array.from({length:4},async()=>{const env=new Pipe(path.join(ROOT,'work/neural-prior-gated-kernel-risk-env.cjs'),{modelFile:MODEL,riskMultiplier:RISK_MULTIPLIER});envs.push(env);await env.ready;}));
    const metadata=await Promise.all(envs.map(e=>e.request('metadata')));write(path.join(out,'metadata.json'),{environments:metadata});
    const practices=await Promise.all(envs.map(e=>e.request('evaluate',{weights:initial,mode:'practice'})));
    for(const episode of practices){assert.ok(valid(episode));assert.ok(stable(episode.result,preflight.baseline.result));
      assert.ok(stable(episode.actionTraceSha256,preflight.baseline.actionTraceSha256));
      assert.ok(closeNumber(episode.riskExposure,metadata[0].riskObjective.referenceExposure));
      assert.equal(episode.riskExcess,0);assert.ok(closeNumber(episode.trainingFitness,episode.result.fitness-2300));}
    assert.equal(new Set(practices.map(e=>e.actionTraceSha256)).size,1);
    const baselineFull=await envs[0].request('evaluate',{weights:initial,mode:'full'});
    assert.ok(valid(baselineFull)&&stable(baselineFull.result,preflight.baseline.result));
    assert.equal(baselineFull.actionTraceSha256,preflight.baseline.actionTraceSha256);
    write(path.join(out,'preflight.json'),{passed:true,baselineFull,practices,riskReference:metadata[0].riskObjective});
    bestPractice={genes:elite.slice(),episode:practices[0]};
    optimizer=new Pipe(path.join(ROOT,'work/neural-prior-gated-common-search.cjs'),{mean:initial,sigma:.7,population:16,seed:181026},false);
    await optimizer.ready;

    for(let generation=1;generation<=generations;generation++){
      const protectedElite=elite.slice(),genes=(await optimizer.request('ask',{elite:protectedElite}));
      assert.equal(genes.length,16);assert.ok(stable(genes[0],protectedElite));
      write(path.join(out,`asked-${String(generation).padStart(3,'0')}.json`),{genes,protectedElite});
      progress('evaluating-actual-candidate-policies',{generation,completedInBatch:0});
      const evaluated=Array(16);
      await Promise.all(envs.map(async(env,lane)=>{for(let index=lane;index<16;index+=4){
        const episode=await env.request('evaluate',{weights:genes[index],mode:'practice'});assert.ok(valid(episode));
        assert.equal(episode.riskMultiplier,RISK_MULTIPLIER);evaluated[index]={candidate:index,environment:lane,genes:genes[index],episode};
        records.push(evaluated[index]);progress('evaluating-actual-candidate-policies',{generation,completedInBatch:evaluated.filter(Boolean).length});
      }}));
      assert.equal(evaluated[0].episode.actionTraceSha256,bestPractice.episode.actionTraceSha256);
      const scores=evaluated.map(row=>score(row.episode));
      for(const row of evaluated)if(score(row.episode)>score(bestPractice.episode)+1e-9){bestPractice=row;elite=row.genes.slice();}
      await optimizer.request('tell',{fitness:scores});const optimizerState=await optimizer.request('state');
      assert.equal(optimizerState.optimizer.generation,generation);
      const event={generation,protectedElite,evaluated,scores,optimizerState};
      if(generation===1||generation%4===0||generation===generations){
        const episode=await envs[0].request('evaluate',{weights:elite,mode:'full'}),row={generation,genes:elite.slice(),episode};
        fullEvaluations.push(row);event.fullMeanEvaluation=episode;
        if(globalBetter(episode,referenceProof.result)&&(!bestFull||episode.result.fitness>bestFull.episode.result.fitness))bestFull=row;
      }
      write(path.join(out,`iteration-${String(generation).padStart(3,'0')}.json`),event);
      const summary={generation,actualCandidateEpisodes:records.length,bestPractice:bestPractice.episode.result,
        bestPracticeRiskExposure:bestPractice.episode.riskExposure,bestPracticeRiskExcess:bestPractice.episode.riskExcess,
        maxPracticeProgress:Math.max(...evaluated.map(r=>r.episode.result.bestProgress)),
        meanRiskExcess:evaluated.reduce((sum,r)=>sum+r.episode.riskExcess,0)/evaluated.length,
        fullFromLine:event.fullMeanEvaluation?.result||null,globalCandidate:Boolean(bestFull),sigma:optimizerState.optimizer.sigma};
      summaries.push(summary);fs.writeFileSync(path.join(out,'training-progress.json'),JSON.stringify({iterations:summaries,bestPractice,bestGlobalCandidate:bestFull},null,2));
      progress('generation-complete',{generation});console.log(JSON.stringify(summary));
    }
    let fullProofs=[];
    if(bestFull){progress('rechecking-global-clean-full-line-candidate');fullProofs=await Promise.all([0,1].map(()=>envs[0].request('evaluate',{weights:bestFull.genes,mode:'full'})));}
    const eligible=Boolean(bestFull&&fullProofs.length===2&&fullProofs.every(e=>globalBetter(e,referenceProof.result)&&e.actionTraceSha256===bestFull.episode.actionTraceSha256));
    const cudaByEnvironment=await Promise.all(envs.map(e=>e.request('metadata')));
    const report={passed:true,identity,baselineFull,actualCandidateEpisodes:records.length,
      actualNewCandidateControls:records.reduce((n,r)=>n+r.episode.actualNewControls,0),iterations:summaries,
      bestPractice,fullEvaluations,bestGlobalCandidate:bestFull,fullProofs,eligibleForIndependentNativeProof:eligible,
      promoted:false,cudaByEnvironment,wallSeconds:(performance.now()-started)/1000};
    write(path.join(out,'report.json'),report);progress('finished',{eligibleForIndependentNativeProof:eligible});
    console.log(JSON.stringify({finished:true,episodes:records.length,eligible,bestPractice:bestPractice.episode.result,
      bestRiskExcess:bestPractice.episode.riskExcess,wallSeconds:report.wallSeconds}));
  }catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error?.stack||error),actualCandidateEpisodes:records.length},null,2));throw error;}
  finally{if(optimizer)await optimizer.close();await Promise.all(envs.map(e=>e.close()));}
}

if(require.main===module){const args=process.argv.slice(2),tag=args[0]||TAG_DEFAULT,generations=Number(args[1]||16);
  run({tag,generations}).catch(error=>{console.error(error.stack||error);process.exitCode=1;});}
module.exports={run};
