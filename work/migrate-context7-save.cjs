'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const decoder=Number(process.argv.find(a=>a.startsWith('--decoder='))?.slice(10)||7);if(![7,8].includes(decoder))throw Error('Invalid decoder');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),X=require('./context'+decoder+'-model.cjs');
const root=path.resolve(__dirname,'..'),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',output=path.join(root,'.impeccable/review/context'+decoder+'/migration'),target=path.join(output,'Circuit-Lab-5.6.0-v3-context'+decoder+'-monza-gen64.malecns-save');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
  if(fs.existsSync(target))throw Error('Existing migrated copy will not be overwritten');
  const sourceHash=hash(original),file=await P.decode(fs.readFileSync(original,'utf8'),'5.6.0'),data=require('../outputs/data/connectome.json'),catalog=require('../outputs/data/circuits.json'),a=new F.Simulation(Legacy.tagV3(data),{population:4,circuitId:'monza',circuits:catalog}),b=new X.F.Simulation(X.model(data),{population:4,circuitId:'monza',circuits:catalog});
  P.validatePayload(file.payload,{graph:a.graph,circuits:a.circuits});const payload=X.migrate(file.payload,a.graph,b.graph);X.P.validatePayload(payload,{graph:b.graph,circuits:b.circuits});
  assert.throws(()=>P.validatePayload(payload,{graph:a.graph,circuits:a.circuits}),/incompatibili/);assert.throws(()=>X.P.validatePayload(file.payload,{graph:b.graph,circuits:b.circuits}),/incompatibili/);
  const r=F.rng(7947);let commandChecks=0;
  for(const w of file.payload.workers)for(const g of w.state.genomes){const next=X.genome(g,a.graph.learning,b.graph.learning);
    for(let sample=0;sample<12;sample++){const activity=new Float64Array(a.graph.n);for(const index of a.graph.learning.nodes)activity[index]=sample?(r()*2-1):0;assert.deepEqual(X.L.commands(b.graph,{activity},next),L.commands(a.graph,{activity},g));commandChecks++;}
  }
  for(const w of payload.workers){X.P.restore(b,w.state);assert.deepEqual({...X.P.capture(b),elapsedAtSave:0},{...w.state,elapsedAtSave:0});}
  const text=await X.P.encode(payload,'5.6.0');X.P.validatePayload((await X.P.decode(text,'5.6.0')).payload,{graph:b.graph,circuits:b.circuits});assert.equal(hash(original),sourceHash);
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(target,text,{flag:'wx'});
  const report={passed:true,sourceUnchanged:true,sourceSha256:sourceHash,target,copySha256:hash(target),bytes:Buffer.byteLength(text),commandChecks,initialCommandDelta:0,graph:payload.graph,
    boundary:'Further experimental copy, not an app version/distribution. All old weights/state mapped, all new context genes zero, only copied histories cleared. Original and decoder6 app/copy untouched. Policy '+decoder+' rejects older fingerprints without bypassing validation.'};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log('CONTEXT7_TRANSFER '+JSON.stringify(report));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
