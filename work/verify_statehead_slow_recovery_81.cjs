'use strict';
// Independently re-read the recorded evidence; this does not rerun the GPU.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const runDir=path.join(base,'statehead-frontier-causalcritic-16ep-gae1-distance5-ppo-4up-20261026-79');
const analysisPath=path.join(base,'statehead-slow-termination-tail-analysis-20261026-80/report.json');
const reportPath=path.join(base,'statehead-moving-slow-recovery-paired-20261026-81/report.json');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=(condition,message)=>{if(!condition)throw Error(message);};
const analysis=read(analysisPath),report=read(reportPath),run=read(path.join(runDir,'report.json'));
const targets=analysis.slowEpisodes.filter(e=>e.bestProgress<50);
const originals=run.events.flatMap(e=>e.episodeSummaries);
check(report.analysisSha256===sha(analysisPath),'Analysis identity mismatch');
check(report.sourceRunSha256===sha(path.join(runDir,'report.json')),'Run identity mismatch');
check(report.originalSaveSha256===sha(savePath),'Original save identity mismatch');
check(targets.length===7&&report.pairs.length===7,'Expected seven matching early episodes');
check(analysis.reasonCounts['troppo lenta / senza progresso']===17,'Expected 17 slow terminations');
for(const [relative,digest] of Object.entries(report.sourceHashes))
  check(sha(path.join(root,relative))===digest,'Source changed: '+relative);
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
for(const p of report.pairs){
  const target=targets.find(e=>e.seed===p.seed&&e.sign===p.sign);
  const original=originals.find(e=>e.seed===p.seed&&e.sign===p.sign);
  check(target&&original,'Missing original episode');
  check(p.control.traceSha256===target.traceSha256&&target.traceSha256===original.traceSha256,'Control trace mismatch');
  check(JSON.stringify(p.control.result)===JSON.stringify(original.result),'Control result mismatch');
  check(p.control.prefixTraceSha256===p.treatment.prefixTraceSha256&&p.prefixMatches,'Prefix mismatch');
  check(p.firstResumeMatchesControlStop&&p.resumeEvents.length===1,'Unexpected recovery count');
  const event=p.resumeEvents[0],physical=p.control.finalPhysical;
  for(const k of ['x','y','heading','bestProgress','lifetime'])check(near(event[k],physical[k]),'Stop pose mismatch '+k);
  check(JSON.stringify(event.commands)===JSON.stringify(physical.outputs),'Control mismatch at stop');
  check(event.speedMps>=event.minimumMps&&event.stepAdvance>0,'Recovery condition not met');
  check(event.slowPenaltyRetained===1400,'Slow penalty not retained');
  check(p.treatment.result.bestProgress>100&&!p.treatment.censored,'Continuation incomplete');
}
check(report.gpu.calls===report.gpu.gpuCalls&&report.gpu.gpuCalls===6018&&report.gpu.cpuFallbacks===0,'CUDA provenance mismatch');
const summary={episodes:report.pairs.length,continued:report.pairs.filter(p=>p.resumeEvents.length).length,
  safe:report.pairs.filter(p=>p.treatment.safe).length,collisions:report.pairs.filter(p=>p.treatment.result.reason==='urto').length,
  laps:report.pairs.reduce((n,p)=>n+p.treatment.result.laps,0),maxProgressM:Math.max(...report.pairs.map(p=>p.treatment.result.bestProgress))};
check(summary.safe===4&&summary.collisions===3&&summary.laps===0,'Recomputed outcome differs');
const output={passed:true,reportSha256:sha(reportPath),analysisSha256:sha(analysisPath),runSha256:sha(path.join(runDir,'report.json')),
  originalSaveSha256:sha(savePath),verifiedSourceCount:Object.keys(report.sourceHashes).length,summary,
  boundary:'Independent readback and source/hash checks, not a second physical or learning experiment.'};
const out=path.join(path.dirname(reportPath),'verification.json');
fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({verification:out,sha256:sha(out),...output}));
