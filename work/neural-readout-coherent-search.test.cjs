'use strict';
// Optimizer fixtures only: no fabricated driving fitness enters training.
const test=require('node:test'),assert=require('node:assert/strict'),Policy=require('./neural-ppo-steering-policy.cjs'),{Search,merge,DIMENSIONS,OFFSET}=require('./neural-readout-coherent-search.cjs');
test('All and only the130 final readout coefficients can change; input encoder remains unchanged',()=>{
 const frozen=Array(Policy.COUNT).fill(.01),genes=Array.from({length:DIMENSIONS},(_,i)=>i/100),w=merge(frozen,genes);
 assert.equal(w.length,33474);assert.equal(OFFSET,33344);assert.deepEqual(w.slice(0,OFFSET),frozen.slice(0,OFFSET));assert.deepEqual(w.slice(OFFSET),genes);genes[0]=7;assert.equal(w[OFFSET],0);assert.equal(frozen[OFFSET],.01);assert.throws(()=>merge(frozen,Array(129).fill(0)));
});
test('Protected zero candidate is actually asked and projected coordinates are the actual pending coordinates',()=>{
 const s=new Search({mean:Array(DIMENSIONS).fill(8),sigma:.3,population:16,seed:161026}),elite=Array(DIMENSIONS).fill(0),rows=s.ask(elite);
 assert.deepEqual(rows[0],elite);assert.equal(rows.length,16);for(let i=0;i<16;i++){assert.deepEqual(rows[i],s.pending[i].x);assert(rows[i].every(v=>Math.abs(v)<=8));}
 assert(rows.slice(1).some(row=>row.includes(8)));assert.throws(()=>s.ask(elite));
 s.tell(rows.map(row=>-row.reduce((sum,v)=>sum+v*v,0)));assert.equal(s.optimizer.generation,1);assert.equal(s.pending,null);assert.throws(()=>s.tell(Array(16).fill(0)));
});
