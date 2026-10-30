'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),learning=path.join(root,'.impeccable/review/learning-ml');
const ranges=[[0,25],[25,50],[50,75],[75,100]],out=path.join(learning,'replay-saved-v3-population-gen129-complete-20261022-01');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function main(){
  if(fs.existsSync(out))throw Error('Preserve prior merged report');
  const reports=ranges.map(([start,end])=>JSON.parse(fs.readFileSync(path.join(learning,`replay-saved-v3-population-gen129-${start}-${end}-20261022-01/report.json`),'utf8')));
  for(let i=0;i<ranges.length;i++)assert.deepEqual(reports[i].batch,{start:ranges[i][0],end:ranges[i][1]});
  assert.ok(reports.every(r=>r.passed&&r.input.sha256===reports[0].input.sha256&&JSON.stringify(r.sourceHashes)===JSON.stringify(reports[0].sourceHashes)),'Batch integrity/hash mismatch');
  const results=reports.flatMap(r=>r.results).sort((a,b)=>a.index-b.index);assert.equal(results.length,100);
  assert.deepEqual(results.map(r=>r.index),Array.from({length:100},(_,i)=>i),'Batch ranges must cover every saved genome exactly once');
  assert.ok(Math.abs(results[0].progressM-801.1207621478061)<1e-9,'Exact saved-parent replay mismatch');
  const safe=results.filter(r=>r.safe).sort((a,b)=>b.laps-a.laps||b.progressM-a.progressM),unsafe=results.filter(r=>!r.safe).sort((a,b)=>b.progressM-a.progressM),inputPath=reports[0].input.file;
  const inputUnchanged=sha(fs.readFileSync(inputPath))===reports[0].input.sha256;
  const report={format:'male-cns-v3-monza-saved-population-replay-v1',appVersion:'5.6.0',passed:inputUnchanged&&reports.every(r=>r.sourceFilesUnchanged),learningSucceeded:safe.some(r=>r.laps>=2),
    input:reports[0].input,settings:{runtime:'4 independent Node 24.19.0 CPU batches',sameSavedSeed:true,changedWeights:false,changedPhysics:false,changedReward:false,changedController:false},
    summary:{replayed:results.length,safeCount:safe.length,unsafeCount:unsafe.length,bestSafe:safe[0]||null,bestUnsafe:unsafe[0]||null,safeLapCount:safe.filter(r=>r.laps>0).length},
    batches:ranges.map((range,i)=>({range,passed:reports[i].passed,sourceFilesUnchanged:reports[i].sourceFilesUnchanged})),results,
    sourceHashes:reports[0].sourceHashes,inputUnchanged,sourceFilesUnchanged:reports.every(r=>r.sourceFilesUnchanged),
    method:'Merge four disjoint deterministic CPU replays of the saved population. Every genome started on the same Monza start under unchanged V3 physics/reward and mutation disabled; collisions between agents are absent in this simulator.',
    boundary:'Complete evaluation of one saved V3/Monza gen.129 population, one circuit and one seed. It identifies whether a better safe genotype was already present, not whether a generation learned or generalizes.'};
  assert.ok(report.passed);fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('V3_POPULATION_MERGED '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,summary:report.summary,report:path.join(out,'report.json')}));
}
try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
