'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Coordinator}=require('./neural-projected-coordinator.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),out=path.join(base,'projected-live-generations'),file=path.join(base,'projected-block-3680/model.malecns-projected-frontier.json');
async function main(){
  fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'report.json')))throw Error('Preserve the existing actual generation report');
  const c=new Coordinator({modelFile:file,population:16,mutation:.16,speedMultiplier:30,workers:4}),initialSha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');let error=null;
  c.on('error',e=>{error=e;});
  try{
    await c.start();assert.equal(c.running,false);assert.equal(c.entries.length,16);assert.ok(c.entries.some(e=>JSON.stringify(e.weights)!==JSON.stringify(c.entries[0].weights)));
    const initialGenes=c.snapshot().experiment.genesHash,started=Date.now();await c.pause(true);
    while(c.history.length<2&&!error&&Date.now()-started<600000){await new Promise(r=>setTimeout(r,500));if(c.history.length){fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({generation:c.generation,history:c.history,actualEpisodes:c.completedEpisodes},null,2));}}
    if(error)throw error;await c.pause(false);assert.equal(c.history.length,2);assert.equal(c.completedEpisodes,32);assert.equal(c.updates,2);assert.equal(c.generation,3);
    assert.ok(c.history.every(h=>h.actualEpisodes===16&&h.rewardRevision==='progress-5-crash-safety-experiment'));assert.notEqual(c.snapshot().experiment.genesHash,initialGenes);assert.ok(c.archive.evaluations>=33);
    const state=await c.exportState(),report={passed:true,modelSha256:initialSha,nodeVersion:process.versions.node,population:16,actualEpisodes:32,updates:2,generation:3,
      wallSeconds:(Date.now()-started)/1000,history:c.history,champion:c.archive.champion,state,
      boundary:'Two actual native16-car populations from the line, nonzero block mutation from the very first population. Whole-population barrier and reward-ranked archive, not cached practice. No claim of improved champion or completed laps unless the recorded actual metrics show them. Diagnostic wall watchdog only; timed-out incomplete populations cannot pass.'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('PROJECTED_GENERATIONS '+JSON.stringify({passed:true,episodes:32,updates:2,champion:c.archive.champion,history:c.history}));
  }finally{await c.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
