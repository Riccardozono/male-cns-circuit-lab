'use strict';
// A new shareable warm-start file for the existing private Windows engine.
// No active application/profile, old save or distributed build is modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Model=require('./neural-grown-model.cjs'),Save=require('./neural-grown-save.cjs'),{Coordinator}=require('./neural-grown-coordinator.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),runFile=path.join(base,'progressive-3652-first/run.json'),run=JSON.parse(fs.readFileSync(runFile,'utf8')),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
  assert.equal(run.status,'finished');const modelFile=run.bestModelFile,loaded=Model.load(modelFile),stage=run.stages.filter(s=>s.improved).at(-1),report=JSON.parse(fs.readFileSync(stage.reportFile,'utf8'));
  assert.equal(sha(fs.readFileSync(stage.reportFile)),stage.reportSha256);assert.equal(report.passed,true);assert.equal(report.nativeVerifications.length,2);for(const v of report.nativeVerifications){assert.equal(v.passed,true);assert.equal(v.modelSha256,loaded.sha256);assert.equal(v.overlap,0);for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])assert.equal(v.result[k],loaded.data.verifiedFullResult[k]);}
  const out=path.join(base,'progressive-native-save');fs.mkdirSync(out,{recursive:true});const file=path.join(out,'Circuit-Lab-5.6.0-v3-monza-progressive-3712.malecns-grown-dev');
  const seed=new Coordinator({modelFile,population:16,speedMultiplier:1,mutation:.16});seed.entries=seed.archive.ask(seed.random).map((r,id)=>({id,weights:r.weights}));const state=await seed.exportState(),text=Save.encode(fs.readFileSync(modelFile,'utf8'),state),parsed=Save.parse(text);
  assert.equal(parsed.modelSha256,loaded.sha256);assert.equal(parsed.state.generation,1);assert.equal(parsed.state.completedEpisodes,0);assert.equal(parsed.state.updates,0);assert.deepEqual(parsed.state.history,[]);assert.equal(parsed.state.entries.length,16);fs.writeFileSync(file,text,{flag:'wx'});
  const cached=await Save.materialize(parsed,path.join(out,'verification-models')),restored=new Coordinator({modelFile:cached,population:16,restored:parsed.state,workers:4});restored.on('error',error=>{throw error;});
  try{
    await restored.start();const snapshot=restored.snapshot();assert.equal(snapshot.population,16);assert.equal(snapshot.running,false);assert.equal(snapshot.cars.length,16);assert.ok(snapshot.cars.every(c=>c.lifetime===0&&c.bestProgress===0));assert.deepEqual(await restored.exportState(),parsed.state);
    const verification={passed:true,file,sha256:sha(text),modelSha256:loaded.sha256,engineIdentity:Save.identity(),restoredCars:16,paused:true,generation:1,completedEpisodes:0,updates:0,sourceResult:loaded.data.verifiedFullResult,
      boundary:'Existing private engine format and fingerprint, no compatibility bypass. Fresh warm start from the independently verified numeric model; offline research is not imported as app generations. Restored actual16-agent coordinator tested paused from the line; GUI file-picker interaction not tested. The active app and its default model remain unchanged.'};
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(verification,null,2));console.log(JSON.stringify(verification));
  }finally{await restored.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
