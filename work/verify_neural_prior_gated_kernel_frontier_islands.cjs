'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'.impeccable/review/neural-sacl'),DIR=path.join(BASE,'frontier-multistart-progress-only-r1');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),load=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const same=(a,b)=>assert.deepStrictEqual(a,b),near=(a,b)=>Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b));
function score(e){assert.ok(e.complete&&!e.censored&&e.overlap===0);const v=e.actualNewProgress+10000*e.actualNewLapGates;assert.ok(Number.isFinite(v));return v;}
function verify(){const reportFile=path.join(DIR,'report.json'),proofFile=path.join(DIR,'verification.json');if(fs.existsSync(proofFile))throw Error('Preserve prior verification');
  const report=load(reportFile),id=report.identity,preflight=load(path.join(DIR,'preflight.json'));assert.ok(report.passed&&!report.promoted&&preflight.passed);
  assert.equal(id.format,'male-cns-multistart-progress-only-random-search-v1');assert.equal(id.candidateEpisodes,68);assert.equal(id.islands,4);assert.equal(id.offspringPerIsland,16);
  assert.equal(id.preflightSha256,hash(path.join(BASE,'frontier3-current-driver-preflight/verification.json')));
  assert.equal(id.globalReferenceSha256,hash(path.join(BASE,'neuronal-coordinate-feedback8-first/independent-native.json')));
  assert.equal(id.priorVerificationSha256,hash(path.join(BASE,'learned-prior-frontier-risk-400-16x16/verification.json')));
  for(const [file,digest]of Object.entries(id.sourceHashes))assert.equal(hash(path.join(ROOT,file)),digest,file);
  for(const [file,digest]of Object.entries(id.sourceClosure))assert.equal(hash(file),digest,file);
  const priorDir=path.join(BASE,'learned-prior-frontier-risk-400-16x16'),priorRows=[];
  for(const name of fs.readdirSync(priorDir).filter(name=>/^iteration-\d{3}\.json$/.test(name)).sort())for(const row of load(path.join(priorDir,name)).evaluated)
    priorRows.push({...row,sourceFile:name,sourceHash:hash(path.join(priorDir,name))});
  priorRows.sort((a,b)=>b.episode.actualNewProgress-a.episode.actualNewProgress);const selectedParents=[];
  for(const row of priorRows){let distant=true;for(const parent of selectedParents){let squared=0;for(let i=0;i<16;i++)squared+=(row.genes[i]-parent.genes[i])**2;if(Math.sqrt(squared)<.35){distant=false;break;}}
    if(distant)selectedParents.push(row);if(selectedParents.length===4)break;}
  assert.equal(selectedParents.length,4);for(let lane=0;lane<4;lane++){
    const chosen=selectedParents[lane],recorded=id.parents[lane];assert.equal(recorded.sourceFile,chosen.sourceFile);assert.equal(recorded.sourceHash,chosen.sourceHash);
    assert.equal(recorded.candidate,chosen.candidate);same(recorded.genes,chosen.genes);assert.ok(near(recorded.priorProgress,chosen.episode.actualNewProgress));
  }
  assert.equal(report.parentReplays.length,4);assert.equal(report.branches.length,4);same(report.baselineFull.result,preflight.baselineFull.result);
  let rng=id.seed>>>0,spare=null;function uniform(){rng=(Math.imul(1664525,rng)+1013904223)>>>0;return(rng+.5)/4294967296;}
  function normal(){if(spare!==null){const x=spare;spare=null;return x;}const r=Math.sqrt(-2*Math.log(uniform())),theta=2*Math.PI*uniform();spare=r*Math.sin(theta);return r*Math.cos(theta);}
  function mutate(mean){const cs=normal(),cl=normal();return mean.map((v,i)=>Math.max(-4,Math.min(4,v+id.sigma*(i%2===0?.4:1)*(Math.sqrt(id.withinMotorCorrelation)*(i%2===0?cs:cl)+Math.sqrt(1-id.withinMotorCorrelation)*normal()))));}
  let count=0,controls=0;const expected=[];
  for(let lane=0;lane<4;lane++){
    const branch=report.branches[lane],parent=id.parents[lane];assert.equal(branch.lane,lane);assert.equal(branch.evaluations.length,17);
    const replay=report.parentReplays[lane];assert.equal(replay.lane,lane);same(replay.genes,parent.genes);same(replay.episode.result,branch.evaluations[0].episode.result);
    for(let index=0;index<17;index++){
      const row=branch.evaluations[index];assert.equal(row.candidate,index);let genes;
      if(index===0){genes=parent.genes;same(genes,row.genes);}else{genes=mutate(parent.genes);same(genes,row.genes);}
      assert.equal(row.episode.validationMode,'restored-prior-checkpoint');assert.equal(row.episode.episodeStart.kind,'actual-neuronal-prefix');
      assert.equal(row.episode.actualNewControls,row.episode.result.controls-row.episode.episodeStart.controls);
      assert.ok(near(row.episode.actualNewProgress,row.episode.result.bestProgress-row.episode.episodeStart.progress));
      assert.equal(row.episode.actualNewLapGates,row.episode.result.laps-row.episode.episodeStart.laps);assert.ok(near(row.score,score(row.episode)));
      count+=Number(index>0);controls+=index>0?row.episode.actualNewControls:0;
      expected.push({...row,lane,sourceFile:branch.parent.sourceFile});
    }
  }
  expected.sort((a,b)=>b.score-a.score);same(report.bestPractice,expected[0]);assert.equal(count,64);assert.equal(report.actualCandidateEpisodes,count);assert.equal(report.actualNewCandidateControls,controls);
  assert.equal(report.fullEvaluation.validationMode,'full-from-line');assert.equal(report.fullEvaluation.episodeStart.laps,0);
  const proof={passed:true,format:'male-cns-multistart-progress-only-verification-v1',reportSha256:hash(reportFile),verifierSha256:hash(__filename),
    actualCandidateEpisodes:count,actualNewCandidateControls:controls,independentParentReplays:report.parentReplays.length,
    selectedPracticeProgress:report.bestPractice.episode.actualNewProgress,selectedPracticeReason:report.bestPractice.episode.result.reason,
    fullFromLineResult:report.fullEvaluation.result,eligibleForIndependentNativeProof:report.eligibleForIndependentNativeProof,promoted:false,
    boundary:'Reconstructs deterministic parent selection and fixed-noise mutations, checks all recorded simulator episodes and objective arithmetic. It is not an independent physical replay; any collision candidate remains ineligible for promotion.'};
  fs.writeFileSync(proofFile,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,episodes:count,controls,bestProgress:proof.selectedPracticeProgress,reason:proof.selectedPracticeReason,eligible:proof.eligibleForIndependentNativeProof,verification:proofFile}));return proof;
}
if(require.main===module)verify();module.exports={verify,score};
