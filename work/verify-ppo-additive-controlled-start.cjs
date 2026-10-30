'use strict';
// First actual on-policy batch is collected before either optimizer updates.
// A reward-only comparison must preserve its physical rows and sampled actions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=path.resolve('.impeccable/review/neural-sacl'),old=path.join(base,'neuronal-ppo-parallel4-brake-exploration'),next=path.join(base,'neuronal-ppo-parallel4-additive-failure'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const a=JSON.parse(fs.readFileSync(path.join(old,'rollout-001.json'))),b=JSON.parse(fs.readFileSync(path.join(next,'rollout-001.json'))),physical=row=>{const {reward,auxiliaryPenalty,...rest}=row;return rest;};
assert.equal(a.rows.length,1024);assert.equal(b.rows.length,1024);assert.deepEqual(a.rows.map(physical),b.rows.map(physical));assert.deepEqual(a.episodes,b.episodes);
let changed=0;for(let k=0;k<b.rows.length;k++){
 const row=b.rows[k],penalty=row.done&&row.terminalLaps<2?40:0;assert.equal(row.reward,row.rawReward-penalty);assert.equal(row.auxiliaryPenalty,penalty);changed+=Number(a.rows[k].reward!==row.reward);
}
assert(changed>0);const report={passed:true,actualPhysicalTransitionsCompared:1024,independentEnvironments:4,allObservationsActionsRawRewardsNextObservationsAndEpisodesEqual:true,changedRewardRows:changed,oldBatchSha256:hash(fs.readFileSync(path.join(old,'rollout-001.json'))),newBatchSha256:hash(fs.readFileSync(path.join(next,'rollout-001.json'))),sourceSha256:hash(fs.readFileSync(__filename)),boundary:'Actual reward-only controlled first-batch comparison, not a proof that the trained policy improves.'};
fs.writeFileSync(path.join(next,'controlled-start-verification.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
