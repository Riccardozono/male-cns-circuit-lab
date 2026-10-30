'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs'),H=require('./guard-memory-checkpoint.cjs'),Coverage=require('./neural-coverage.cjs'),{TrialPool}=require('./neural-trial-pool.cjs'),{F,C,M}=G;
const arg=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)||d;
const tag=arg('tag','coverage-guard4'),source=path.resolve(G.root,arg('source','.impeccable/review/neural-local-rbf/growing-guard4/checkpoint.json')),stages=Number(arg('stages','4')),workers=Number(arg('workers','2'));
if(!/^[a-z0-9-]+$/.test(tag)||!Number.isInteger(stages)||stages<1||stages>100||!Number.isInteger(workers)||workers<1||workers>3)throw Error('Invalid growing learner settings');
const output=path.join(G.root,'.impeccable/review/neural-local-rbf',tag);if(fs.existsSync(path.join(output,'checkpoint.json')))throw Error('Choose a new output tag');fs.mkdirSync(output,{recursive:true});
const sourceHash=C.hashFile(source),{saved,sim,original}=H.load(source),genome=F.cloneGenome(saved.baseGenome),decay=saved.decay;
let centres=structuredClone(saved.centres),championWeights=saved.championWeights.slice(),explorerWeights=saved.explorerWeights.slice(),champion=null,explorer=null,records=[],stageHistory=[],actualTailTicks=0,fullReplays=0,pool;
const sourceHashes=Object.fromEntries(['work/train-coverage-guard-memory.cjs','work/neural-coverage.cjs','work/neural-trial-pool.cjs','work/guard-memory-checkpoint.cjs','work/guard-memory-runtime.cjs','work/neural-local-rbf.cjs','work/neural-memory-rbf.cjs','.impeccable/experimental-progress-guard4/outputs/simulation.js','.impeccable/experimental-progress-guard4/outputs/rewards.js','.impeccable/experimental-progress-guard4/outputs/vehicle-992.js'].map(f=>[f,C.hashFile(path.join(G.root,f))]));
function checkpoint(stage){return C.seal({format:'male-cns-growing-guard-memory',schema:1,decoder:'compact-neural-memory-rbf-v1',objectiveRevision:F.Rewards.REVISION,appVersion:'5.6.0',sourceSha256:sourceHash,legacySourceSha256:saved.legacySourceSha256,sourceHashes,graph:G.X.P.compatibleGraph(sim.graph),baseGenome:genome,centres,decay,champion,championWeights,explorer,explorerWeights,stage,stageHistory,records,actualTailTicks,fullReplays});}
async function main(){
  let championEpisode=G.replay(sim,genome,centres,championWeights,{decay,trace:true}),explorerEpisode=G.replay(sim,genome,centres,explorerWeights,{decay,trace:true});fullReplays+=2;champion=championEpisode.result;explorer=explorerEpisode.result;
  if(JSON.stringify(champion)!==JSON.stringify(saved.champion)||JSON.stringify(explorer)!==JSON.stringify(saved.explorer))throw Error('Source champion changed before growing experiment');
  const baseline=structuredClone(champion),empty=G.replay(sim,genome,[],[],{decay,trace:true});fullReplays++;
  const protectedRaw=empty.observations.slice(0,Math.floor(empty.observations.length*.75)).map(row=>row.raw),started=performance.now();pool=new TrialPool(workers);
  for(let stage=0;stage<stages;stage++){
    const oldCount=centres.length,experienced=championEpisode.observations.concat(explorerEpisode.observations).map(row=>row.raw),grown=H.grow(centres,championWeights,experienced,protectedRaw,Math.min(64,oldCount+4));
    centres=grown.centres;championWeights=grown.weights;explorerWeights=explorerWeights.concat(Array(grown.added*2).fill(0));
    const preserved=G.replay(sim,genome,centres,championWeights,{decay,trace:true});fullReplays++;
    if(JSON.stringify(preserved.result)!==JSON.stringify(champion))throw Error('Basis growth changed prior champion function');championEpisode=preserved;
    const prefix=G.prefix(sim,genome,centres),probe=championWeights.map((v,j)=>Math.max(-8,Math.min(8,v+(j%2?-.1:.3)))),fullProbe=G.replay(sim,genome,centres,probe,{decay}),cachedProbe=G.replay(sim,genome,centres,probe,{decay,state:prefix.state,startTicks:prefix.ticks});fullReplays++;
    if(JSON.stringify(fullProbe.result)!==JSON.stringify(cachedProbe.result)||!prefix.observed.every(row=>M.vector(row,centres).every(v=>v===0)))throw Error('Growing prefix equivalence failed');
    const newIndices=Array.from({length:grown.added},(_,j)=>oldCount+j),active=Array.from({length:oldCount},(_,k)=>k).sort((a,b)=>Math.hypot(championWeights[b*2],championWeights[b*2+1])-Math.hypot(championWeights[a*2],championWeights[a*2+1]));
    const frontier=Array.from({length:centres.length},(_,k)=>({k,...Coverage.chooseParent(championEpisode,explorerEpisode,centres[k])})).sort((a,b)=>(b.explorer-b.champion)-(a.explorer-a.champion)||Math.max(b.explorer,b.champion)-Math.max(a.explorer,a.champion));
    const kernels=[...new Set(newIndices.concat(frontier.slice(0,2).map(row=>row.k),active.slice(0,1)))],amounts=[-4,-2,-1,-.5,.5,1,2,4];let stageImproved=false;
    for(const kernel of kernels){
      const support=Coverage.chooseParent(championEpisode,explorerEpisode,centres[kernel]),fromExplorer=support.parent==='explorer',parent=(fromExplorer?explorerWeights:championWeights).slice(),candidates=[];
      for(const steeringDelta of amounts)for(const longitudinalDelta of amounts){const weights=parent.slice();weights[kernel*2]=Math.max(-8,Math.min(8,weights[kernel*2]+steeringDelta));weights[kernel*2+1]=Math.max(-8,Math.min(8,weights[kernel*2+1]+longitudinalDelta));candidates.push({weights,kernel,steeringDelta,longitudinalDelta,parent:fromExplorer?'explorer':'champion'});}
      await pool.batch(candidates,{genome,centres,prefix,decay});
      for(const candidate of candidates){
        const r=candidate.episode.result;actualTailTicks+=candidate.episode.executedTicks;const record={stage:stage+1,kernel,parent:candidate.parent,steeringDelta:candidate.steeringDelta,longitudinalDelta:candidate.longitudinalDelta,result:r};records.push(record);
        const scoreGain=r.complete&&r.laps>=champion.laps&&r.bestProgress>=champion.bestProgress-.1&&r.fitness>champion.fitness,
          coverageGain=r.complete&&(r.laps>explorer.laps||r.laps===explorer.laps&&r.bestProgress>explorer.bestProgress+.1);
        if(scoreGain||coverageGain){const full=G.replay(sim,genome,centres,candidate.weights,{decay,trace:true});fullReplays++;if(JSON.stringify(full.result)!==JSON.stringify(r))throw Error('Growing proposal failed independent full replay');record.independentFullReplay=r;
          if(scoreGain){champion=r;championWeights=candidate.weights.slice();championEpisode=full;}
          if(coverageGain){explorer=r;explorerWeights=candidate.weights.slice();explorerEpisode=full;}
          stageImproved=true;console.log('GROWING_GUARD_IMPROVED '+JSON.stringify({stage:stage+1,kernel,scoreGain,coverageGain,champion,explorer,wallSeconds:(performance.now()-started)/1000}));
        }
      }
      C.atomicWrite(path.join(output,'checkpoint.json'),checkpoint(stage+1));
      const progress={stage:stage+1,centres:centres.length,added:grown.added,kernel,trials:records.length,actualTailTicks,fullReplays,champion,explorer,wallSeconds:(performance.now()-started)/1000};
      fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(progress,null,2));console.log('GROWING_GUARD_PROGRESS '+JSON.stringify(progress));
      if(champion.laps===2||explorer.laps===2)break;
    }
    stageHistory.push({stage:stage+1,oldCentres:oldCount,added:grown.added,newCentres:centres.length,priorPolicyExactlyPreserved:true,prefixResultExactlyMatchesFullReplay:true,prefixTicks:prefix.ticks,improved:stageImproved,champion,explorer});
    C.atomicWrite(path.join(output,'checkpoint.json'),checkpoint(stage+1));
    if(champion.laps===2||explorer.laps===2||!stageImproved&&grown.added===0&&stage>1)break;
  }
  const championReplay=G.replay(sim,genome,centres,championWeights,{decay}).result,explorerReplay=G.replay(sim,genome,centres,explorerWeights,{decay}).result;fullReplays+=2;
  if(JSON.stringify(championReplay)!==JSON.stringify(champion)||JSON.stringify(explorerReplay)!==JSON.stringify(explorer))throw Error('Final growing champion replay mismatch');
  const report={passed:true,sourceUnchanged:C.hashFile(source)===sourceHash,originalUnchanged:C.hashFile(original)===saved.legacySourceSha256,objectiveRevision:F.Rewards.REVISION,configuration:{model:'v3',circuit:'monza',workers,stagesRequested:stages,centres:centres.length,decay},baseline,champion,explorer,championReplay,explorerReplay,stageHistory,trials:records.length,actualTailTicks,fullReplays,records,sourceHashes,wallSeconds:(performance.now()-started)/1000,boundary:'Actual self-generated neural experience; independent compact basis growth with zero coefficients preserves prior policy exactly. No synthetic training examples, teacher, raw position or route inputs. Cached tails and independent full replays are distinct. Champion and coverage explorer are distinct. Corrected objective is explicit and incompatible with published application; original save preserved.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('GROWING_GUARD_DONE '+JSON.stringify({...report,records:undefined,sourceHashes:undefined,stageHistory:undefined}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await pool?.close();});
