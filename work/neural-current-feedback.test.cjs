'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('./neural-current-feedback.cjs');
const basis={indices:[384,385,386,387,388,389,390,391],mean:Array(8).fill(0),scales:Array(8).fill(.2)};
test('Current neurons change the added readout even with identical retained gate',()=>{const g=Array(18).fill(0);g[2]=1;g[3]=-1;const a=Array(516).fill(0),b=a.slice();b[384]=.5;assert.notDeepEqual(Core.compose([0,.5,0],a,basis,g,.5),Core.compose([0,.5,0],b,basis,g,.5));});
test('Zero weights or gate preserve the frozen parent and pedals remain exclusive',()=>{const raw=Array(516).fill(.5),p=[-.8,0,1];assert.deepEqual(Core.compose(p,raw,basis,Array(18).fill(0),1),p);assert.deepEqual(Core.compose(p,raw,basis,Array(18).fill(8),0),p);const c=Core.compose(p,raw,basis,Array(18).fill(8),1);assert.equal(Math.min(c[1],c[2]),0);assert(c.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));assert.throws(()=>Core.validate(Array(17).fill(0)));});
