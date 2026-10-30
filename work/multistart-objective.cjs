'use strict';
function aggregate(results){
  if(!Array.isArray(results)||!results.length||results.some(x=>typeof x.safe!=='boolean'||!Number.isFinite(x.fitness)||!Number.isFinite(x.progressM)||x.progressM<0||!Number.isInteger(x.laps)||x.laps<0))throw Error('Complete measured outcomes required');
  return {safeCount:results.filter(x=>x.safe&&!x.censored).length,caseCount:results.length,minLaps:Math.min(...results.map(x=>x.laps)),
    minProgressM:Math.min(...results.map(x=>x.progressM)),meanFitness:results.reduce((s,x)=>s+x.fitness,0)/results.length};
}
function compare(a,b){
  if(a.caseCount!==b.caseCount)throw Error('Cannot rank different evaluation budgets');
  return b.safeCount-a.safeCount||b.minLaps-a.minLaps||(Math.abs(b.minProgressM-a.minProgressM)>1e-9?b.minProgressM-a.minProgressM:0)||b.meanFitness-a.meanFitness;
}
module.exports={aggregate,compare};
