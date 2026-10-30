'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Search}=require('./neural-head-cma-transport.cjs'),{restore}=require('./neural-head-cma-resume.cjs');
test('Committed18coordinate optimizer resumes the exact next coefficients and RNG without pending-score injection',()=>{
  const original=new Search({mean:Array(18).fill(0),sigma:.03,population:16,seed:15101837}),elite=Array(18).fill(0),batch=original.ask(elite);original.tell(batch.map(x=>-Math.hypot(...x)));const committed=JSON.parse(JSON.stringify(original.state())),recovered=restore(committed);
  assert.deepEqual(original.ask(elite),recovered.ask(elite));assert.equal(original.state().seed,recovered.state().seed);assert.throws(()=>restore({...committed,seed:-1}),/RNG/);
});
