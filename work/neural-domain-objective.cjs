'use strict';
function aggregate(rows){
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||r.censored||![r.fitness,r.bestProgress,r.laps].every(Number.isFinite)))throw Error('Actual uncensored domain episodes required');
  const mean=key=>rows.reduce((s,r)=>s+r[key],0)/rows.length;
  return {allSafe:rows.every(r=>r.safe===true),minimumLaps:Math.min(...rows.map(r=>r.laps)),minimumProgress:Math.min(...rows.map(r=>r.bestProgress)),
    meanProgress:mean('bestProgress'),meanFitness:mean('fitness'),worstFitness:Math.min(...rows.map(r=>r.fitness))};
}
function compareSafe(a,b){
  if(a.allSafe!==b.allSafe)return a.allSafe?-1:1;
  if(a.minimumLaps!==b.minimumLaps)return b.minimumLaps-a.minimumLaps;
  if(a.minimumLaps<2&&Math.abs(a.minimumProgress-b.minimumProgress)>1e-9)return b.minimumProgress-a.minimumProgress;
  if(a.meanFitness!==b.meanFitness)return b.meanFitness-a.meanFitness;
  return b.meanProgress-a.meanProgress;
}
const researchScore=a=>a.worstFitness+.1*a.meanFitness;
module.exports={aggregate,compareSafe,researchScore};
