'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Pool=require('./physical-rollout-pool.cjs'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-selection-20261024-01');if(fs.existsSync(out))throw Error('Preserve previous multi-start selection');
  const started=Date.now(),fineDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-fine-motor-10gen-20261024-01'),fine=JSON.parse(fs.readFileSync(path.join(fineDir,'report.json'),'utf8')),
    heading=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-fine-motor-heading-probe-20261024-01/report.json'),'utf8')),
    bytes=fs.readFileSync(path.join(fineDir,fine.checkpoint.filename)),decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(!fine.passed||!heading.passed||sha(bytes)!==fine.checkpoint.sha256||state.generation!==74||state.rewardRevision!=='progress-3')throw Error('Verified generation-74 copy required');
  const sim=Pool.setup();P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  const savedHash=fine.save.sha256,originalPath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
  if(sha(fs.readFileSync(originalPath))!==savedHash)throw Error('Original user checkpoint changed');
  const candidates=new Map(),add=(genome,origin)=>{if(!genome)return;const hash=sha(JSON.stringify(genome));if(candidates.has(hash))candidates.get(hash).origins.push(origin);else candidates.set(hash,{hash,genome,origins:[origin]});};
  state.genomes.forEach((g,i)=>add(g,'population:'+i));state.hallOfFame.forEach((r,i)=>add(r.genome,'archive:'+i));add(state.champion,'champion');add(state.externalChampion,'external');
  const referenceHash=fine.rows.at(-1).leader.genomeSha256,referenceGenome=candidates.get(referenceHash)?.genome;if(!referenceGenome)throw Error('Verified leader absent');
  const reference={genome:referenceGenome,headingOffsetRad:0,rewardRevision:state.rewardRevision,expected:heading.results.find(x=>x.model==='fine-trained'&&x.headingOffsetRad===0)},
    tasks=[...candidates.values()].map(c=>({id:c.hash,genome:c.genome,headingOffsetRad:0,rewardRevision:state.rewardRevision}));
  const first=await Pool.runPool(tasks,reference,{onResult:(_id,_r,n,total)=>{if(n%8===0||n===total)console.log('MULTISTART_ZERO '+JSON.stringify({completed:n,total}));}});
  for(const c of candidates.values())c.zero=first.results.get(c.hash);
  const chosen=[...candidates.values()].filter(c=>c.zero.safe).sort((a,b)=>F.compareLearningAgents(a.zero,b.zero)).slice(0,12);
  if(!chosen.length)throw Error('No safe evaluated candidate');
  const offsets=[-.002,-.001,0,.001,.002],multiTasks=chosen.flatMap(c=>offsets.filter(x=>x!==0).map(offset=>({id:c.hash+':'+offset,genome:c.genome,headingOffsetRad:offset,rewardRevision:state.rewardRevision})));
  const second=await Pool.runPool(multiTasks,reference,{onResult:(_id,_r,n,total)=>{if(n%8===0||n===total)console.log('MULTISTART_TRAIN '+JSON.stringify({completed:n,total}));}});
  for(const c of chosen){c.outcomes=offsets.map(offset=>({headingOffsetRad:offset,...(offset===0?c.zero:second.results.get(c.hash+':'+offset))}));
    c.safeCount=c.outcomes.filter(x=>x.safe).length;c.minLaps=Math.min(...c.outcomes.map(x=>x.laps));c.minProgressM=Math.min(...c.outcomes.map(x=>x.progressM));
    c.meanFitness=c.outcomes.reduce((s,x)=>s+x.fitness,0)/c.outcomes.length;}
  chosen.sort((a,b)=>b.safeCount-a.safeCount||b.minLaps-a.minLaps||b.minProgressM-a.minProgressM||b.meanFitness-a.meanFitness);
  const selected=chosen[0],confirmation=selected.outcomes.map(expected=>{
    const actual=Pool.execute(sim,{genome:selected.genome,headingOffsetRad:expected.headingOffsetRad,rewardRevision:state.rewardRevision});
    if(!Pool.same(actual,expected))throw Error('Selected seed independent replay differs');return {headingOffsetRad:expected.headingOffsetRad,...actual};
  });
  const heldoutOffsets=[-.003,-.0015,.0005,.0025],heldoutTasks=[{id:'selected',genome:selected.genome},{id:'original-leader',genome:referenceGenome}].flatMap(c=>heldoutOffsets.map(offset=>({id:c.id+':'+offset,genome:c.genome,headingOffsetRad:offset,rewardRevision:state.rewardRevision}))),
    heldoutPool=await Pool.runPool(heldoutTasks,reference),heldout=heldoutTasks.map(t=>({id:t.id,headingOffsetRad:t.headingOffsetRad,...heldoutPool.results.get(t.id)}));
  const saveUnchanged=sha(fs.readFileSync(originalPath))===savedHash,sourceStable=JSON.stringify(Pool.sources())===JSON.stringify(first.sourceHashes),publicCandidate=({genome,...rest})=>rest;
  const report={format:'v3-multistart-selection-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:saveUnchanged&&sourceStable,
    learningSucceeded:[...confirmation,...heldout].some(x=>x.safe&&x.laps>=2),candidateCount:candidates.size,zeroStage:[...candidates.values()].map(publicCandidate),
    settings:{workers:2,selectedForMultiStart:chosen.length,selectionOffsets:offsets,heldoutOffsets,selectionOrder:'safe outcomes, minimum lap count, minimum actual progress, mean actual fitness',maxTicks:60000},
    ranked:chosen.map(publicCandidate),selected:publicCandidate(selected),confirmation,heldout,
    method:'Replay current population/archive genotypes from the line before using any historical score. Rank the top 12 safe zero-offset genotypes across five actual starting headings; repeat the selected genotype independently, then probe four held-out headings for it and the original max-distance leader. No training update, route input or manual action is introduced.',
    integrity:{saveUnchanged,sourceStable,originalSaveSha256:savedHash,inputCheckpointSha256:sha(bytes),sourceHashes:first.sourceHashes,baselineMatches:first.baselines.length+second.baselines.length+heldoutPool.baselines.length},
    wallSeconds:(Date.now()-started)/1000,boundary:'Finite seed selection from one saved population; safe retention under these starts does not prove learning or a completed circuit.'};
  if(!report.passed)throw Error('Selection integrity failed');fs.mkdirSync(out,{recursive:false});const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(out,'selected-seed.private.json'),JSON.stringify({format:'private-v3-multistart-seed-v1',appVersion:'5.6.0',genome:selected.genome,sourceCheckpointSha256:sha(bytes),report:'report.json'},null,2),{flag:'wx'});
  fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('MULTISTART_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,candidates:candidates.size,selected:publicCandidate(selected),heldout,
    inputLeaderHash:referenceHash,saveUnchanged,sourceStable,wallSeconds:report.wallSeconds,report:target,sha256:sha(fs.readFileSync(target))}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
