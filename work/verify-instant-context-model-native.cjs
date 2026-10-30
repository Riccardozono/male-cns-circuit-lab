'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Model=require('./neural-instant-context-model.cjs'),I=require('./neural-research-source-identity.cjs');
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:false});
try{
 const loaded=Model.load(file,{allowResearch:true}),env=Model.createFromLoaded(loaded),trace=crypto.createHash('sha256'),start=Date.now();let state=env.state(),controls=0;
 assert.equal(state.bestProgress,0);assert.equal(state.totalSimulationSeconds,0);
 while(!state.complete){if(Date.now()-start>180000)throw Error('Declared complete native proof wall bound');state=env.step();controls++;assert.equal(Math.min(state.car.outputs[1],state.car.outputs[2]),0);trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
 const actionTraceSha256=trace.digest('hex'),result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'].map(k=>[k,state[k]]));
 assert.equal(actionTraceSha256,loaded.data.fullTraceSha256);for(const k of Object.keys(result))assert.deepEqual(result[k],loaded.data.expectedResult[k],k);assert.equal(Model.stats().cpuFallbacks,0);
 const report={passed:true,pid:process.pid,nodeVersion:process.versions.node,modelSha256:loaded.sha256,parentModelSha256:loaded.data.parentSha256,complete:true,censored:false,controls,result,actionTraceSha256,cuda:Model.stats(),sourceCompatibility:Model.compatibility(),verifierSha256:I.sha(fs.readFileSync(__filename)),wallSeconds:(Date.now()-start)/1000,boundary:'Fresh standalone from-line native execution of embedded numeric parent, neural basis and learned weights. No optimizer, saved physical pose, original user save or action tape used.'};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,pid:process.pid,modelSha256:loaded.sha256,controls,result,actionTraceSha256}));
}catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}finally{Model.close();}
