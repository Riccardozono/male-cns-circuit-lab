'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('./physical-rollout-pool.cjs'),G=require('./neural-progress-continuity.cjs'),
  audit=require('../.impeccable/review/learning-ml/v3-neural-context-progress-audit-20261024-01/report.json'),track=P.setup().track;
function captured(retention){const r=audit.records.find(c=>c.retention===retention).invalid[0];return {r,state:{x:r.before.previousX,y:r.before.previousY,along:r.before.along,segmentIndex:r.before.nearest.index},
  args:[r.after.x,r.after.y,r.after.nearest.along,r.after.nearest.index,{onRoad:true,collision:false,dt:1/60}]};}
test('two observed road-safe adjacent corner switches pass the geometric identity check',()=>{
  for(const retention of [.9875,.99]){const {r,state,args}=captured(retention);assert.ok(r.chainageDelta>r.allowedDelta);assert.equal(G.localTransition(track,state,...args),true);}
});
test('stationary changes, teleports, forged chainage and unrelated branches remain invalid',()=>{
  const {state,args}=captured(.99);
  assert.equal(G.localTransition(track,state,state.x,state.y,args[2],args[3],args[4]),false);
  assert.equal(G.localTransition(track,state,args[0]+100,args[1],args[2],args[3],args[4]),false);
  assert.equal(G.localTransition(track,state,args[0],args[1],args[2]+1,args[3],args[4]),false);
  assert.equal(G.localTransition(track,state,args[0],args[1],args[2],args[3]+10,args[4]),false);
  assert.equal(G.localTransition(track,{...state,along:state.along+1},...args),false);
});
test('off-road/colliding motion, invalid indices and invalid time cannot authorize local progress',()=>{
  const {state,args}=captured(.99);
  for(const config of [{onRoad:false},{collision:true},{dt:0},{dt:NaN}])assert.equal(G.localTransition(track,state,...args.slice(0,4),{...args[4],...config}),false);
  assert.equal(G.localTransition(track,{...state,segmentIndex:-1},...args),false);
});
test('geometric continuity works across the closed-track seam without unwrapping another lap',()=>{
  const points=[[0,0],[10,0],[10,10],[0,10]],segments=points.map(([x,y],i)=>({a:{x,y},b:{x:points[(i+1)%4][0],y:points[(i+1)%4][1]},start:i*10,length:10})),
    t={segments,total:40,pixelsPerMeter:1},s={x:1,y:1.01,along:38.99,segmentIndex:3};
  assert.equal(G.localTransition(t,s,1.01,1,1.01,0,{onRoad:true,collision:false,dt:1/60}),true);
  assert.equal(G.localTransition(t,s,1.01,1,1.01+40,0,{onRoad:true,collision:false,dt:1/60}),false);
});
