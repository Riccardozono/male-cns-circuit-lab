'use strict';
// Additional TRAINING-only failure cost. Never alters physical R5 scores,
// comparisons, sensors or motor commands; collision costs are never reduced.
const REVISION='ppo-incomplete-2lap-failure-floor40-v1';
function reward(raw,terminated,laps){if(!Number.isFinite(raw)||typeof terminated!=='boolean'||!Number.isInteger(laps)||laps<0||laps>2)throw Error('Actual finite reward, terminal flag and lap count required');const value=terminated&&laps<2?Math.min(raw,-40):raw;return {rawReward:raw,reward:value,auxiliaryPenalty:raw-value};}
module.exports={REVISION,reward};
