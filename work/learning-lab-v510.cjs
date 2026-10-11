'use strict';
// Repeatable natural-generation diagnostic. Rendering is never a controller.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const source=baseline?path.join(__dirname,'baseline-v510','outputs'):path.join(root,'outputs');
const F=require(path.join(source,'simulation.js')),Legacy=require(path.join(source,'legacy-models.js')),data=require('../outputs/data/connectome.json');
const arg=(name,fallback)=>process.argv.find(s=>s.startsWith('--'+name+'='))?.split('=')[1]??fallback;
const generations=Number(arg('generations',12)),seed=Number(arg('seed',7717)),population=Number(arg('population',32));
const sim=new F.Simulation(Legacy.buildV2(data),{population,mutation:.16,seed});
const records=[],started=performance.now();
for(let i=0;i<generations;i++){
  const generation=sim.generation;let ticks=0;
  while(sim.generation===generation&&ticks++<14000)sim.tick();
  if(sim.generation===generation)throw Error('Generation failed to end naturally');
  const h=sim.history.at(-1);records.push(h);
  console.log('LAB_GENERATION '+JSON.stringify({baseline,seed,generation,progress:h.bestProgress,laps:h.maxLaps??h.laps,fitness:h.best,stagnation:h.stagnation,exploration:h.learning?.meanExploration}));
}
const report={baseline,seed,population,generations,seconds:(performance.now()-started)/1000,history:records,sourceSha256:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(source,f))).digest('hex')])),boundary:'Headless CPU V2, Lab only. Natural cold-start generations with the same seed and settings. Not a GPU throughput measurement.'};
const out=path.join(root,'outputs','learning-verification-v510','lab-'+(baseline?'baseline':arg('tag','candidate'))+'-'+seed+'.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log('LAB_RESULT '+JSON.stringify({out,seconds:report.seconds,first:records[0].bestProgress,last:records.at(-1).bestProgress,max:Math.max(...records.map(h=>h.bestProgress))}));
