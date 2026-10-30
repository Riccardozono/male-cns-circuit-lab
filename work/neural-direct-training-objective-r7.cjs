'use strict';
// Training-only idle cost matches maximum existing collision terminal cost.
// R5 vehicle motion, termination and raw scores are unchanged.
const R=require('../.impeccable/experimental-penalty5/outputs/rewards.js');
const REVISION='direct-progress-7-idle-worst-impact-parity',PENALTY=Math.max(0,R.RULES.collision+R.RULES.impactSpeedPenalty-R.RULES.stall);
function penalty(info){return info.complete&&['ferma / senza progresso','troppo lenta / senza progresso'].includes(info.reason)?PENALTY:0;}
function fitness(info){if(!Number.isFinite(info.fitness))throw Error('Actual finite raw score required');return info.fitness-penalty(info);}
module.exports={REVISION,PENALTY,penalty,fitness};
