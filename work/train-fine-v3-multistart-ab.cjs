'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),P=require('../outputs/progress-save.js'),
  Pool=require('./physical-rollout-pool.cjs'),Objective=require('./multistart-objective.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const hash=g=>sha(JSON.stringify(g)),offsets=[-.001,0,.001],heldoutOffsets=[-.00275,-.00125,.00075,.00225],population=16,cycles=6,seed=20261024;
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01');if(fs.existsSync(out))throw Error('Preserve prior multi-start training');
  const started=Date.now(),selectionDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-selection-20261024-01'),selection=JSON.parse(fs.readFileSync(path.join(selectionDir,'report.json'),'utf8')),
    fineDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-fine-motor-10gen-20261024-01'),fine=JSON.parse(fs.readFileSync(path.join(fineDir,'report.json'),'utf8')),
    bytes=fs.readFileSync(path.join(fineDir,fine.checkpoint.filename)),decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(!selection.passed||!fine.passed||sha(bytes)!==selection.integrity.inputCheckpointSha256||state.generation!==74)throw Error('Verified private generation-74 checkpoint required');
  const sim=Pool.setup();P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  const sourceHashes=Pool.sources();if(JSON.stringify(sourceHashes)!==JSON.stringify(selection.integrity.sourceHashes))throw Error('Current selection source identity required');
  const genomes=new Map(),cache=new Map(),contexts=new Map(),contextAudit=[],evaluationBatches=[];
  const add=g=>{if(g)genomes.set(hash(g),F.cloneGenome(g));};state.genomes.forEach(add);state.hallOfFame.forEach(x=>add(x.genome));add(state.champion);
  const selectedSeed=JSON.parse(fs.readFileSync(path.join(selectionDir,'selected-seed.private.json'),'utf8')).genome;if(hash(selectedSeed)!==selection.selected.hash)throw Error('Selected seed identity failed');
  const reference={genome:genomes.get(fine.rows.at(-1).leader.genomeSha256),headingOffsetRad:0,rewardRevision:'progress-3',expected:selection.zeroStage.find(x=>x.hash===fine.rows.at(-1).leader.genomeSha256).zero};
  for(const row of selection.zeroStage)cache.set(row.hash+':0',row.zero);
  for(const row of selection.ranked)for(const r of row.outcomes)if(offsets.includes(r.headingOffsetRad))cache.set(row.hash+':'+r.headingOffsetRad,r);
  const cacheFromSelection=cache.size;
  function experience(genome){
    const key=hash(genome);if(contexts.has(key))return contexts.get(key);
    const replay=fullRollout(F,sim.track,sim.graph,genome,{rewardRevision:'progress-3',maxTicks:60000,onControl:car=>L.rememberActivity(car.brain)}),actual={...outcome(F,replay),progressM:replay.car.bestProgress/(sim.track.pixelsPerMeter||1)},expected=cache.get(key+':0');
    if(!expected||!Pool.same(actual,expected))throw Error('Parent experience replay differs from physical evidence');
    const x=structuredClone(replay.car.brain.policyExperience);contexts.set(key,x);contextAudit.push({genomeSha256:key,samples:x.samples,centres:x.centres.length,episode:actual});return x;
  }
  function mutate(parent,random,focus){
    const child=F.cloneGenome(parent),raw=L.safeMotorMutation(sim.graph,parent.policyWeights,random,.24,experience(parent),focus);
    const steering=raw.some((v,i)=>i>=sim.graph.learning.readoutOffset&&(i-sim.graph.learning.readoutOffset)%2===0&&v!==parent.policyWeights[i]);
    child.policyWeights=L.scaleMutation(parent.policyWeights,raw,steering?.003:.03);if(!L.valid(sim.graph,child.policyWeights))throw Error('Invalid private fine mutation');return child;
  }
  const initial=selection.zeroStage.filter(x=>x.zero.safe).sort((a,b)=>F.compareLearningAgents(a.zero,b.zero)).slice(0,12).map(x=>F.cloneGenome(genomes.get(x.hash)));
  const initialRandom=F.rng(seed+1);for(const focus of ['steering','combined']){const child=mutate(selectedSeed,initialRandom,focus);initial.push(child);const mirror=F.cloneGenome(selectedSeed);mirror.policyWeights=L.mirroredMutation(selectedSeed.policyWeights,child.policyWeights);initial.push(mirror);}
  if(initial.length!==population)throw Error('Identical 16-genome starting set required');
  const arms=[{id:'zero-only',random:F.rng(seed),genomes:structuredClone(initial),history:[]},{id:'multi-start',random:F.rng(seed),genomes:structuredClone(initial),history:[]}];
  const compareZero=(a,b)=>Number(b.zero.safe)-Number(a.zero.safe)||F.compareLearningAgents(a.zero,b.zero),rank=(arm,rows)=>rows.slice().sort(arm.id==='zero-only'?compareZero:(a,b)=>Objective.compare(a.aggregate,b.aggregate));
  for(let cycle=1;cycle<=cycles;cycle++){
    const tasks=new Map();for(const arm of arms)for(const genome of arm.genomes){const h=hash(genome);genomes.set(h,genome);for(const offset of offsets){const id=h+':'+offset;if(!cache.has(id)&&!tasks.has(id))tasks.set(id,{id,genome,headingOffsetRad:offset,rewardRevision:'progress-3'});}}
    if(tasks.size){const result=await Pool.runPool([...tasks.values()],reference,{onResult:(_id,_r,n,total)=>{if(n%16===0||n===total)console.log('ROBUST_CYCLE_EPISODES '+JSON.stringify({cycle,completed:n,total}));}});for(const [id,r]of result.results)cache.set(id,r);evaluationBatches.push({cycle,newPhysicalEpisodes:tasks.size,baselineMatches:result.baselines.length});}
    for(const arm of arms){
      const rows=arm.genomes.map(genome=>{const h=hash(genome),measured=offsets.map(offset=>({headingOffsetRad:offset,...cache.get(h+':'+offset)}));return {genomeSha256:h,measured,zero:measured[1],aggregate:Objective.aggregate(measured)};});
      const ranked=rank(arm,rows),best=ranked[0],bestZero=rows.slice().sort(compareZero)[0];
      arm.history.push({cycle,population:rows,best,bestZero,allStartsSafeGenomes:rows.filter(x=>x.aggregate.safeCount===offsets.length).length});
      console.log('ROBUST_CYCLE_RESULT '+JSON.stringify({cycle,arm:arm.id,minProgressM:best.aggregate.minProgressM,zeroProgressM:best.zero.progressM,safeStarts:best.aggregate.safeCount,
        minLaps:best.aggregate.minLaps,bestZeroM:bestZero.zero.progressM,allStartsSafeGenomes:arm.history.at(-1).allStartsSafeGenomes}));
      if(cycle<cycles){
        const next=ranked.slice(0,4).map(x=>F.cloneGenome(genomes.get(x.genomeSha256)));
        for(let pair=0;pair<6;pair++){const parentRow=ranked[Math.min(3,Math.floor(Math.pow(arm.random(),1.6)*4))],parent=genomes.get(parentRow.genomeSha256),focus=['steering','longitudinal','combined'][pair%3],child=mutate(parent,arm.random,focus),mirror=F.cloneGenome(parent);
          mirror.policyWeights=L.mirroredMutation(parent.policyWeights,child.policyWeights);if(!L.valid(sim.graph,mirror.policyWeights))throw Error('Invalid paired mutation');next.push(child,mirror);}
        arm.genomes=next;
      }
    }
  }
  const heldoutTasks=arms.flatMap(arm=>{const best=arm.history.at(-1).best;return heldoutOffsets.map(offset=>({id:arm.id+':'+offset,genome:genomes.get(best.genomeSha256),headingOffsetRad:offset,rewardRevision:'progress-3'}));}),
    heldoutPool=await Pool.runPool(heldoutTasks,reference),heldout=heldoutTasks.map(t=>({id:t.id,headingOffsetRad:t.headingOffsetRad,...heldoutPool.results.get(t.id)}));
  const final=arms.map(arm=>({arm:arm.id,best:arm.history.at(-1).best,heldout:heldout.filter(x=>x.id.startsWith(arm.id+':'))}));
  const originalPath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveUnchanged=sha(fs.readFileSync(originalPath))===fine.save.sha256,
    sourceStable=JSON.stringify(Pool.sources())===JSON.stringify(sourceHashes),report={format:'v3-fine-motor-multistart-elitist-ab-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:saveUnchanged&&sourceStable,
      learningSucceeded:final.some(x=>x.best.aggregate.safeCount===offsets.length&&x.best.aggregate.minLaps>=2),
      settings:{population,cycles,seed,offsets,heldoutOffsets,eliteCount:4,pairedMutationDirections:6,mutationAmount:.24,steeringFactor:.003,longitudinalFactor:.03,workers:2,previousLapComparisonReference:null},
      method:'Private paired elitist neuroevolution: identical initial genotypes and RNG seeds. Both arms measure the same three physical start headings for every genotype; zero-only ranks the original start while multi-start ranks safety then minimum measured laps/progress and mean intrinsic fitness. Four elites and six signed mutation pairs form each next cycle. All neuron/vehicle dynamics and R3 rules are unchanged. No controller route, teacher actions, inherited progress or aggregate presented as an actual lap.',
      initialGenomesSha256:sha(JSON.stringify(initial)),history:arms.map(arm=>({arm:arm.id,cycles:arm.history})),final,
      evidence:{cachedMeasuredCasesFromSelection:cacheFromSelection,uniqueMeasuredCasesAfterTraining:cache.size,evaluationBatches,contextAudit,heldoutPhysicalEpisodes:heldoutTasks.length,heldoutBaselineMatches:heldoutPool.baselines.length},
      integrity:{saveUnchanged,sourceStable,sourceHashes,inputCheckpointSha256:sha(bytes),selectionReportSha256:sha(fs.readFileSync(path.join(selectionDir,'report.json')))},
      wallSeconds:(Date.now()-started)/1000,boundary:'Six private research cycles are not six app generations. Reused deterministic outcomes are listed as cached evidence, not new episodes. This comparison does not establish generalization or compatibility with the released training loop.'};
  if(!report.passed)throw Error('Training source/save integrity failed');fs.mkdirSync(out,{recursive:false});const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2),{flag:'wx'});
  for(const arm of final)fs.writeFileSync(path.join(out,arm.arm+'.private.json'),JSON.stringify({format:'private-v3-multistart-model-v1',appVersion:'5.6.0',genome:genomes.get(arm.best.genomeSha256),researchObjective:arm.arm,sourceReport:'report.json'},null,2),{flag:'wx'});
  fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('ROBUST_TRAINING_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,final,evaluationBatches,contextReplays:contextAudit.length,
    saveUnchanged,sourceStable,wallSeconds:report.wallSeconds,report:target,sha256:sha(fs.readFileSync(target))}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
