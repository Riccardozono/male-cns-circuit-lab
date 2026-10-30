'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{compare}=require('../../work/compare-learning-replays.cjs');
function replay(){return {settings:{seed:1,population:1,startingGeneration:2,circuitId:'monza',mutation:.16},policy:{version:7},appVersion:'5.6.0',inputIntegrity:{inputUnchanged:true,userSaveUnchanged:true,inputSha256:'input',userSaveSha256:'user'},sourceSha256:Object.fromEntries(['simulation','learning','rewards','vehicle','dense','decoderModel','progress'].map(k=>[k,k])),history:[2,3,4].map(generation=>({generation,rewardRevision:'progress-7',safeCount:1,safeProgress:10,safeFrontier:10,bestProgress:10,cars:[{id:0,progress:10,laps:0,safe:true}]}))};}
test('Replay gate rejects different seeds, modified inputs and a changed baseline',()=>{
  for(const edit of [r=>r.settings.seed++,r=>r.settings.mutation=.3,r=>r.history[1].rewardRevision='different',r=>r.sourceSha256.vehicle='different',r=>r.history[1].safeFrontier=Infinity,r=>r.inputIntegrity.userSaveUnchanged=false,r=>r.history[0].cars[0].progress++]){const a=replay(),b=replay();edit(b);assert.throws(()=>compare(a,b));}
});
test('Crashes and raw-distance gains cannot masquerade as a safe learning milestone',()=>{
  const a=replay(),b=replay();for(const h of b.history.slice(1)){h.bestProgress=100;h.cars[0]={id:0,progress:100,laps:1,safe:false};}
  assert.match(compare(a,b).decision,/not promoted/);
});
test('Only a persistent safe-frontier gain or safe lap advances the research gate',()=>{
  const a=replay(),b=replay();b.history.at(-1).safeFrontier=13;assert.match(compare(a,b).decision,/not promoted/);
  b.history[1].safeFrontier=13;assert.match(compare(a,b).decision,/candidate gain/);
  const c=replay();c.history.at(-1).cars[0].laps=1;assert.match(compare(a,c).decision,/candidate gain/);
});
