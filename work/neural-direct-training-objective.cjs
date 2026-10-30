'use strict';
// Training-only failure parity. Does not modify physics, termination or R5 scores.
const R=require('../.impeccable/experimental-penalty5/outputs/rewards.js');
const REVISION='direct-progress-6-terminal-stall-parity',PENALTY=Math.max(0,R.RULES.collision-R.RULES.stall);
function penalty(info){return info.complete&&['ferma / senza progresso','troppo lenta / senza progresso'].includes(info.reason)?PENALTY:0;}
function fitness(info){if(!Number.isFinite(info.fitness))throw Error('Actual finite raw score required');return info.fitness-penalty(info);}
module.exports={REVISION,PENALTY,penalty,fitness};
