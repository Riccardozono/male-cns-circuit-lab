'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),read=file=>JSON.parse(fs.readFileSync(file,'utf8')),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'],checks=[];
function check(name,fn){fn();checks.push({name,passed:true});}
function sources(hashes,allowed=[]){for(const [f,h]of Object.entries(hashes))if(!allowed.includes(f))assert.equal(sha(path.join(root,f)),h,f);}
function native(report,expectedTrace){
  assert.equal(report.nativeVerifications.length,2);const model=report.exportedModelFile;
  for(const n of report.nativeVerifications){assert.equal(n.passed,true);assert.equal(n.complete,true);assert.equal(n.overlap,0);assert.equal(n.modelSha256,sha(model));assert.equal(n.actionTraceSha256,expectedTrace);for(const k of fields)assert.equal(n.result[k],report.result?.[k]??report.fullChampion.result[k]);}
}
const run=read(path.join(base,'progressive-3652-first/run.json'));
check('Six complete progressive cycles, immutable reports and unchanged inference sources',()=>{
  assert.equal(run.status,'finished');assert.equal(run.stages.length,6);assert.equal(run.twoLapsAchieved,false);
  for(const stage of run.stages){assert.equal(sha(stage.reportFile),stage.reportSha256);const r=read(stage.reportFile);assert.equal(r.passed,true);assert.equal(r.records.length,stage.evaluations);sources(r.identity.sourceHashes,['work/train_progressive_context.py','work/neuronal_experiment_io.py']);if(r.improved)native(r,r.validations.at(-1).full.actionTraceSha256);else assert.equal(r.nativeVerifications.length,0);}
  assert.ok(run.sourceRevisions.every(rev=>rev.changed.every(f=>['work/train_progressive_context.py','work/neuronal_experiment_io.py'].includes(f))));
});
const projected=read(path.join(base,'projected-frontier-3680/report.json')),blocks=read(path.join(base,'projected-block-3680/report.json'));
check('Eight-axis projected experiment passed exact independent native command traces',()=>{assert.equal(projected.passed,true);assert.equal(projected.phase,'finished');assert.equal(projected.records.length,128);sources(projected.identity.sourceHashes);native(projected,projected.fullChampion.actionTraceSha256);});
check('Block exploration starts from that exact verified model and also passed native full traces',()=>{assert.equal(blocks.passed,true);assert.equal(blocks.phase,'finished');assert.equal(blocks.records.length,128);assert.equal(blocks.identity.sourceReportSha256,sha(path.join(base,'projected-frontier-3680/report.json')));sources(blocks.identity.sourceHashes);for(const k of fields)assert.equal(blocks.baselineFull.result[k],projected.fullChampion.result[k]);native(blocks,blocks.fullChampion.actionTraceSha256);});
check('The compatible16-agent shareable file is verified independently from the research-only decoder',()=>{const p=read(path.join(base,'progressive-native-save/verification.json'));assert.equal(p.passed,true);assert.equal(p.sha256,sha(p.file));assert.equal(p.restoredCars,16);assert.equal(p.paused,true);assert.equal(p.completedEpisodes,0);assert.equal(p.generation,1);assert.equal(p.sourceResult.bestProgress,run.bestResult.bestProgress);});
const censored=[...run.stages.flatMap(s=>read(s.reportFile).records),...projected.records,...blocks.records].filter(r=>r.episode.censored).length;
const report={passed:true,checks,candidateEvaluations:run.stages.reduce((s,r)=>s+r.evaluations,0)+projected.records.length+blocks.records.length,censoredCandidates:censored,
  progressive:run.bestResult,projected:Object.fromEntries(fields.map(k=>[k,projected.fullChampion.result[k]])),blocks:Object.fromEntries(fields.map(k=>[k,blocks.fullChampion.result[k]])),
  twoLapsAchieved:blocks.fullChampion.result.laps===2,boundary:'Evidence reconciliation of executed research only. Current best is V3/Monza, not all models/tracks, not converged or a two-lap success. The projected decoder is not installed into the older grown Windows copy; the separate projected18 copy has its own Windows/integrity evidence. Existing grown-compatible save is a separate warmed generation1,16-car paused file; no cached practice imported as completed app generations.'};
const out=path.join(base,'progressive-research-verification');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
