'use strict';
// Reconstruct optimizer RNG from its actual evaluated-parameter record, NOT
// from an episode/action tape. No simulation or reward is invented/replayed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{rng}=require('../outputs/simulation.js');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.impeccable/review/neural-sacl/neural-diversity-first'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {Archive}=require('../.impeccable/review/neural-sacl/neural-diversity-first/source/neural-diversity.cjs'),reportBytes=fs.readFileSync(path.join(directory,'report.json')),report=JSON.parse(reportBytes),sourceBytes=fs.readFileSync(path.join(root,'.impeccable/review/neural-sacl/frontier-linear-cma-first/report.json')),source=JSON.parse(sourceBytes);
if(!report.passed||!source.passed||hash(sourceBytes)!==report.identity.ownSeedReportSha256)throw Error('Actual own verified record required');
const r=(weights,episode)=>({weights,fitness:episode.result.fitness,progress:episode.result.bestProgress,laps:episode.result.laps,reason:episode.result.reason,censored:episode.censored,overlap:episode.gasBrakeOverlapSteps});
const a=new Archive(report.state),random=rng(151020);a.offer(r(source.champion.weights,source.fullChampion));source.records.forEach(row=>a.offer(r(row.weights,row.episode)));
for(const h of report.history){
  const actual=report.records.filter(row=>row.generation===h.generation),proposed=a.ask(random);
  if(actual.length!==proposed.length)throw Error('Incomplete recorded population');
  for(let i=0;i<actual.length;i++)if(JSON.stringify(actual[i].weights)!==JSON.stringify(proposed[i].weights))throw Error('Optimizer sequence differs at '+h.generation+'/'+i);
  actual.forEach(row=>a.offer(r(row.weights,row.episode)));
}
const state=a.snapshot();if(JSON.stringify(state)!==JSON.stringify(report.state))throw Error('Final recorded archive differs');
const output={format:'male-cns-private-optimizer-recovery',schema:1,sourceReportSha256:hash(reportBytes),state,randomState:random.getState(),recoveredGenerations:report.history.length,recoveredCandidates:report.records.length,
  boundary:'Every proposed weight vector and final optimizer cell matches the actual prior record exactly. This reconstructs a parameter-search RNG only. No stored driving actions, synthetic vehicle poses, new transitions, regenerated rewards or awarded laps.'};
if(fs.existsSync(path.join(directory,'optimizer-recovery.json')))throw Error('Preserve existing recovery');fs.writeFileSync(path.join(directory,'optimizer-recovery.json'),JSON.stringify(output,null,2));
console.log('DIVERSITY_OPTIMIZER_RECOVERED '+JSON.stringify({generations:output.recoveredGenerations,candidates:output.recoveredCandidates,cells:state.cells.length,randomState:output.randomState}));
