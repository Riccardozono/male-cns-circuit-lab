'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),F=require('../simulation.js'),D=require('../dense-neural.js'),Legacy=require('../legacy-models.js');
function reference(graph,brain,count,edges,gains){for(let iter=0;iter<count;iter++){brain.sum.set(brain.injection);if(edges)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}}
for(const id of ['v2','v3'])test(id+': exact CPU pass preserves state with live topology/weight/gain changes',()=>{
  const data=require('../data/connectome.json'),s=new F.Simulation(id==='v2'?Legacy.buildV2(data):Legacy.tagV3(data),{population:1}),a=F.makeBrain(s.graph),b=F.makeBrain(s.graph),r=F.rng(24417);
  for(let k=0;k<18;k++){for(let n=0;n<s.graph.n;n++)a.injection[n]=b.injection[n]=r()-.5;const gains=k%3?Float32Array.from({length:s.graph.learning.gainGroups},()=>r()*2):null;if(k===8){s.graph.to[12]=(s.graph.to[12]+1)%s.graph.n;s.graph.weights[17]*=.6;}
    reference(s.graph,a,id==='v2'?2:4,k!==5,gains);D.step(s.graph,b,id==='v2'?2:4,k!==5,gains);for(const field of ['activity','next','sum','injection'])assert.deepEqual(b[field],a[field]);
  }
});
test('Browser bootstrap and Windows package include the exact CPU dependency',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dense-neural.js'),'utf8'),context);assert.equal(typeof context.MaleCNSDense.step,'function');assert.ok(html.indexOf('src="dense-neural.js"')<html.indexOf('src="simulation.js"'));assert.ok(require('../../package.json').build.files.includes('outputs/dense-neural.js'));
});
