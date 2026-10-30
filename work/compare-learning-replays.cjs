'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function compare(control,candidate){
  for(const key of ['seed','population','startingGeneration','circuitId','mutation'])if(control.settings?.[key]===undefined||control.settings[key]!==candidate.settings?.[key])throw Error('Unmatched replay setting: '+key);
  if(JSON.stringify(control.policy)!==JSON.stringify(candidate.policy)||control.appVersion!==candidate.appVersion)throw Error('Unmatched policy or save version.');
  if(!control.inputIntegrity?.inputUnchanged||!candidate.inputIntegrity?.inputUnchanged||!control.inputIntegrity?.userSaveUnchanged||!candidate.inputIntegrity?.userSaveUnchanged)throw Error('An input or user save changed.');
  if(!control.inputIntegrity.inputSha256||control.inputIntegrity.inputSha256!==candidate.inputIntegrity.inputSha256||control.inputIntegrity.userSaveSha256!==candidate.inputIntegrity.userSaveSha256)throw Error('Unmatched checkpoint or user save.');
  for(const key of ['simulation','learning','rewards','vehicle','dense','decoderModel','progress'])if(!control.sourceSha256?.[key]||control.sourceSha256[key]!==candidate.sourceSha256?.[key])throw Error('Unmatched source: '+key);
  if(!control.history?.length||control.history.length!==candidate.history?.length)throw Error('Incomplete paired history.');
  const outcomes=record=>JSON.stringify(record.cars);
  if(outcomes(control.history[0])!==outcomes(candidate.history[0]))throw Error('The unchanged starting generation did not reproduce.');
  const safeLaps=record=>Math.max(0,...record.cars.filter(c=>c.safe).map(c=>c.laps));
  const deltas=candidate.history.map((record,index)=>{
    const base=control.history[index];if(record.generation!==base.generation)throw Error('Unmatched generation.');
    if(!base.rewardRevision||base.rewardRevision!==record.rewardRevision)throw Error('Unmatched reward revision.');
    for(const h of [base,record])if(!Number.isFinite(h.safeFrontier)||!Number.isFinite(h.bestProgress)||!Number.isFinite(h.safeCount)||!(h.safeProgress===null&&h.safeCount===0||Number.isFinite(h.safeProgress)))throw Error('Nonfinite physical replay metrics.');
    const changedAgentOutcomes=record.cars.filter((car,i)=>JSON.stringify(car)!==JSON.stringify(base.cars[i])).length;
    return {generation:record.generation,controlSafe:base.safeCount,candidateSafe:record.safeCount,safeCountDelta:record.safeCount-base.safeCount,controlSafeProgress:base.safeProgress,candidateSafeProgress:record.safeProgress,safeProgressDelta:record.safeProgress-base.safeProgress,safeFrontierDelta:record.safeFrontier-base.safeFrontier,rawProgressDelta:record.bestProgress-base.bestProgress,safeLapDelta:safeLaps(record)-safeLaps(base),changedAgentOutcomes};
  });
  const gain=deltas.some(d=>d.safeLapDelta>0)||deltas.length>=3&&deltas.slice(-2).every(d=>d.safeFrontierDelta>=2);
  return {format:'male-cns-matched-learning-replays-v1',baselineOutcomesExact:true,settings:control.settings,deltas,decision:gain?'candidate gain; require independent seed and full driving validation':'not promoted; no safe lap advantage or persistent >=2 m frontier gain',limits:'Research comparison only. It does not prove two completed laps, convergence across models/tracks, or release readiness.'};
}
if(require.main===module){
  const arg=key=>process.argv.find(v=>v.startsWith(key+'='))?.slice(key.length+1);
  const controlPath=arg('--control'),candidatePath=arg('--candidate'),output=arg('--output');
  if(!controlPath||!candidatePath||!output)throw Error('Specify --control, --candidate and a new --output.');
  const a=fs.readFileSync(controlPath),b=fs.readFileSync(candidatePath),result=compare(JSON.parse(a),JSON.parse(b));
  const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  result.sources={control:{path:controlPath,sha256:sha(a)},candidate:{path:candidatePath,sha256:sha(b)}};
  fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
}
module.exports={compare};
