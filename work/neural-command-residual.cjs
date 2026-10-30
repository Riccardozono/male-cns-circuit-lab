'use strict';
// A learned correction in MOTOR space, not a bounded correction nested inside
// the frozen parent's saturated residual. No route, clock or body targets.
function compose(prior,gate,residual){
  if(!Array.isArray(prior)||prior.length!==3||prior.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||prior[1]<0||prior[2]<0||Math.min(prior[1],prior[2])!==0||!Number.isFinite(gate)||gate<0||gate>1||!Array.isArray(residual)||residual.length!==2||residual.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded exclusive learned motors, observed gate and two neuronal corrections required');
  if(gate===0||residual.every(v=>v===0))return prior.slice();
  const clamp=v=>Math.max(-1,Math.min(1,v)),steer=clamp(prior[0]+2*gate*residual[0]),long=clamp(prior[1]-prior[2]+2*gate*residual[1]);
  return [steer,Math.max(0,long),Math.max(0,-long)];
}
module.exports={compose};
