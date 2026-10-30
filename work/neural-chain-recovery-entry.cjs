'use strict';
// Test entry only: substitute the diagnostic harness, NOT the application,
// physics, neural inference, save validation or files covered by its identity.
// This preserves the genuinely created first-generation save and failed proof.
const diagnostic=require.resolve('./neural-chain-smoke.cjs');
require.cache[diagnostic]={id:diagnostic,filename:diagnostic,loaded:true,exports:require('./neural-chain-recovery-smoke.cjs')};
require('./neural-chain-main.cjs');
