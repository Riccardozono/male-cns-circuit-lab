'use strict';
// Risk-aware frontier exploration. Crashes may guide research, never promotion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),NODE=path.join(ROOT,'.impeccable/runtime-node24/node.exe'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const TAG_DEFAULT='learned-prior-frontier-risk-400-16x16',RISK_COST=400,ENV_RISK_MULTIPLIER=1200;
const PREFLIGHT=path.join(BASE,'frontier3-current-driver-preflight/verification.json'),REFERENCE=path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json');
const CALIBRATION=path.join(BASE,'reward-breakdown-v1/report.json'),MODEL=path.join(BASE,'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json');
const hashAbsolute=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashRelative=file=>hashAbsolute(path.join(ROOT,file));
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
class Pipe{
  constructor(script,initialization,wrapConfiguration=true){this.pending=new Map();this.nextId=0;this.stderr='';this.closed=false;
    this.child=cp.spawn(NODE,[script],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.lines=readline.createInterface({input:this.child.stdout,crlfDelay:Infinity});
    this.lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch(e){return this.fail(e);}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result);});
    this.child.stderr.on('data',x=>this.stderr=(this.stderr+x.toString()).slice(-8192));
    this.child.on('error',e=>this.fail(e));this.child.on('exit',(code,signal)=>{if(!this.closed)this.fail(new Error(`Worker exited (${code??signal}): ${this.stderr}`));});
    this.ready=this.request('init',wrapConfiguration?{configuration:initialization}:initialization);
  }
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
  request(op,fields={}){if(this.closed)return Promise.reject(Error('Worker is closed'));const id=++this.nextId;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Worker timed out (${op}): ${this.stderr}`));},360000);this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,op,...fields})+'\n',e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});});}
  async close(){if(this.closed)return;this.closed=true;this.lines.close();this.child.stdin.end();await Promise.race([new Promise(r=>this.child.once('exit',r)),new Promise(r=>setTimeout(r,1500))]);if(this.child.exitCode===null)this.child.kill();this.fail(Error('Worker closed'));}
}
function valid(e){return e.complete&&!e.censored&&e.overlap===0;}
function clean(e){return valid(e)&&!['urto','fuori pista','progresso non valido'].includes(e.result.reason);}
function cleanBetter(e,r){const x=e.result;return clean(e)&&e.validationMode==='full-from-line'&&x.laps>=r.laps&&x.bestProgress>=r.bestProgress&&x.fitness>r.fitness+1e-6;}
function score(e){assert.ok(valid(e));return e.actualNewProgress+10000*e.actualNewLapGates-RISK_COST*e.riskExcess;}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});}

async function run({tag=TAG_DEFAULT,generations=16}={}){
  assert.match(tag,/^[a-z0-9-]+$/);assert.ok(Number.isInteger(generations)&&generations>=1&&generations<=64);
  const out=path.join(BASE,tag);fs.mkdirSync(out,{recursive:false});
  const preflight=json(PREFLIGHT),reference=json(REFERENCE),calibration=json(CALIBRATION);
  assert.ok(preflight.passed&&reference.passed&&calibration.passed);
  for(const [f,d]of Object.entries(preflight.sourceHashes))assert.equal(hashRelative(f),d,f);
  for(const [f,d]of Object.entries(calibration.sourceHashes))assert.equal(hashRelative(f),d,f);
  const files=['work/train_neural_prior_gated_kernel_frontier_risk.cjs','work/neural-prior-gated-kernel-risk-env.cjs',
    'work/neural-prior-gated-common-search.cjs','work/neural-prior-greedy-kernel-search.cjs','work/neural-prior-greedy-kernel-motors.cjs',
    'work/neural-prior-gated-kernel-native-driver-refresh.cjs','work/neural-prior-memory-core-driver-refresh.cjs','work/neural-prior-memory-native.cjs',
    'work/neural-prior-control-live-r2.cjs','work/neural-instant-context.cjs','work/neural-statehead-model.cjs','work/neural-statehead.cjs',
    'work/neural-frontier-chain.cjs','work/neural-context-stack.cjs','work/neural-json-head.cjs','work/exact-dense.cjs','work/cuda-exact-v3-packed-runtime.cjs',
    'work/neural-prior-training-objective-r8.cjs','work/neural-direct-training-objective-r7.cjs',
    '.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js',
    '.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js',
    '.impeccable/experimental-context8/outputs/neural-learning.js','outputs/data/connectome.json','outputs/data/circuits.json',
    '.impeccable/runtime-node24/node.exe'];
  const Identity=require('./neural-research-source-identity.cjs');
  const sourceHashes=Object.fromEntries(files.map(f=>[f,hashRelative(f)]));
  const sourceClosure=Identity.collect(['work/neural-prior-gated-kernel-risk-env.cjs','work/neural-prior-gated-kernel-native-driver-refresh.cjs',
    'work/neural-prior-memory-core-driver-refresh.cjs','.impeccable/experimental-penalty5/outputs/simulation.js',
    '.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/vehicle-992.js',
    '.impeccable/experimental-context8/outputs/progress-save.js','outputs/data/connectome.json','outputs/data/circuits.json']);
  const identity={format:'male-cns-risk-aware-frontier-exploration-v1',appVersion:'5.6.0',objective:'actual new progress + 10000 * actual new lap gates - 400 * excess forward stopping-risk versus exact zero-policy prefix',
    dimensions:16,population:16,environments:4,seed:181026,sigma:.7,generations,riskCost:RISK_COST,environmentRiskMultiplier:ENV_RISK_MULTIPLIER,
    preflightSha256:hashAbsolute(PREFLIGHT),globalReferenceSha256:hashAbsolute(REFERENCE),riskCalibrationSha256:hashAbsolute(CALIBRATION),modelSha256:hashAbsolute(MODEL),sourceHashes,sourceClosure,
    boundary:'Exploration-only score allows collision episodes to seed subsequent candidate search; it is not a safety or fitness score. Candidates are never promoted on this score. Promotion requires clean, complete independent full-from-line proof in actual physics and beating the independent reference on laps, progress and raw R5 fitness. No imposed vehicle controls, route or teacher; original model/save/app/release are untouched.'};
  write(path.join(out,'identity.json'),identity);
  const envs=[],initial=Array(16).fill(0),records=[],summaries=[],fullEvaluations=[];let optimizer=null,elite=initial.slice(),bestPractice=null,bestFull=null;const started=performance.now();
  const progress=(phase,extra={})=>fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({phase,actualCandidateEpisodes:records.length,wallSeconds:(performance.now()-started)/1000,pids:envs.map(e=>e.child.pid),...extra},null,2));
  try{
    progress('initializing-four-independent-gpu-environments');
    await Promise.all(Array.from({length:4},async()=>{const e=new Pipe(path.join(ROOT,'work/neural-prior-gated-kernel-risk-env.cjs'),{modelFile:MODEL,riskMultiplier:ENV_RISK_MULTIPLIER});envs.push(e);await e.ready;}));
    const metadata=await Promise.all(envs.map(e=>e.request('metadata')));write(path.join(out,'metadata.json'),{environments:metadata});
    const baselinePractice=await Promise.all(envs.map(e=>e.request('evaluate',{weights:initial,mode:'practice'})));
    for(const e of baselinePractice){assert.ok(valid(e)&&same(e.result,preflight.baseline.result));assert.equal(e.actionTraceSha256,preflight.baseline.actionTraceSha256);}
    const baselineFull=await envs[0].request('evaluate',{weights:initial,mode:'full'});
    assert.ok(valid(baselineFull)&&same(baselineFull.result,preflight.baseline.result));assert.equal(baselineFull.actionTraceSha256,preflight.baseline.actionTraceSha256);
    write(path.join(out,'preflight.json'),{passed:true,baselineFull,baselinePractice,riskReference:metadata[0].riskObjective});
    bestPractice={genes:elite.slice(),episode:baselinePractice[0]};
    optimizer=new Pipe(path.join(ROOT,'work/neural-prior-gated-common-search.cjs'),{mean:initial,sigma:.7,population:16,seed:181026},false);await optimizer.ready;
    for(let generation=1;generation<=generations;generation++){
      const protectedElite=elite.slice(),genes=await optimizer.request('ask',{elite:protectedElite});assert.equal(genes.length,16);assert.deepEqual(genes[0],protectedElite);
      write(path.join(out,`asked-${String(generation).padStart(3,'0')}.json`),{genes,protectedElite});
      const evaluated=Array(16);progress('scoring-actual-progress-and-risk',{generation,completedInBatch:0});
      await Promise.all(envs.map(async(e,lane)=>{for(let index=lane;index<16;index+=4){const episode=await e.request('evaluate',{weights:genes[index],mode:'practice'});assert.ok(valid(episode));
        evaluated[index]={candidate:index,environment:lane,genes:genes[index],episode};records.push(evaluated[index]);
        progress('scoring-actual-progress-and-risk',{generation,completedInBatch:evaluated.filter(Boolean).length});}}));
      assert.equal(evaluated[0].episode.actionTraceSha256,bestPractice.episode.actionTraceSha256);
      const scores=evaluated.map(r=>score(r.episode));
      for(const row of evaluated)if(score(row.episode)>score(bestPractice.episode)+1e-9){bestPractice=row;elite=row.genes.slice();}
      await optimizer.request('tell',{fitness:scores});const optimizerState=await optimizer.request('state');assert.equal(optimizerState.optimizer.generation,generation);
      const event={generation,protectedElite,evaluated,scores,optimizerState};
      if(generation===1||generation%4===0||generation===generations){const episode=await envs[0].request('evaluate',{weights:elite,mode:'full'});event.fullMeanEvaluation=episode;fullEvaluations.push({generation,genes:elite.slice(),episode});
        if(cleanBetter(episode,reference.result)&&(!bestFull||episode.result.fitness>bestFull.episode.result.fitness))bestFull={generation,genes:elite.slice(),episode};}
      write(path.join(out,`iteration-${String(generation).padStart(3,'0')}.json`),event);
      const summary={generation,actualCandidateEpisodes:records.length,bestPractice:bestPractice.episode.result,bestPracticeRiskExcess:bestPractice.episode.riskExcess,
        bestPracticeExplorationScore:score(bestPractice.episode),maxPracticeProgress:Math.max(...evaluated.map(r=>r.episode.result.bestProgress)),
        meanRiskExcess:evaluated.reduce((s,r)=>s+r.episode.riskExcess,0)/evaluated.length,fullFromLine:event.fullMeanEvaluation?.result||null,
        globalCleanCandidate:Boolean(bestFull),sigma:optimizerState.optimizer.sigma};
      summaries.push(summary);fs.writeFileSync(path.join(out,'training-progress.json'),JSON.stringify({iterations:summaries,bestPractice,bestGlobalCandidate:bestFull},null,2));
      progress('generation-complete',{generation});console.log(JSON.stringify(summary));
    }
    const fullProofs=[];
    if(bestFull)for(let i=0;i<2;i++)fullProofs.push(await envs[i].request('evaluate',{weights:bestFull.genes,mode:'full'}));
    const eligible=Boolean(bestFull&&fullProofs.length===2&&fullProofs.every(e=>cleanBetter(e,reference.result)&&e.actionTraceSha256===bestFull.episode.actionTraceSha256));
    const report={passed:true,identity,baselineFull,actualCandidateEpisodes:records.length,actualNewCandidateControls:records.reduce((s,r)=>s+r.episode.actualNewControls,0),
      iterations:summaries,bestPractice,fullEvaluations,bestGlobalCandidate:bestFull,fullProofs,eligibleForIndependentNativeProof:eligible,promoted:false,
      cudaByEnvironment:await Promise.all(envs.map(e=>e.request('metadata'))),wallSeconds:(performance.now()-started)/1000};
    write(path.join(out,'report.json'),report);progress('finished',{eligibleForIndependentNativeProof:eligible});
    console.log(JSON.stringify({finished:true,episodes:records.length,eligible,bestPractice:bestPractice.episode.result,score:score(bestPractice.episode),riskExcess:bestPractice.episode.riskExcess,wallSeconds:report.wallSeconds}));
  }catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error?.stack||error),actualCandidateEpisodes:records.length},null,2));throw error;}
  finally{if(optimizer)await optimizer.close();await Promise.all(envs.map(e=>e.close()));}
}
if(require.main===module){run({tag:process.argv[2]||TAG_DEFAULT,generations:Number(process.argv[3]||16)}).catch(e=>{console.error(e.stack||e);process.exitCode=1;});}
module.exports={run};
