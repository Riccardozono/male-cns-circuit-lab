'use strict';
const Base=require('./neural-direct-policy-core.cjs'),Layout=require('./neural-direct-nonlinear-layout.cjs');
function createFrame(){const f=Base.createFrame();f.initialWeights=Layout.extend(f.initialWeights,f.dimension);return f;}
function metadata(f){return {...Base.metadata(f),format:'male-cns-direct-nonlinear-policy-v1',trainableMotorWeights:f.initialWeights.length,artificialHiddenUnits:Layout.HIDDEN,boundary:'Same actual anatomical V3 reservoir, 64 descending activities and twelve frozen neuronal context basis functions. All linear and nonlinear motor branches trainable. New64hiddenunits are artificial decoder units, NOT anatomical neurons. Zero output branch preserves initial mean commands. No old motor cascade, route, teacher actions or prefix projection; not full coldstart or biological physiology.'};}
module.exports={...Base,createFrame,metadata,mean:Layout.mean,validate:Layout.validate};
