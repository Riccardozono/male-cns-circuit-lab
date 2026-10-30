'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Search=require('./neural-prior-gated-common-search.cjs').Search;
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const load=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const same=(a,b)=>assert.deepStrictEqual(a,b);
const near=(a,b)=>Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b));
function score(episode){assert.ok(episode.complete&&!episode.censored&&episode.overlap===0);const value=episode.actualNewProgress+10000*episode.actualNewLapGates;assert.ok(Number.isFinite(value));return value;}
function verify(tag='frontier-progress-only-270m-16x16-r1'){
  assert.match(tag,/^[a-z0-9-]+$/);const dir=path.join(BASE,tag),reportFile=path.join(dir,'report.json'),proofFile=path.join(dir,'verification.json');
  if(fs.existsSync(proofFile))throw Error('Preserve prior verification');
  const report=load(reportFile),identity=report.identity,preflight=load(path.join(dir,'preflight.json'));
  assert.ok(report.passed&&!report.promoted&&preflight.passed);assert.equal(identity.format,'male-cns-progress-only-frontier-research-v1');
  assert.equal(identity.objective,'actual new physical progress in metres + 10000 * actually completed new lap gates; no risk penalty or R5 fitness enters optimizer ranking');
  assert.equal(identity.population,16);assert.equal(identity.environments,4);assert.equal(identity.generations,report.iterations.length);
  assert.equal(identity.preflightSha256,hash(path.join(BASE,'frontier3-current-driver-preflight/verification.json')));
  assert.equal(identity.globalReferenceSha256,hash(path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json')));
  assert.equal(identity.parentIterationSha256,hash(path.join(BASE,'learned-prior-frontier-risk-400-16x16/iteration-008.json')));
  for(const [file,digest]of Object.entries(identity.sourceHashes))assert.equal(hash(path.join(ROOT,file)),digest,file);
  for(const [file,digest]of Object.entries(identity.sourceClosure))assert.equal(hash(file),digest,file);
  const parent=identity.parentGenes;assert.equal(parent.length,16);same(preflight.parentHistory.result,identity.parentPracticeResult);
  assert.equal(preflight.parentHistory.actionTraceSha256,preflight.parentReplay[0].actionTraceSha256);
  same(report.baselineFull.result,preflight.baselineFull.result);
  let optimizer=new Search({mean:parent,sigma:identity.sigma,population:identity.population,seed:identity.seed});
  let best={genes:parent,episode:preflight.parentReplay[0]},count=0,controls=0;const recordHashes={};
  for(let generation=1;generation<=identity.generations;generation++){
    const suffix=String(generation).padStart(3,'0'),asked=load(path.join(dir,`asked-${suffix}.json`)),event=load(path.join(dir,`iteration-${suffix}.json`));
    const genes=optimizer.ask(asked.protectedElite);same(genes,asked.genes);same(genes[0],asked.protectedElite);assert.equal(event.generation,generation);assert.equal(event.evaluated.length,16);
    const scores=[];
    for(let index=0;index<16;index++){
      const row=event.evaluated[index],episode=row.episode;assert.equal(row.candidate,index);assert.equal(row.environment,index%4);same(row.genes,genes[index]);
      assert.equal(episode.validationMode,'restored-prior-checkpoint');assert.equal(episode.episodeStart.kind,'actual-neuronal-prefix');assert.equal(episode.episodeStart.laps,1);
      assert.equal(episode.actualNewControls,episode.result.controls-episode.episodeStart.controls);
      assert.ok(near(episode.actualNewProgress,episode.result.bestProgress-episode.episodeStart.progress));
      assert.equal(episode.actualNewLapGates,episode.result.laps-episode.episodeStart.laps);
      scores.push(score(episode));count++;controls+=episode.actualNewControls;if(scores[index]>score(best.episode)+1e-9)best=row;
    }
    same(scores,event.scores);optimizer.tell(scores);same(JSON.parse(JSON.stringify(optimizer.state())),event.optimizerState);
    recordHashes[`asked-${suffix}.json`]=hash(path.join(dir,`asked-${suffix}.json`));recordHashes[`iteration-${suffix}.json`]=hash(path.join(dir,`iteration-${suffix}.json`));
  }
  same(best,report.bestPractice);assert.equal(count,identity.generations*16);assert.equal(count,report.actualCandidateEpisodes);
  assert.equal(controls,report.actualNewCandidateControls);
  for(const row of report.fullEvaluations){assert.equal(row.episode.validationMode,'full-from-line');assert.equal(row.episode.episodeStart.laps,0);}
  const proof={passed:true,format:'male-cns-progress-only-frontier-cma-verification-v1',reportSha256:hash(reportFile),verifierSha256:hash(__filename),
    actualRecordedCandidateEpisodes:count,actualRecordedNewCandidateControls:controls,reconstructedCmaGenerations:identity.generations,
    selectedPracticeProgress:best.episode.actualNewProgress,selectedPracticeReason:best.episode.result.reason,
    eligibleForIndependentNativeProof:report.eligibleForIndependentNativeProof,promoted:false,recordHashes,
    boundary:'Reconstructs deterministic CMA candidate generation, actual replay records and progress-only optimizer score. It is not independent physical validation. No risk or R5 score enters candidate ranking; crash exploration is never promotion. Qualification still requires clean full-from-line raw-physics proof and separate native verification.'};
  fs.writeFileSync(proofFile,JSON.stringify(proof,null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,episodes:count,controls,selectedProgress:proof.selectedPracticeProgress,reason:proof.selectedPracticeReason,eligible:proof.eligibleForIndependentNativeProof,verification:proofFile}));
  return proof;
}
if(require.main===module)verify(process.argv[2]);module.exports={verify,score};
