'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const P=require('../progress-save.js'),F=require('../simulation.js'),Legacy=require('../legacy-models.js'),source=require('../data/connectome.json'),catalog=require('../data/circuits.json');
const {ProgressFiles}=require('../../desktop/progress-files.cjs'),VERSION=require('../../package.json').version;
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'circuit-lab-file-tests-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));assert.ok(path.basename(dir).startsWith('circuit-lab-file-tests-'));return fs.rm(dir,{recursive:true,force:true});});
  const sim=new F.Simulation(Legacy.buildV2(source),{population:4,circuits:catalog,circuitId:'monza'});sim.evolve();sim.running=false;
  const payload=P.fromSimulation(sim),engine={exportProgress:async()=>payload,validateProgress:async p=>P.validatePayload(p,{graph:sim.graph,circuits:sim.circuits})};
  const filename=path.join(dir,'shared.'+P.EXTENSION),calls=[];
  const dialog={showSaveDialog:async(_w,o)=>{calls.push(['save',o]);return {canceled:false,filePath:filename};},showOpenDialog:async(_w,o)=>{calls.push(['open',o]);return {canceled:false,filePaths:[filename]};},showMessageBox:async(_w,o)=>{calls.push(['confirm',o]);return {response:0};}};
  const io=new ProgressFiles({engine,dialog,window:null,version:VERSION});return {dir,sim,payload,engine,dialog,filename,calls,io};
}
test('Native file layer writes a real shared file and opens validated content',async t=>{
  const x=await fixture(t),saved=await x.io.save();assert.equal(saved.canceled,false);assert.equal(saved.appVersion,VERSION);assert.equal(saved.workers,1);assert.deepEqual(saved.rewardRevisions,[F.Rewards.REVISION]);
  const parsed=await P.decode(await fs.readFile(x.filename,'utf8'),VERSION);assert.deepEqual(parsed.payload,x.payload);
  const opened=await x.io.open();assert.deepEqual(opened.file,parsed);assert.equal(opened.name,'shared.malecns-save');assert.equal(x.calls[2][1].defaultId,1);assert.deepEqual(await fs.readdir(x.dir),['shared.malecns-save']);
});
test('Cancel Save creates no file and does not change training',async t=>{
  const x=await fixture(t),before=P.capture(x.sim);x.dialog.showSaveDialog=async()=>({canceled:true});assert.deepEqual(await x.io.save(),{canceled:true});assert.deepEqual(await fs.readdir(x.dir),[]);assert.deepEqual(P.capture(x.sim),before);
});
test('Cancel Open and replace confirmation keep the current trial intact',async t=>{
  const x=await fixture(t),before=P.capture(x.sim);await x.io.save();x.dialog.showOpenDialog=async()=>({canceled:true});assert.deepEqual(await x.io.open(),{canceled:true});x.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[x.filename]});x.dialog.showMessageBox=async()=>({response:1});assert.deepEqual(await x.io.open(),{canceled:true});assert.deepEqual(P.capture(x.sim),before);
});
test('Version mismatch is rejected before asking to replace anything',async t=>{
  const x=await fixture(t);await fs.writeFile(x.filename,await P.encode(x.payload,'4.6.1'));await assert.rejects(x.io.open(),/richiede esattamente/);assert.equal(x.calls.some(c=>c[0]==='confirm'),false);assert.equal(x.io.busy,false);
});
test('Damaged checksum and invalid model are rejected before confirmation',async t=>{
  const x=await fixture(t);await x.io.save();const file=JSON.parse(await fs.readFile(x.filename,'utf8'));file.payload.workers[0].state.mutation=.3;await fs.writeFile(x.filename,JSON.stringify(file));await assert.rejects(x.io.open(),/checksum/);
  const p=structuredClone(x.payload);p.modelId='v5';await fs.writeFile(x.filename,await P.encode(p,VERSION));await assert.rejects(x.io.open(),/Modello/);assert.equal(x.calls.some(c=>c[0]==='confirm'),false);
});
test('Save appends the native extension and safely replaces an approved target',async t=>{
  const x=await fixture(t);x.dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(x.dir,'renamed')});const saved=await x.io.save();assert.equal(saved.name,'renamed.malecns-save');await x.io.save();assert.deepEqual(await fs.readdir(x.dir),['renamed.malecns-save']);await P.decode(await fs.readFile(path.join(x.dir,saved.name),'utf8'),VERSION);
});
test('Failure to write releases the operation lock and leaves existing file intact',async t=>{
  const x=await fixture(t);await x.io.save();const previous=await fs.readFile(x.filename,'utf8');x.dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(x.dir,'missing','new.malecns-save')});await assert.rejects(x.io.save(),/non scritto/);assert.equal(x.io.busy,false);assert.equal(await fs.readFile(x.filename,'utf8'),previous);assert.deepEqual(await fs.readdir(x.dir),['shared.malecns-save']);
});
test('Native file operations are serialized while the picker is open',async t=>{
  const x=await fixture(t);let release;x.dialog.showSaveDialog=()=>new Promise(r=>{release=r;});const pending=x.io.save();while(!release)await new Promise(r=>setImmediate(r));await assert.rejects(x.io.open(),/in corso/);release({canceled:true});await pending;assert.equal(x.io.busy,false);
});
test('Directory and oversize selections are rejected without changing state',async t=>{
  const x=await fixture(t);x.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[x.dir]});await assert.rejects(x.io.open(),/File non valido/);
  const handle=await fs.open(x.filename,'w');await handle.truncate(P.MAX_BYTES+1);await handle.close();x.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[x.filename]});await assert.rejects(x.io.open(),/troppo grande/);assert.equal(x.calls.length,0);
});
