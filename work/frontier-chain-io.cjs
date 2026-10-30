'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Model=require('./neural-frontier-chain.cjs');
function execute(config){
  if(config.op==='compatibility')return Model.compatibility();if(process.versions.node!=='24.19.0')throw Error('Pinned Node24 required');
  const model=Model.load(path.resolve(config.file),{allowExploration:config.allowExploration===true}),env=Model.createFromLoaded(model),trace=crypto.createHash('sha256'),started=performance.now();let state=env.state(),count=0,overlap=0,rows=[];
  if(!['verify','collect'].includes(config.op))throw Error('Read-only native proof or actual collection required');
  let fd=null,pending=null;if(config.op==='collect'){if(typeof config.trajectoryFile!=='string'||!config.trajectoryFile.endsWith('.f64'))throw Error('Private actual binary output required');pending=config.trajectoryFile+'.pending';fd=fs.openSync(pending,'wx');}
  function flush(){if(!rows.length)return;const values=Float64Array.from(rows.flat());fs.writeSync(fd,Buffer.from(values.buffer,values.byteOffset,values.byteLength));rows=[];}
  try{
    while(!state.complete&&performance.now()-started<180000){
      const pre=state.observation.slice();state=env.step();count++;const commands=state.car.outputs;overlap+=Number(Math.min(commands[1],commands[2])!==0);
      trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,commands])+'\n');
      if(fd!==null){const n=env.neuronalSnapshot();if(n.input.slice(0,516).some((v,i)=>v!==pre[i]))throw Error('Actual pre-control neuronal snapshot is misaligned');rows.push(n.input.concat(n.inner,commands,[state.bestProgress,state.totalSimulationSeconds,state.fitness,Number(state.complete)]));if(rows.length>=128)flush();}
    }
    if(fd!==null)flush();
  }finally{if(fd!==null)fs.closeSync(fd);}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','complete','lapTimes'].map(k=>[k,state[k]])),actionTraceSha256=trace.digest('hex'),keys=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
  const passed=state.complete&&!overlap&&keys.every(k=>result[k]===model.data.expectedResult[k])&&(!model.data.fullTraceSha256||actionTraceSha256===model.data.fullTraceSha256);
  if(passed&&fd!==null){if(fs.existsSync(config.trajectoryFile))throw Error('Preserve existing actual trace');fs.renameSync(pending,config.trajectoryFile);}
  return {passed,complete:state.complete,censored:!state.complete,modelSha256:model.sha256,quality:model.data.status,result,actionTraceSha256,overlap,actualActorControls:count,columns:530,dtype:'little-endian-float64',trajectoryFile:fd!==null?(passed?config.trajectoryFile:pending):null,wallSeconds:(performance.now()-started)/1000,
    boundary:'Actual independently loaded data-only neuronal model from the start line. Exploration-only status explicitly refuses normal clean loading. No cached physics, prerecorded driving actions, route or target controls are used. A matching collision trajectory is a provenance proof, NOT safe driving or an app-ready champion.'};
}
if(require.main===module){const result=execute(JSON.parse(process.argv[2]));process.stdout.write(JSON.stringify(result));if(result.passed===false)process.exitCode=1;}
module.exports={execute};
