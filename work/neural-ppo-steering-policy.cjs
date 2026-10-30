'use strict';
// Separate decoder experiment: same actual neuronal features/MLP parameters,
// but symmetric latent motor scaling. Does NOT change physical steering limits.
const Base=require('./neural-ppo-wide-policy.cjs'),Motor=require('./neural-command-residual.cjs');
function compose(parent,gate,action){if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)))throw Error('Finite sampled neuronal latent action required');return Motor.compose(parent,gate,action.map(Math.tanh));}
module.exports={...Base,compose};
