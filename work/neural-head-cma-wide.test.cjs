'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Search}=require('./neural-head-cma-transport.cjs'),{WideSearch}=require('./neural-head-cma-wide.cjs');
test('Wider longitudinal exploration preserves draws and steering, scales only initial longitudinal samples and physically asks the exact elite',()=>{
  const config={mean:[0,0],sigma:.15,population:16,seed:15102113},normal=new Search(config),wide=new WideSearch(config),a=normal.ask([0,0]),b=wide.ask([0,0]);assert.equal(normal.seed,wide.seed);assert.deepEqual(b[0],[0,0]);assert.deepEqual(wide.optimizer.covariance,[[1,0],[0,16]]);
  for(let i=0;i<a.length;i++){assert.equal(b[i][0],a[i][0]);assert.equal(b[i][1],4*a[i][1]);}
  // No fabricated fitness or driving action enters either optimizer here.
});
