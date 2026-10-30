'use strict';
// Preserve raw physics/R5 scores; equalize minimum failed-episode base costs.
// R7 raises idle by2300 to3700 but leaves collision at3200+impact (0..500).
// Add500 to collision/off-road/invalid failures so cheap low-speed impacts
// do not beat an otherwise equivalent stall merely by ending sooner.
const R7=require('./neural-direct-training-objective-r7.cjs'),R=require('../.impeccable/experimental-penalty5/outputs/rewards.js');
const REVISION='prior-progress-8-common-failure-base',COLLISION_ADJUSTMENT=R.RULES.impactSpeedPenalty;
function penalty(info){return R7.penalty(info)+(info.complete&&['urto','fuori pista','progresso non valido'].includes(info.reason)?COLLISION_ADJUSTMENT:0);}
function fitness(info){if(!Number.isFinite(info.fitness))throw Error('Finite actual raw score required');return info.fitness-penalty(info);}
module.exports={REVISION,COLLISION_ADJUSTMENT,penalty,fitness};
