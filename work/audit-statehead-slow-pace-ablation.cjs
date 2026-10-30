'use strict';
// Diagnostic only: preserves slow-progress penalties but does not terminate
// an episode solely for low recent pace. Never loaded by the desktop app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const simFile=path.join(root,'.impeccable/experimental-penalty5/outputs/simulation.js');
const rewardsFile=path.join(root,'.impeccable/experimental-penalty5/outputs/rewards.js');
const liveFile=path.join(__dirname,'neural-command-live-cuda.cjs');
const rewardSource=fs.readFileSync(rewardsFile,'utf8');
const terminal="if(car.lifetime>=RULES.paceGraceSeconds&&recentPace<minimum){debit(car,'slowProgress',RULES.stall);reason='troppo lenta / senza progresso';}";
if(!rewardSource.includes(terminal))throw Error('Expected terminal slow-pace rule was not found exactly');
const diagnosticSource=rewardSource.replace(terminal,"if(car.lifetime>=RULES.paceGraceSeconds&&recentPace<minimum){debit(car,'slowProgress',RULES.stall);}");
const rewardModule=new Module(path.join(root,'.impeccable/review/neural-sacl/diagnostic-slow-pace-rewards.cjs'),module);
rewardModule.filename=path.join(root,'.impeccable/review/neural-sacl/diagnostic-slow-pace-rewards.cjs');
rewardModule.paths=Module._nodeModulePaths(path.dirname(rewardModule.filename));
rewardModule._compile(diagnosticSource,rewardModule.filename);
const simModule=new Module(simFile,module);simModule.filename=simFile;simModule.paths=Module._nodeModulePaths(path.dirname(simFile));
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(parent===simModule&&request==='./rewards.js')return rewardModule.exports;
  if(parent?.filename===liveFile&&request==='../.impeccable/experimental-penalty5/outputs/simulation.js')return simModule.exports;
  return originalLoad.call(this,request,parent,isMain);
};
try{simModule._compile(fs.readFileSync(simFile,'utf8'),simFile);}finally{Module._load=originalLoad;}
Module._load=function(request,parent,isMain){
  if(parent?.filename===liveFile&&request==='../.impeccable/experimental-penalty5/outputs/simulation.js')return simModule.exports;
  return originalLoad.call(this,request,parent,isMain);
};

async function main(){
  const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'');
  const maxControls=Number(process.argv.find(a=>a.startsWith('--max-controls='))?.slice(15)||12000);
  if(!output||await fs.promises.stat(output).then(()=>true,()=>false))throw Error('Provide a new --output directory; never overwrite evidence');
  if(!Number.isInteger(maxControls)||maxControls<8495||maxControls>30000)throw Error('Diagnostic control cap must be 8,495–30,000');
  const Model=require('./neural-statehead-cuda-model.cjs');
  try{
    if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
    const selected=Model.defaultChoice(),loaded=Model.load(selected.file),env=Model.createFromLoaded(loaded,{weights:loaded.data.weights});
    const samples=[];let state,controls=0;
    for(controls=1;controls<=maxControls;controls++){
      state=env.step();
      if(controls%500===0||state.car.laps>0&&!samples.some(x=>x.laps===state.car.laps)){
        const c=state.car;samples.push({control:controls,simulatedSeconds:c.lifetime,progress:c.bestProgress,laps:c.laps,speed:c.speed,outputs:c.outputs,slowProgressPenalty:c.rewardBreakdown.penalties.slowProgress,reason:c.reason,alive:c.alive});
      }
      if(!state.car.alive||state.car.laps>=2)break;
    }
    const c=state.car,report={format:'statehead-slow-pace-nonterminal-diagnostic-v1',passed:true,diagnosticOnly:true,model:{file:selected.file,sha256:selected.modelSha256},runtime:process.versions.node,sourceRules:{file:rewardsFile,sha256:crypto.createHash('sha256').update(rewardSource).digest('hex')},variant:'Same actual physics and slowProgress penalty; removed only the terminal reason assignment for low recent pace. The independent 8-second no-progress stop and 2-lap cap remain unchanged.',maxControls,controls,complete:!c.alive,censored:c.alive&&controls>=maxControls,result:{progress:c.bestProgress,laps:c.laps,lapTimes:c.lapTimes,reason:c.alive?'diagnostic control cap':c.reason,alive:c.alive,simulatedSeconds:c.lifetime,speed:c.speed,outputs:c.outputs,slowProgressPenalty:c.rewardBreakdown.penalties.slowProgress,stallPenalty:c.rewardBreakdown.penalties.stall,fitness:c.fitness},samples,gpu:Model.stats(),interpretation:'One deterministic baseline rollout only. A positive result does not prove generation-level learning; a censored result is not a failure of the two-lap objective.'};
    await fs.promises.mkdir(output,{recursive:false});await fs.promises.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
    console.log('STATEHEAD_SLOW_PACE_DIAGNOSTIC '+JSON.stringify({controls,complete:report.complete,censored:report.censored,result:report.result,gpu:report.gpu,report:path.join(output,'report.json')}));
  }finally{Model.closeCuda();Module._load=originalLoad;}
}
main().catch(error=>{console.error(error.stack||String(error));Module._load=originalLoad;process.exitCode=1;});
