'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),pkg=require('../../package.json');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('Release metadata, lockfile, visible version and save notice agree exactly',()=>{
  assert.equal(pkg.version,'5.6.0');const lock=JSON.parse(read('package-lock.json'));
  assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  assert.ok(read('outputs/app.js').includes("APP_VERSION='"+pkg.version+"'"));
  assert.ok(read('outputs/index.html').includes('id="build-version">'+pkg.version+'</span>'));
  assert.ok(read('outputs/index.html').includes('solo app '+pkg.version));
  assert.equal(pkg.build.directories.output,'dist-landscape-v560');
  assert.ok(read('docs/assets/badges/version.svg').includes('versione: '+pkg.version));
});
test('A valid 5.5.0 progress file cannot silently enter release 5.6.0',async()=>{
  const F=require('../simulation.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js');
  const graph=Legacy.buildV2(require('../data/connectome.json'));
  const sim=new F.Simulation(graph,{population:4});sim.running=false;
  const text=await P.encode(P.fromSimulation(sim),'5.5.0');
  await assert.rejects(P.decode(text,pkg.version),/5\.5\.0.*richiede esattamente.*5\.6\.0/);
});
