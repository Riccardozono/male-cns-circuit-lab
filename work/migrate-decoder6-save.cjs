'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),X=require('./decoder6-model.cjs');
const source='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const directory=path.join(root,'.impeccable/review/decoder6/migration');
const target=path.join(directory,'Circuit-Lab-5.6.0-v3-decoder6-monza-gen64.malecns-save');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
  if(fs.existsSync(target))throw Error('La copia migrata esiste già: non viene sovrascritta.');
  const before=hash(source),file=await P.decode(fs.readFileSync(source,'utf8'),'5.6.0');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
    catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const oldSim=new F.Simulation(Legacy.tagV3(data),{population:4,circuitId:'monza',circuits:catalog}),
    newSim=new X.F.Simulation(X.model(data),{population:4,circuitId:'monza',circuits:catalog});
  P.validatePayload(file.payload,{graph:oldSim.graph,circuits:oldSim.circuits});
  const migrated=X.migrate(file.payload,oldSim.graph,newSim.graph);
  X.P.validatePayload(migrated,{graph:newSim.graph,circuits:newSim.circuits});
  assert.throws(()=>P.validatePayload(migrated,{graph:oldSim.graph,circuits:oldSim.circuits}),/incompatibili/);
  assert.throws(()=>X.P.validatePayload(file.payload,{graph:newSim.graph,circuits:newSim.circuits}),/incompatibili/);
  let commandChecks=0,maxCommandDelta=0;const random=F.rng(9613),p=oldSim.graph.learning;
  for(const w of file.payload.workers)for(const original of w.state.genomes){
    const transferred=X.genome(original,p,newSim.graph.learning);
    for(let sample=0;sample<12;sample++){
      const activity=new Float32Array(oldSim.graph.n);
      for(const node of p.nodes)activity[node]=sample===0?0:(random()*2-1)*(sample<6?.05:1);
      const a=L.commands(oldSim.graph,{activity},original),b=X.L.commands(newSim.graph,{activity},transferred);
      for(let i=0;i<3;i++)maxCommandDelta=Math.max(maxCommandDelta,Math.abs(a[i]-b[i]));
      assert.deepEqual(b,a);commandChecks++;
    }
  }
  for(const [index,w]of migrated.workers.entries()){
    X.P.restore(newSim,w.state);const captured=X.P.capture(newSim);
    assert.deepEqual({...captured,elapsedAtSave:0},{...w.state,elapsedAtSave:0});
    const old=file.payload.workers[index].state;
    for(const key of ['generation','seed','rngState','stagnation','learningFrontier','bestEver','championStats','population','mutation','speedMultiplier'])assert.deepEqual(captured[key],old[key]);
    assert.equal(captured.optimizer.updates,old.optimizer.updates);assert.equal(captured.optimizer.episodes,old.optimizer.episodes);
  }
  const text=await X.P.encode(migrated,'5.6.0'),decoded=await X.P.decode(text,'5.6.0');
  X.P.validatePayload(decoded.payload,{graph:newSim.graph,circuits:newSim.circuits});
  assert.equal(hash(source),before);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(target,text,{flag:'wx'});
  const report={passed:true,source,sourceSha256:before,migratedCopy:target,migratedSha256:hash(target),appVersion:'5.6.0',
    oldGraph:file.payload.graph,newGraph:migrated.graph,commandChecks,maxCommandDelta,oldRuntimeRejectsMigrated:true,newRuntimeRejectsOriginal:true,
    workers:migrated.workers.map((w,i)=>({index:i,generation:w.state.generation,clearedHistoryEntries:file.payload.workers[i].state.history.length,updates:w.state.optimizer.updates,episodes:w.state.optimizer.episodes})),
    boundary:'Explicit experimental copy. All old weights, optimizer state, seeds, counters, generations, champions and settings are mapped. New residual/threshold weights start at zero; new exploration sigmas use decoder defaults. Only history is cleared. Saves restart episodes, not mid-lap body/brain state. No publication or original file modification.'};
  fs.writeFileSync(path.join(directory,'transfer-verification.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('DECODER6_TRANSFER '+JSON.stringify(report));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
