'use strict';

// Correctly distinguish a non-crash distance uptick from progress toward the
// actual two-lap objective. This is a read-only interpretation of a completed
// benchmark report; it does not rerun or alter any model.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'.impeccable/review/neural-gated-affine-motor-20261020-01');
const source=path.join(dir,'paired-full-episodes.json'),target=path.join(dir,'interpretation.json');
if(fs.existsSync(target))throw Error('Il report di interpretazione esiste già; non verrà sovrascritto.');
const report=JSON.parse(fs.readFileSync(source,'utf8'));
assert.equal(report.results.length,9);assert.equal(report.modelUnchanged,true);
const baseline=report.results[0];
assert.equal(baseline.laps,1);assert.equal(baseline.bestProgress,report.verifiedAnchor.bestProgress);
const progressOnlyNonCrash=report.results.slice(1).filter(r=>r.complete&&!r.censored&&r.laps>=baseline.laps&&r.bestProgress>baseline.bestProgress+1e-6&&!['urto','fuori pista'].includes(r.reason));
const twoLapImprovements=report.results.slice(1).filter(r=>r.complete&&!r.censored&&r.laps>=2&&r.fitness>baseline.fitness&&!['urto','fuori pista'].includes(r.reason));
const sameLapFaster=report.results.slice(1).filter(r=>r.complete&&!r.censored&&r.laps>=baseline.laps&&r.fitness>baseline.fitness&&r.lapTimes.length>=baseline.lapTimes.length&&Math.min(...r.lapTimes)<Math.min(...baseline.lapTimes));
const result={passed:true,sourceReport:path.relative(root,source),sourceReportPassed:report.passed,modelUnchanged:report.modelUnchanged,
  objective:'complete at least two genuine laps from the verified V3/Monza start, without collision/off-track termination, while improving fitness',
  baseline:{bestProgress:baseline.bestProgress,laps:baseline.laps,fitness:baseline.fitness,bestLapTime:Math.min(...baseline.lapTimes),reason:baseline.reason},
  progressOnlyNonCrash:progressOnlyNonCrash.map(r=>({label:r.label,progressDelta:r.bestProgress-baseline.bestProgress,laps:r.laps,fitnessDelta:r.fitness-baseline.fitness,reason:r.reason})),
  twoLapImprovements:twoLapImprovements.map(r=>({label:r.label,bestProgress:r.bestProgress,laps:r.laps,fitness:r.fitness,reason:r.reason})),
  sameLapFaster:sameLapFaster.map(r=>({label:r.label,bestLapTime:Math.min(...r.lapTimes),fitness:r.fitness})),
  conclusion:twoLapImprovements.length||sameLapFaster.length?'A candidate met a strict improvement criterion.':'No tested candidate improves the learned result: none completes two laps, and none has a faster lap with higher fitness.',
  note:'The one non-crash distance-only candidate gained less than 1 m, stopped without progress, and had lower fitness; it is not counted as learning improvement.'};
fs.writeFileSync(target,JSON.stringify(result,null,2),{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({...result,interpretationFile:target}));
