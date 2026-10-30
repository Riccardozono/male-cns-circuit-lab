'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Memory=require('./neural-learned-context-memory.cjs');
const basis={scales:Array(516).fill(1),centres:[0,.2,.4].map(v=>({values:Array(516).fill(v),radius:.3}))};
test('A zero additive readout preserves any parent command even while neuronal memory is active',()=>{for(const retention of [0,2,4,8]){const m=Memory.create(basis),g=[0,0,0,0,0,0,retention,retention,retention];for(const value of [0,.2,.4,1,1,1]){m.observe(Array(516).fill(value),g);for(const parent of [[-.8,0,1],[.2,.7,0],[0,0,0]])assert.deepEqual(m.compose(parent,g),parent);}}});
