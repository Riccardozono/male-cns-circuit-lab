'use strict';
// Observe an actually learned exploration branch. Never choose driving actions
// from body pose, time, route coordinates, target controls or an external pilot.
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Core=require('./neural-command-env.cjs'),R=require('./neural-projected-residual.cjs');
function create(configuration){
  const core=Core.create(configuration);
  function collect(actor,file){
    R.validateActor(actor);if(typeof file!=='string'||!file.endsWith('.f64'))throw Error('Bounded real trajectory file required');
    const pending=file+'.pending',fd=fs.openSync(pending,'wx'),started=performance.now(),trace=crypto.createHash('sha256');let s=core.reset('full'),rows=[],count=0,overlap=0;
    function flush(){if(!rows.length)return;const values=Float64Array.from(rows.flat());fs.writeSync(fd,Buffer.from(values.buffer,values.byteOffset,values.byteLength));rows=[];}
    try{
      while(!s.terminated&&performance.now()-started<180000){
        const pre=s.observation.slice(),action=R.forward(actor,R.normalize(pre,core.prepared.normalization)),next=core.step(action),commands=core.inspect().lastCommands;
        overlap+=Number(Math.min(commands[1],commands[2])!==0);
        rows.push(pre.concat(action,commands,[next.info.bestProgress,next.info.totalSimulationSeconds,next.info.fitness,Number(next.terminated)]));count++;if(rows.length>=128)flush();
        trace.update(JSON.stringify([next.info.bestProgress,next.info.totalSimulationSeconds,commands])+'\n');s=next;
      }
      flush();
    }finally{fs.closeSync(fd);}
    const complete=s.terminated===true;if(complete&&!overlap){if(fs.existsSync(file))throw Error('Preserve prior trajectory');fs.renameSync(pending,file);}
    return {complete,censored:!complete,actualActorControls:count,columns:530,dtype:'little-endian-float64',gasBrakeOverlapSteps:overlap,result:s.info,actionTraceSha256:trace.digest('hex'),file:complete&&!overlap?file:pending,wallSeconds:(performance.now()-started)/1000,
      boundary:'Actual full from-line raw neuronal observations and actual executed commands. Pose/time/progress columns are diagnostic only and must not enter a driving controller. A crashing branch is exploration data, NOT a clean champion or an app installation.'};
  }
  return {collect,evaluate:core.evaluate,metadata:core.metadata};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{
  if(line.length>16384)throw Error('Bounded private request required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;
  if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}
  else if(!env)throw Error('Initialize first');else if(m.op==='collect'||m.op==='evaluate'){const actor=JSON.parse(fs.readFileSync(m.actorFile,'utf8'));result=m.op==='collect'?env.collect(actor,m.file):env.evaluate(actor,{mode:m.mode});}
  else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={create};
