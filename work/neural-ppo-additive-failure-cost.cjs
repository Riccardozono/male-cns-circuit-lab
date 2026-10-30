'use strict';
// Extra training-only cost without erasing the official terminal distinction
// between crash, stall and valid completion. No motor/physics changes.
const REVISION='ppo-incomplete-2lap-additive40-v1';
function reward(raw,terminated,laps){
 if(!Number.isFinite(raw)||typeof terminated!=='boolean'||!Number.isInteger(laps)||laps<0||laps>2)throw Error('Actual finite reward, terminal flag and lap count required');
 const auxiliaryPenalty=terminated&&laps<2?40:0;
 return {rawReward:raw,reward:raw-auxiliaryPenalty,auxiliaryPenalty};
}
module.exports={REVISION,reward};
