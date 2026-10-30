'use strict';
const Base=require('./neural-prior-readout-core-r2.cjs'),Layout=require('./neural-prior-readout-scaled-layout.cjs');
function metadata(f){return {...Base.metadata(f),format:'male-cns-pinned-learned-prior-final-scaled-readout-v1',fixedDecoderNormalization:true,normalizationFitTransitions:1024};}
module.exports={...Base,metadata,mean:Layout.mean,validate:Layout.validate};
