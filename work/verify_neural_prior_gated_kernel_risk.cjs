'use strict';
// Deterministically verify the recorded CMA evolution, risk score and provenance.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Search=require('./neural-prior-gated-common-search.cjs').Search;
const R8=require('./neural-prior-training-objective-r8.cjs');
const Identity=require('./neural-research-source-identity.cjs');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl');
const fileHash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex');
const hashAbsolute=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const load=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const equal=(a,b,label)=>assert.deepStrictEqual(a,b,label);
const near=(a,b)=>Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b));
function score(episode,reference){
  assert.ok(episode.complete&&!episode.censored&&episode.overlap===0);
  assert.equal(episode.riskMultiplier,1200);
  assert.equal(episode.riskReferenceExposure,reference);
  assert.ok(episode.riskExposure>=0);
  const excess=Math.max(0,episode.riskExposure-reference);
  assert.ok(near(episode.riskExcess,excess));
  const expected=R8.fitness(episode.result)-1200*excess;
  assert.ok(near(episode.trainingFitness,expected));
  return episode.trainingFitness;
}
function verify(tag){
  assert.match(tag,/^[a-z0-9-]+$/);
  const dir=path.join(BASE,tag),reportFile=path.join(dir,'report.json'),verifyFile=path.join(dir,'verification.json');
  if(fs.existsSync(verifyFile))throw Error('Preserve existing numeric verification');
  const report=load(reportFile),id=report.identity,preflight=load(path.join(dir,'preflight.json'));
  assert.ok(report.passed&&!report.promoted&&preflight.passed);
  assert.equal(id.format,'male-cns-baseline-relative-risk-training-v1');assert.equal(id.riskMultiplier,1200);
  assert.equal(id.generations,report.iterations.length);assert.equal(id.population,16);assert.equal(id.environments,4);
  assert.equal(id.modelSha256,fileHash('.impeccable/review/neural-sacl/driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json'));
  assert.equal(id.preflightSha256,fileHash('.impeccable/review/neural-sacl/frontier3-current-driver-preflight/verification.json'));
  assert.equal(id.globalReferenceSha256,fileHash('.impeccable/review/neural-sacl/neuronal-coordinate-feedback8-first/independent-native.json'));
  assert.equal(id.riskCalibrationReportSha256,fileHash('.impeccable/review/neural-sacl/reward-breakdown-v1/report.json'));
  for(const [file,digest] of Object.entries(id.sourceHashes))assert.equal(fileHash(file),digest,file);
  for(const [file,digest] of Object.entries(id.sourceClosure))assert.equal(hashAbsolute(file),digest,file);
  const reference=preflight.riskReference.referenceExposure;
  assert.ok(near(reference,preflight.practices[0].riskExposure));
  assert.equal(report.baselineFull.actionTraceSha256,preflight.baselineFull.actionTraceSha256);
  const expected=load(path.join(BASE,'frontier3-current-driver-preflight/verification.json')).baseline;
  equal(report.baselineFull.result,expected.result,'full-line baseline result');
  equal(report.baselineFull.actionTraceSha256,expected.actionTraceSha256,'full-line baseline trace');
  let optimizer=new Search({mean:Array(16).fill(0),sigma:.7,population:16,seed:181026});
  let best={genes:Array(16).fill(0),episode:preflight.practices[0]},episodes=0,controls=0,records={};
  try{
    for(let generation=1;generation<=id.generations;generation++){
      const asked=load(path.join(dir,`asked-${String(generation).padStart(3,'0')}.json`));
      const event=load(path.join(dir,`iteration-${String(generation).padStart(3,'0')}.json`));
      const genes=optimizer.ask(asked.protectedElite);
      equal(genes,asked.genes,`CMA genes generation ${generation}`);equal(genes[0],asked.protectedElite,`protected elite generation ${generation}`);
      assert.equal(event.generation,generation);assert.equal(event.evaluated.length,16);
      const scores=[];
      for(let index=0;index<16;index++){
        const row=event.evaluated[index];assert.equal(row.candidate,index);assert.equal(row.environment,index%4);equal(row.genes,genes[index]);
        const e=row.episode;assert.equal(e.validationMode,'restored-prior-checkpoint');assert.equal(e.episodeStart.laps,1);
        assert.equal(e.episodeStart.kind,'actual-neuronal-prefix');assert.equal(e.actualNewControls,e.result.controls-e.episodeStart.controls);
        assert.ok(near(e.actualNewProgress,e.result.bestProgress-e.episodeStart.progress));
        assert.equal(e.actualNewLapGates,e.result.laps-e.episodeStart.laps);
        scores.push(score(e,reference));episodes++;controls+=e.actualNewControls;
        if(scores[index]>score(best.episode,reference)+1e-9)best=row;
      }
      equal(scores,event.scores,`CMA scores generation ${generation}`);
      optimizer.tell(scores);
      equal(JSON.parse(JSON.stringify(optimizer.state())),event.optimizerState,`CMA state generation ${generation}`);
      records[`asked-${String(generation).padStart(3,'0')}.json`]=hashAbsolute(path.join(dir,`asked-${String(generation).padStart(3,'0')}.json`));
      records[`iteration-${String(generation).padStart(3,'0')}.json`]=hashAbsolute(path.join(dir,`iteration-${String(generation).padStart(3,'0')}.json`));
    }
  } finally { optimizer=null; }
  equal(best,report.bestPractice,'selected risk-ranked practice policy');
  assert.equal(episodes,report.actualCandidateEpisodes);assert.equal(episodes,id.generations*16);
  assert.equal(controls,report.actualNewCandidateControls);
  for(const row of report.fullEvaluations){assert.equal(row.episode.validationMode,'full-from-line');assert.equal(row.episode.episodeStart.laps,0);score(row.episode,reference);}
  if(report.bestGlobalCandidate){assert.ok(report.fullProofs.length===2);for(const e of report.fullProofs)score(e,reference);}
  const proof={passed:true,format:'male-cns-risk-relative-cma-verification-v1',reportSha256:hashAbsolute(reportFile),
    verifierSha256:hashAbsolute(__filename),actualRecordedCandidateEpisodes:episodes,actualRecordedNewCandidateControls:controls,
    reconstructedCmaGenerations:id.generations,baselineRiskReference:reference,selectedPracticeRiskExcess:report.bestPractice.episode.riskExcess,
    sourceRecordHashes:records,eligibleForIndependentNativeProof:report.eligibleForIndependentNativeProof,promoted:false,
    boundary:'Verifies the exact recorded CMA ask/tell trajectory and risk-calibrated score arithmetic. Physical candidate outcomes are those in the report; this does not rerun every candidate or demonstrate generalization beyond V3 Monza.'};
  fs.writeFileSync(verifyFile,JSON.stringify(proof,null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,episodes,controls,selected:report.bestPractice.episode.result,
    riskExcess:report.bestPractice.episode.riskExcess,eligible:report.eligibleForIndependentNativeProof,verification:verifyFile}));
}
if(require.main===module)verify(process.argv[2]||'learned-prior-risk-relative-1200-16x16-r2');
module.exports={verify};
