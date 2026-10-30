'use strict';
// Bounded compositor verification only; frozen app/inference/save files stay
// unchanged. The user-facing launcher does not use this diagnostic entry.
const diagnostic=require.resolve('./neural-chain-smoke.cjs');
require.cache[diagnostic]={id:diagnostic,filename:diagnostic,loaded:true,exports:require('./neural-chain-visual-smoke.cjs')};
require('./neural-chain-main.cjs');
