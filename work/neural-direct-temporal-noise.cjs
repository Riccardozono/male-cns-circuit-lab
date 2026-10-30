'use strict';
const RHO=.9,SCALE=Math.sqrt(1-RHO*RHO);
function conditional(mean,previousMean,previousAction,hasPrevious){return mean.map((m,j)=>m+(hasPrevious?RHO*(previousAction[j]-previousMean[j]):0));}
module.exports={RHO,SCALE,conditional,scale:hasPrevious=>hasPrevious?SCALE:1};
