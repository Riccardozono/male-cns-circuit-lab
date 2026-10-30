'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{aggregate,compare}=require('./multistart-objective.cjs');
const r=(progressM,safe=true,fitness=progressM,laps=0)=>({progressM,safe,fitness,laps});
test('A crash on one actual start cannot outrank three safe starts by travelling farther',()=>{
  assert.ok(compare(aggregate([r(790),r(791),r(792)]),aggregate([r(800),r(801,false),r(802)]))<0);
});
test('Among equally safe candidates the minimum completed laps and actual progress decide',()=>{
  assert.ok(compare(aggregate([r(790),r(790),r(790)]),aggregate([r(789),r(900),r(900)]))<0);
  assert.ok(compare(aggregate([r(100,true,0,2),r(100,true,0,2)]),aggregate([r(200,true,900,2),r(200,true,900,1)]))<0);
});
test('Censoring cannot become safe evidence and aggregation cannot alter measured inputs',()=>{
  const rows=[r(10),{...r(20),censored:true}],before=JSON.stringify(rows),a=aggregate(rows);
  assert.equal(a.safeCount,1);assert.equal(JSON.stringify(rows),before);assert.equal(compare(a,a),0);
  assert.throws(()=>aggregate([r(Infinity)]),/measured/);assert.throws(()=>compare(a,aggregate([r(1)])),/budgets/);
});
