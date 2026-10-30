'use strict';
// Bounded multi-start random search around diverse, physically recorded Monza frontier policies.
// This avoids CMA contraction; it does not alter the simulator, app rewards or user saves.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),NODE=path.join(ROOT,'.impeccable/runtime-node24/node.exe'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const TAG='frontier-multistart-progress-only-r1',MODEL=path.join(BASE,'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json');
const PREFLIGHT=path.join(BASE,'frontier3-current-driver-preflight/verification.json'),REFERENCE=path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json');
const PRIOR_DIR=path.join(BASE,'learned-prior-frontier-risk-400-16x16'),ISLANDS=4,OFFSPRING=16,SEED=291026,SIGMA=.7,RHO=.75,RISK_MULTIPLIER=1200;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function valid(e){return e.complete&&!e.censored&&e.overlap===0;}
function clean(e){return valid(e)&&!['urto','fuori pista','progresso non valido'].includes(e.result.reason);}
function eligible(e,reference){return clean(e)&&e.validationMode==='full-from-line'&&e.result.laps>=reference.laps&&e.result.bestProgress>=reference.bestProgress&&e.result.fitness>reference.fitness+1e-6;}
function score(e){assert.ok(valid(e));return e.actualNewProgress+10000*e.actualNewLapGates;}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});}
function diverseParents(){
  const verification=json(path.join(PRIOR_DIR,'verification.json'));assert.ok(verification.passed&&!verification.promoted);
  const rows=[];for(const name of fs.readdirSync(PRIOR_DIR).filter(name=>/^iteration-\d{3}\.json$/.test(name)).sort()){
    const event=json(path.join(PRIOR_DIR,name));for(const row of event.evaluated)rows.push({...row,sourceFile:name,sourceHash:hash(path.join(PRIOR_DIR,name))});
  }
  rows.sort((a,b)=>b.episode.actualNewProgress-a.episode.actualNewProgress);
  const chosen=[];for(const row of rows){let distant=true;for(const parent of chosen){let squared=0;for(let i=0;i<16;i++)squared+=(row.genes[i]-parent.genes[i])**2;if(Math.sqrt(squared)<.35){distant=false;break;}}
    if(distant)chosen.push(row);if(chosen.length===ISLANDS)break;
  }
  assert.equal(chosen.length,ISLANDS);assert.ok(chosen.every(row=>row.episode.complete&&row.episode.validationMode==='restored-prior-checkpoint'));
  return {verification,rows,chosen};
}

class Pipe{
  constructor(script,configuration){this.pending=new Map();this.nextId=0;this.stderr='';this.closed=false;this.child=cp.spawn(NODE,[script],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.lines=readline.createInterface({input:this.child.stdout,crlfDelay:Infinity});this.lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch(e){return this.fail(e);}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result);});
    this.child.stderr.on('data',x=>this.stderr=(this.stderr+x.toString()).slice(-8192));this.child.on('error',e=>this.fail(e));this.child.on('exit',(c,s)=>{if(!this.closed)this.fail(Error(`Worker exited (${c??s}): ${this.stderr}`));});
    this.ready=this.request('init',{configuration});
  }
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
  request(op,fields={}){const id=++this.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Timeout ${op}: ${this.stderr}`));},360000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,op,...fields})+'\n',e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});});}
  async close(){if(this.closed)return;this.closed=true;this.lines.close();this.child.stdin.end();await Promise.race([new Promise(r=>this.child.once('exit',r)),new Promise(r=>setTimeout(r,1500))]);if(this.child.exitCode===null)this.child.kill();this.fail(Error('Worker closed'));}
}

async function run(){
  const out=path.join(BASE,TAG);fs.mkdirSync(out,{recursive:false});const preflight=json(PREFLIGHT),referenceProof=json(REFERENCE),{verification:priorVerification,rows,chosen}=diverseParents();
  assert.ok(preflight.passed&&referenceProof.passed);for(const [file,digest]of Object.entries(preflight.sourceHashes))assert.equal(hash(path.join(ROOT,file)),digest,file);
  const files=['work/train_neural_prior_gated_kernel_frontier_islands.cjs','work/verify_neural_prior_gated_kernel_frontier_islands.cjs','work/neural-prior-gated-kernel-risk-env.cjs',
    'work/neural-prior-gated-kernel-native-driver-refresh.cjs','work/neural-prior-memory-core-driver-refresh.cjs','work/neural-prior-memory-native.cjs','work/neural-prior-control-live-r2.cjs',
    'work/neural-instant-context.cjs','work/neural-statehead-model.cjs','work/neural-statehead.cjs','work/neural-frontier-chain.cjs','work/neural-context-stack.cjs',
    'work/neural-json-head.cjs','work/exact-dense.cjs','work/cuda-exact-v3-packed-runtime.cjs','work/neural-prior-training-objective-r8.cjs',
    'work/neural-direct-training-objective-r7.cjs','.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js',
    '.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js',
    '.impeccable/experimental-context8/outputs/neural-learning.js','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'];
  const sourceHashes=Object.fromEntries(files.map(file=>[file,hash(path.join(ROOT,file))]));
  const Identity=require('./neural-research-source-identity.cjs'),sourceClosure=Identity.collect(['work/neural-prior-gated-kernel-risk-env.cjs','work/neural-prior-gated-kernel-native-driver-refresh.cjs',
    'work/neural-prior-memory-core-driver-refresh.cjs','.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js',
    '.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-context8/outputs/progress-save.js','outputs/data/connectome.json','outputs/data/circuits.json']);
  const identity={format:'male-cns-multistart-progress-only-random-search-v1',appVersion:'5.6.0',circuit:'Monza',dimensions:16,islands:ISLANDS,offspringPerIsland:OFFSPRING,
    candidateEpisodes:ISLANDS*(OFFSPRING+1),seed:SEED,sigma:SIGMA,withinMotorCorrelation:RHO,
    objective:'actual new physical progress in metres + 10000 * actually completed new lap gates; no risk penalty, collision cost or R5 fitness in ranking',
    parents:chosen.map(row=>({candidate:row.candidate,genes:row.genes,priorProgress:row.episode.actualNewProgress,priorReason:row.episode.result.reason,sourceFile:row.sourceFile,sourceHash:row.sourceHash})),
    priorVerificationSha256:hash(path.join(PRIOR_DIR,'verification.json')),preflightSha256:hash(PREFLIGHT),globalReferenceSha256:hash(REFERENCE),modelSha256:hash(MODEL),sourceHashes,sourceClosure,
    boundary:'Bounded four-island exploration with fixed, non-decaying correlated Gaussian mutations around four diverse physically replayed archived policies. Actual simulator and sensor inputs only; risk ledger is recorded for audit but not used by the sampler. Collisions remain exploratory observations only and can never qualify for promotion. No scripted actions, routes, teacher data, production edits, app version change, release or user save access.'};
  write(path.join(out,'identity.json'),identity);
  let rng=SEED>>>0,spare=null;function uniform(){rng=(Math.imul(1664525,rng)+1013904223)>>>0;return (rng+.5)/4294967296;}
  function normal(){if(spare!==null){const x=spare;spare=null;return x;}const r=Math.sqrt(-2*Math.log(uniform())),theta=2*Math.PI*uniform();spare=r*Math.sin(theta);return r*Math.cos(theta);}
  function mutate(mean){const commonSteer=normal(),commonLong=normal();return mean.map((v,i)=>{const shared=i%2===0?commonSteer:commonLong,local=normal(),sd=i%2===0?.4:1;
    return Math.max(-4,Math.min(4,v+SIGMA*sd*(Math.sqrt(RHO)*shared+Math.sqrt(1-RHO)*local)));});}
  const envs=[],records=[],parentReplays=[],started=performance.now();const state=(phase,extra={})=>fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({phase,actualCandidateEpisodes:records.length,wallSeconds:(performance.now()-started)/1000,pids:envs.map(e=>e.child.pid),...extra},null,2));
  try{
    state('initializing-four-independent-gpu-environments');
    await Promise.all(Array.from({length:ISLANDS},async()=>{const env=new Pipe(path.join(ROOT,'work/neural-prior-gated-kernel-risk-env.cjs'),{modelFile:MODEL,riskMultiplier:RISK_MULTIPLIER});envs.push(env);await env.ready;}));
    write(path.join(out,'metadata.json'),{environments:await Promise.all(envs.map(env=>env.request('metadata')))});
    const parentEpisodes=await Promise.all(chosen.map((row,lane)=>envs[lane].request('evaluate',{weights:row.genes,mode:'practice'})));
    for(let lane=0;lane<ISLANDS;lane++){const episode=parentEpisodes[lane];assert.ok(valid(episode));assert.deepEqual(episode.result,chosen[lane].episode.result);assert.equal(episode.actionTraceSha256,chosen[lane].episode.actionTraceSha256);
      parentReplays.push({lane,sourceFile:chosen[lane].sourceFile,candidate:chosen[lane].candidate,genes:chosen[lane].genes,episode});}
    const baseline=await envs[0].request('evaluate',{weights:Array(16).fill(0),mode:'full'});assert.ok(valid(baseline)&&same(baseline.result,preflight.baseline.result));assert.equal(baseline.actionTraceSha256,preflight.baseline.actionTraceSha256);
    write(path.join(out,'preflight.json'),{passed:true,parentReplays,baselineFull:baseline,globalReference:referenceProof.result,
      priorVerificationSha256:hash(path.join(PRIOR_DIR,'verification.json'))});
    const branches=Array.from({length:ISLANDS},(_,lane)=>({lane,parent:chosen[lane],evaluations:[{candidate:0,genes:chosen[lane].genes,episode:parentEpisodes[lane],score:score(parentEpisodes[lane])}]}));
    const candidateGenes=chosen.map(parent=>Array.from({length:OFFSPRING},()=>mutate(parent.genes)));
    state('evaluating-four-diverse-physical-frontiers');
    await Promise.all(envs.map(async(env,lane)=>{for(let candidate=1;candidate<=OFFSPRING;candidate++){
      const genes=candidateGenes[lane][candidate-1],episode=await env.request('evaluate',{weights:genes,mode:'practice'});assert.ok(valid(episode));
      branches[lane].evaluations.push({candidate,genes,episode,score:score(episode)});records.push({lane,candidate,genes,episode});
      state('evaluating-four-diverse-physical-frontiers',{completedInBatch:records.length});
    }}));
    const all=branches.flatMap(branch=>branch.evaluations.map(row=>({...row,lane:branch.lane,sourceFile:branch.parent.sourceFile}))).sort((a,b)=>b.score-a.score);
    const bestPractice=all[0];const full=await envs[0].request('evaluate',{weights:bestPractice.genes,mode:'full'});
    const fullProofs=[];if(eligible(full,referenceProof.result))for(let lane=1;lane<3;lane++)fullProofs.push(await envs[lane].request('evaluate',{weights:bestPractice.genes,mode:'full'}));
    const eligibleForProof=eligible(full,referenceProof.result)&&fullProofs.length===2&&fullProofs.every(e=>eligible(e,referenceProof.result)&&e.actionTraceSha256===full.actionTraceSha256);
    const report={passed:true,identity,baselineFull:baseline,parentReplays,branches,bestPractice,fullEvaluation:full,fullProofs,
      eligibleForIndependentNativeProof:eligibleForProof,promoted:false,actualCandidateEpisodes:records.length,
      actualNewCandidateControls:records.reduce((sum,row)=>sum+row.episode.actualNewControls,0),cudaByEnvironment:await Promise.all(envs.map(env=>env.request('metadata'))),wallSeconds:(performance.now()-started)/1000};
    write(path.join(out,'report.json'),report);state('finished',{eligibleForIndependentNativeProof:eligibleForProof});
    console.log(JSON.stringify({finished:true,episodes:report.actualCandidateEpisodes,bestProgress:bestPractice.episode.actualNewProgress,
      bestReason:bestPractice.episode.result.reason,fullReason:full.result.reason,eligibleForIndependentNativeProof:eligibleForProof,wallSeconds:report.wallSeconds}));
  }catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error?.stack||error),actualCandidateEpisodes:records.length},null,2),{flag:'wx'});throw error;}
  finally{await Promise.all(envs.map(env=>env.close()));}
}
if(require.main===module)run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={run,score,valid,clean,eligible};
