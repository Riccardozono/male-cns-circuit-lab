'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,parentPort}=require('node:worker_threads'),G=require('./guard-memory-runtime.cjs'),H=require('./causal-checkpoint.cjs'),N=require('./neural-causal-memory.cjs'),D=require('./exact-dense.cjs'),{CMA}=require('./neural-cma.cjs');
const runtime=D.wrap(G.F,require('./exact-coo.cjs').pass);
if(!isMainThread){
  const sim=G.create();parentPort.on('message',m=>{try{const episode=N.replay(sim.track,sim.graph,m.genome,m.centres,m.weights,{state:m.prefix.state,startTicks:m.prefix.ticks,decay:m.decay,runtime});parentPort.postMessage({id:m.id,episode});}catch(e){parentPort.postMessage({id:m.id,error:e.stack});}});
}else{
  const arg=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)||d,tag=arg('tag','causal-growing-guard4'),generations=Number(arg('generations','24')),population=Number(arg('population','24')),workers=Number(arg('workers','2')),sigma=Number(arg('sigma','.5'));
  if(!/^[a-z0-9-]+$/.test(tag)||!Number.isInteger(generations)||generations<1||generations>100||!Number.isInteger(population)||population<6||population>100||!Number.isInteger(workers)||workers<1||workers>3||!Number.isFinite(sigma)||sigma<=0||sigma>4)throw Error('Invalid causal CMA settings');
  const source=path.resolve(G.root,arg('source','.impeccable/review/neural-local-rbf/causal-single-axis-guard4/checkpoint.json')),output=path.join(G.root,'.impeccable/review/neural-local-rbf',tag),pool=[];
  if(fs.existsSync(path.join(output,'checkpoint.json')))throw Error('Fresh experiment tag required');fs.mkdirSync(output,{recursive:true});
  let request=0;
  async function main(){
    const {saved,sim,original}=H.load(source),sourceHash=G.C.hashFile(source),originalHash=G.C.hashFile(original),genome=G.F.cloneGenome(saved.baseGenome),decay=saved.decay;
    const migrated=N.replay(sim.track,sim.graph,genome,saved.centres,saved.explorerWeights,{decay,trace:true,runtime});
    if(JSON.stringify(migrated.result)!==JSON.stringify(saved.explorer))throw Error('Previous physical explorer differs from full replay');
    const grown=N.grow(migrated.observations,saved.centres,saved.explorerWeights,8),centres=grown.centres,fixedWeights=saved.explorerWeights.slice(),baseWeights=grown.weights;
    const preserved=N.replay(sim.track,sim.graph,genome,centres,baseWeights,{decay,trace:true,runtime});
    if(JSON.stringify(preserved.result)!==JSON.stringify(migrated.result)||JSON.stringify(preserved.observations)!==JSON.stringify(migrated.observations))throw Error('Zero history features changed original policy');
    const prefix=N.prefix(sim.track,sim.graph,genome,centres,baseWeights,saved.centres.length,decay,runtime),probe=baseWeights.map((v,j)=>j<fixedWeights.length?v:(j%2?-.25:.5));
    const probeFull=N.replay(sim.track,sim.graph,genome,centres,probe,{decay,runtime}),probeTail=N.replay(sim.track,sim.graph,genome,centres,probe,{decay,runtime,state:prefix.state,startTicks:prefix.ticks});
    if(JSON.stringify(probeFull.result)!==JSON.stringify(probeTail.result))throw Error('Causal cached prefix differs from full start-line replay');
    const optimizer=new CMA(Array(grown.added*2).fill(0),sigma,population),random=G.F.rng(14027717),history=[],sourceHashes=Object.fromEntries(['work/train-causal-growing-cma.cjs','work/causal-checkpoint.cjs','work/neural-causal-memory.cjs','work/neural-cma.cjs','work/exact-dense.cjs','work/exact-coo.cjs','work/guard-memory-runtime.cjs','work/neural-memory-rbf.cjs','work/neural-local-rbf.cjs','.impeccable/experimental-progress-guard4/outputs/simulation.js','.impeccable/experimental-progress-guard4/outputs/rewards.js','.impeccable/experimental-progress-guard4/outputs/vehicle-992.js'].map(f=>[f,G.C.hashFile(path.join(G.root,f))]));
    let champion=preserved.result,championWeights=baseWeights.slice(),explorer=preserved.result,explorerWeights=baseWeights.slice(),bestCoordinates=optimizer.mean.slice(),evaluations=0,actualTailTicks=0,fullReplays=5;
    for(let k=0;k<workers;k++){const thread=new Worker(__filename),pending=new Map();thread.on('message',m=>{const job=pending.get(m.id);if(!job)return;pending.delete(m.id);m.error?job.reject(Error(m.error)):job.resolve(m.episode);});thread.on('error',e=>{for(const job of pending.values())job.reject(e);pending.clear();});pool.push({thread,pending});}
    const run=(slot,weights)=>new Promise((resolve,reject)=>{const id=++request;slot.pending.set(id,{resolve,reject});slot.thread.postMessage({id,genome,centres,weights,prefix,decay});});
    const started=performance.now();
    console.log('CAUSAL_CMA_BASELINE '+JSON.stringify({champion,newFeatures:grown.added,prefixTicks:prefix.ticks,exactOriginalPolicy:true,exactCachedPrefix:true}));
    for(let count=0;count<generations;count++){
      const candidates=optimizer.ask(random);candidates[0]={x:bestCoordinates.slice()};let at=0;
      await Promise.all(pool.map(async slot=>{while(at<candidates.length){const candidate=candidates[at++];candidate.x=candidate.x.map(v=>Math.max(-8,Math.min(8,v)));candidate.weights=fixedWeights.concat(candidate.x);candidate.episode=await run(slot,candidate.weights);const r=candidate.episode.result;candidate.fitness=r.complete?r.bestProgress+1000000*r.laps:-1e9;evaluations++;actualTailTicks+=candidate.episode.executedTicks;}}));
      for(const candidate of candidates){const r=candidate.episode.result,scoreGain=r.complete&&r.laps>=champion.laps&&r.bestProgress>=champion.bestProgress-.1&&r.fitness>champion.fitness,coverageGain=r.complete&&(r.laps>explorer.laps||r.laps===explorer.laps&&r.bestProgress>explorer.bestProgress+.1);
        if(scoreGain||coverageGain){const full=N.replay(sim.track,sim.graph,genome,centres,candidate.weights,{decay,runtime});fullReplays++;if(JSON.stringify(full.result)!==JSON.stringify(r))throw Error('Causal accepted proposal differs from independent full replay');
          if(scoreGain){champion=r;championWeights=candidate.weights.slice();}if(coverageGain){explorer=r;explorerWeights=candidate.weights.slice();bestCoordinates=candidate.x.slice();}
        }
      }
      const metrics=optimizer.tell(candidates),entry={generation:optimizer.generation,evaluations,metrics,champion,explorer,batchBestProgress:Math.max(...candidates.map(c=>c.episode.result.bestProgress)),actualTailTicks,fullReplays,wallSeconds:(performance.now()-started)/1000};history.push(entry);
      G.C.atomicWrite(path.join(output,'checkpoint.json'),G.C.seal({format:'male-cns-causal-memory-experiment',schema:1,decoder:'history-conditioned-neural-memory-v2',appVersion:'5.6.0',objectiveRevision:G.F.Rewards.REVISION,graph:G.X.P.compatibleGraph(sim.graph),sourceSha256:sourceHash,legacySourceSha256:originalHash,sourceHashes,baseGenome:genome,centres,decay,champion,championWeights,explorer,explorerWeights,fixedCoefficients:fixedWeights.length,optimizer,bestCoordinates,randomState:random.getState(),history}));
      fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(entry,null,2));console.log('CAUSAL_CMA_GENERATION '+JSON.stringify(entry));if(champion.laps===2||explorer.laps===2)break;
    }
    const verifiedChampion=N.replay(sim.track,sim.graph,genome,centres,championWeights,{decay,runtime}).result,verifiedExplorer=N.replay(sim.track,sim.graph,genome,centres,explorerWeights,{decay,runtime}).result;fullReplays+=2;
    if(JSON.stringify(verifiedChampion)!==JSON.stringify(champion)||JSON.stringify(verifiedExplorer)!==JSON.stringify(explorer))throw Error('Final causal policy replay mismatch');
    const report={passed:true,sourceUnchanged:G.C.hashFile(source)===sourceHash,originalUnchanged:G.C.hashFile(original)===originalHash,baseline:preserved.result,champion,explorer,verifiedChampion,verifiedExplorer,evaluations,actualTailTicks,fullReplays,configuration:{model:'v3',circuit:'monza',workers,population,generationsRequested:generations,newFeatures:grown.added,decay,sigma},migration:{priorPolicyExactlyPreserved:true,prefixExactlyMatchesFullReplay:true,prefixTicks:prefix.ticks},history,sourceHashes,boundary:'Continued growth from a real coverage explorer, whose lower reward is not relabeled as the global reward champion. Zero new coefficients preserve the prior explorer exactly. Actual descending-neuron activity plus two artificial decoder memory cells; no position/time/waypoint/desired controls as inputs. CMA coverage score is an explicit auxiliary search objective. Accepted candidates independently replayed from the start line. Incompatible research checkpoint, not a legacy 5.6.0 save.'};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('CAUSAL_CMA_DONE '+JSON.stringify({...report,history:undefined,sourceHashes:undefined}));
  }
  main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{await Promise.all(pool.map(slot=>slot.thread.terminate()));});
}
