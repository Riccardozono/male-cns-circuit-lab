'use strict';
const Base=require('./neural-direct-motorpool-core.cjs'),Layout=require('./neural-direct-motorpool-scaled-layout.cjs');
function metadata(f){return {...Base.metadata(f),format:'male-cns-direct-all-descending-scaled-policy-v1',fixedDecoderNormalization:true,normalizationFitTransitions:1024};}
module.exports={...Base,metadata,mean:Layout.mean,validate:Layout.validate};
