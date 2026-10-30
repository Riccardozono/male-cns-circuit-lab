'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),L=require('../outputs/legacy-models.js'),D=require('./exact-dense.cjs');
for(const [name,model] of [['v2',L.buildV2(require('../outputs/data/connectome.json'))],['v3',L.tagV3(require('../outputs/data/connectome.json'))]]){
  for(const variant of ['incoming','coo'])test(name+' '+variant+': exact dense layout preserves every Float64 state and output under changing inputs and live weights',()=>{
    const s=new F.Simulation(model,{population:1}),a=F.makeBrain(s.graph),b=F.makeBrain(s.graph),fast=D.wrap(F,variant==='coo'?require('./exact-coo.cjs').pass:D.pass),r=F.rng(82417),genome=s.cars[0].genome;
    for(let k=0;k<16;k++){const sensors=Array.from({length:F.SENSOR_COUNT},(_,j)=>j<11?r():r()*2-1);if(k===8)s.graph.weights[17]*=.75;
      const edges=k!==5,enabled=k!==10,old=F.neuralStep(s.graph,a,genome,sensors,enabled,edges),exact=fast.neuralStep(s.graph,b,genome,sensors,enabled,edges);assert.deepEqual(exact,old);
      for(const field of ['activity','next','sum','injection'])assert.deepEqual(b[field],a[field],name+' '+field+' step '+k);
    }
  });
}
test('Topology rebuild is explicit and keeps stable per-target edge order',()=>{
  const g={n:2,from:Uint32Array.from([0,1]),to:Uint32Array.from([1,0]),weights:Float64Array.from([.2,.4])},brain=()=>({activity:Float64Array.from([.1,.2]),next:new Float64Array(2),sum:new Float64Array(2),injection:new Float64Array(2)});D.pass(g,brain(),1,true,null);g.to[0]=0;D.invalidate(g);const b=brain();D.pass(g,b,1,true,null);assert.equal(b.sum[0],.9*.2*.1+.9*.4*.2);assert.equal(b.sum[1],0);
});
