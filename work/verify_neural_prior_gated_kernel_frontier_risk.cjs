'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Search=require('./neural-prior-gated-common-search.cjs').Search,R8=require('./neural-prior-training-objective-r8.cjs'),Identity=require('./neural-research-source-identity.cjs');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const absoluteHash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),relativeHash=f=>absoluteHash(path.join(ROOT,f)),load=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const equal=(a,b,label)=>assert.deepStrictEqual(a,b,label),near=(a,b)=>Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b));
function episodeScore(e,reference){assert.ok(e.complete&&!e.censored&&e.overlap===0);assert.equal(e.riskMultiplier,1200);assert.equal(e.riskReferenceExposure,reference);
  const excess=Math.max(0,e.riskExposure-reference);assert.ok(near(e.riskExcess,excess));assert.ok(near(e.trainingFitness,R8.fitness(e.result)-1200*excess));
  return e.actualNewProgress+10000*e.actualNewLapGates-400*excess;}
function verify(tag='learned-prior-frontier-risk-400-16x16'){
  assert.match(tag,/^[a-z0-9-]+$/);const dir=path.join(BASE,tag),reportFile=path.join(dir,'report.json'),proofFile=path.join(dir,'verification.json');if(fs.existsSync(proofFile))throw Error('Preserve prior verification');
  const report=load(reportFile),id=report.identity,preflight=load(path.join(dir,'preflight.json'));assert.ok(report.passed&&!report.promoted&&preflight.passed);
  assert.equal(id.format,'male-cns-risk-aware-frontier-exploration-v1');assert.equal(id.riskCost,400);assert.equal(id.population,16);assert.equal(id.environments,4);assert.equal(id.generations,report.iterations.length);
  assert.equal(id.preflightSha256,absoluteHash(path.join(BASE,'frontier3-current-driver-preflight/verification.json')));
  assert.equal(id.globalReferenceSha256,absoluteHash(path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json')));
  assert.equal(id.riskCalibrationSha256,absoluteHash(path.join(BASE,'reward-breakdown-v1/report.json')));
  assert.equal(id.modelSha256,absoluteHash(path.join(BASE,'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json')));
  for(const [f,d]of Object.entries(id.sourceHashes))assert.equal(relativeHash(f),d,f);
  for(const [f,d]of Object.entries(id.sourceClosure))assert.equal(absoluteHash(f),d,f);
  const reference=preflight.riskReference.referenceExposure;equal(report.baselineFull.result,load(path.join(BASE,'frontier3-current-driver-preflight/verification.json')).baseline.result);
  let optimizer=new Search({mean:Array(16).fill(0),sigma:.7,population:16,seed:181026}),best={genes:Array(16).fill(0),episode:preflight.baselinePractice[0]},n=0,controls=0,recordHashes={};
  try{for(let g=1;g<=id.generations;g++){const suffix=String(g).padStart(3,'0'),asked=load(path.join(dir,`asked-${suffix}.json`)),event=load(path.join(dir,`iteration-${suffix}.json`));
    const genes=optimizer.ask(asked.protectedElite);equal(genes,asked.genes,`genes ${g}`);equal(genes[0],asked.protectedElite,`elite ${g}`);assert.equal(event.generation,g);assert.equal(event.evaluated.length,16);const scores=[];
    for(let j=0;j<16;j++){const row=event.evaluated[j],e=row.episode;assert.equal(row.candidate,j);assert.equal(row.environment,j%4);equal(row.genes,genes[j]);
      assert.equal(e.validationMode,'restored-prior-checkpoint');assert.equal(e.episodeStart.kind,'actual-neuronal-prefix');assert.equal(e.episodeStart.laps,1);
      assert.equal(e.actualNewControls,e.result.controls-e.episodeStart.controls);assert.ok(near(e.actualNewProgress,e.result.bestProgress-e.episodeStart.progress));assert.equal(e.actualNewLapGates,e.result.laps-e.episodeStart.laps);
      scores.push(episodeScore(e,reference));n++;controls+=e.actualNewControls;if(scores[j]>episodeScore(best.episode,reference)+1e-9)best=row;}
    equal(scores,event.scores,`scores ${g}`);optimizer.tell(scores);equal(JSON.parse(JSON.stringify(optimizer.state())),event.optimizerState,`CMA state ${g}`);
    recordHashes[`asked-${suffix}.json`]=absoluteHash(path.join(dir,`asked-${suffix}.json`));recordHashes[`iteration-${suffix}.json`]=absoluteHash(path.join(dir,`iteration-${suffix}.json`));
  }}finally{optimizer=null;}
  equal(best,report.bestPractice,'best exploration policy');assert.equal(n,report.actualCandidateEpisodes);assert.equal(n,id.generations*16);assert.equal(controls,report.actualNewCandidateControls);
  for(const row of report.fullEvaluations){assert.equal(row.episode.validationMode,'full-from-line');assert.equal(row.episode.episodeStart.laps,0);episodeScore(row.episode,reference);}
  const proof={passed:true,format:'male-cns-risk-aware-frontier-cma-verification-v1',reportSha256:absoluteHash(reportFile),
    verifierSha256:absoluteHash(__filename),actualRecordedCandidateEpisodes:n,actualRecordedNewCandidateControls:controls,reconstructedCmaGenerations:id.generations,
    selectedPracticeRiskExcess:report.bestPractice.episode.riskExcess,selectedPracticeExplorationScore:episodeScore(report.bestPractice.episode,reference),
    eligibleForIndependentNativeProof:report.eligibleForIndependentNativeProof,promoted:false,recordHashes,
    boundary:'Verifies deterministic CMA ask/tell reconstruction and score arithmetic, not independent physical reruns. Exploration scores permit crash candidates; qualification remains clean full-line raw-physics proof.'};
  fs.writeFileSync(proofFile,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,episodes:n,controls,selected:report.bestPractice.episode.result,riskExcess:proof.selectedPracticeRiskExcess,eligible:proof.eligibleForIndependentNativeProof,verification:proofFile}));
}
if(require.main===module)verify(process.argv[2]);module.exports={verify};
