'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Safety=require('./neural-statehead-cuda-safety.cjs');

const clearCar=(overrides={})=>({lateralG:.7,slipAngle:.04,totalG:1.1,longitudinalG:.5,inputs:[.8,.8,.8,.8,.8,.8,.8],physicsInputs:Array(17).fill(0),...overrides});
test('physics and clearance envelope leaves ordinary measurements unchanged',()=>{
  assert.equal(Safety.scale(clearCar()),1);
});
test('physics envelope smoothly attenuates a high lateral load',()=>{
  assert.equal(Safety.scale(clearCar({lateralG:1.25,slipAngle:.03,totalG:1.2,longitudinalG:.5})),.5);
});
test('physics envelope stops only the experimental residual at a hard slip limit',()=>{
  assert.equal(Safety.scale(clearCar({lateralG:.5,slipAngle:.14,totalG:1,longitudinalG:.2})),0);
});
test('real side-wall clearance smoothly attenuates the experimental residual',()=>{
  const car=clearCar({inputs:[.8,.1,.1,.8,.1,.1,.8]});
  assert.ok(Math.abs(Safety.scale(car)-(.1-.07)/(.28-.07))<1e-12);
});
test('forward collision ray or severe road asymmetry stops the experimental residual',()=>{
  assert.equal(Safety.scale(clearCar({inputs:[.8,.8,.8,.01,.8,.8,.8]})),0);
  assert.equal(Safety.scale(clearCar({physicsInputs:[0,0,0,0,0,0,0,.9]})),0);
});
test('missing physics is fail-closed for the experimental residual',()=>{
  assert.equal(Safety.scale(null),0);
  assert.equal(Safety.scale({lateralG:.1,slipAngle:0,totalG:0,longitudinalG:0,inputs:[],physicsInputs:[]}),0);
});
