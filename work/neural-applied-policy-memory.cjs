'use strict';
// A proposal that had zero neural motor authority did not execute a residual.
// Remembering zero there makes full and reached-prefix policy memory agree.
// Once authority is positive, retain the existing bounded latent semantics.
module.exports=function appliedMemory(gate,action){
 if(!Number.isFinite(gate)||gate<0||gate>1||!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)))throw Error('Actual bounded neural gate and finite proposed action required');
 return gate===0?[0,0]:action.map(Math.tanh);
};
