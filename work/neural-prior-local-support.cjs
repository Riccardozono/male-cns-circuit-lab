'use strict';
const P=require('../.impeccable/review/neural-sacl/learned-prior-local-support/support.json');
if(P.format!=='male-cns-neuronal-local-support-v1'||P.dimension!==642||P.featureWeights.length!==642||P.normalizationCenter.length!==642||P.normalizationScale.length!==642||P.centres.length!==P.radii.length)throw Error('Exact fitted neuronal support required');
function value(x){if(!Array.isArray(x)||x.length!==642||x.some(v=>!Number.isFinite(v)))throw Error('Actual neuronal vector required');const z=x.map((v,j)=>(v-P.normalizationCenter[j])/P.normalizationScale[j]*P.featureWeights[j]);let gate=0;for(let k=0;k<P.centres.length;k++){let d=0;for(let j=0;j<642;j++){const e=z[j]-P.centres[k][j];d+=e*e;}const q=Math.sqrt(d)/P.radii[k];if(q<1)gate=Math.max(gate,(1-q)**4*(4*q+1));}return gate;}
module.exports={value,parameters:P};
