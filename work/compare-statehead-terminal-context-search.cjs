'use strict';
// Research-only local longitudinal readout search from an observed stuck state.
// No route coordinates enter inference; chainage is used only to select the
// already-recorded training contexts whose motor outputs should be preserved.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-longitudinal-context-search-20261020-01');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=12000,RIDGE=.1,TARGET_DRIVE=.15;
function solve(matrix,vector){
  const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<n;col++){
    let pivot=col;for(let row=col+1;row<n;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-12)throw Error('Ill-conditioned context regression');
    [a[col],a[pivot]]=[a[pivot],a[col]];const scale=a[col][col];
    for(let j=col;j<=n;j++)a[col][j]/=scale;
    for(let row=0;row<n;row++)if(row!==col){const factor=a[row][col];for(let j=col;j<=n;j++)a[row][j]-=factor*a[col][j];}
  }
  return a.map(row=>row[n]);
}
function summarize(env){const s=env.state(),c=s.car;return {progress:s.bestProgress,laps:s.laps,lapTimes:s.lapTimes,reason:s.complete?s.reason:'censored at diagnostic control limit',seconds:s.totalSimulationSeconds,complete:s.complete,fitness:s.fitness,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),gate:env.stateHeadSnapshot().gate};}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing terminal-context search');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),full=loaded.data.weights.slice();
  const telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||telemetry.observedActionTraceSha256!==selected.actionTraceSha256||full.length!==18)throw Error('Exact protected model and replay-verified telemetry are required');
  const segment=telemetry.segments?.lap2;
  if(!Array.isArray(segment)||segment.length<10)throw Error('Observed second-lap contexts are missing');
  const target=segment.at(-1);
  if(target.speedMps!==0||target.features?.length!==9||!Number.isFinite(target.gate)||target.gate<=.5)throw Error('A verified on-track stopped context is required');
  const protectedRows=segment.filter(s=>s.gate>.5&&s.along<790&&s.speedMps>1&&s.features?.length===9);
  if(protectedRows.length<10)throw Error('Too few active pre-stall neural contexts to preserve');
  const features=target.features,rows=protectedRows.map(s=>s.features),dimension=features.length;
  const normal=Array.from({length:dimension},(_,i)=>Array.from({length:dimension},(_,j)=>rows.reduce((sum,row)=>sum+row[i]*row[j],0)+(i===j?RIDGE:0)));
  const inverseTarget=solve(normal,features),denominator=features.reduce((sum,value,i)=>sum+value*inverseTarget[i],0);
  if(!(denominator>1e-9))throw Error('Target state is not identifiable from the observed contexts');
  const currentDrive=features.reduce((sum,value,i)=>sum+value*full[i*2+1],0)/3;
  const needed=(TARGET_DRIVE-currentDrive)*3;
  const delta=inverseTarget.map(value=>value*needed/denominator);
  const updates={
    'learned-full':full,
    'zero-head-parent':Array(18).fill(0),
    'uniform-longitudinal-shift':full.map((value,i)=>i%2?value+(i===17?needed:0):value),
    'context-local-75pct':full.map((value,i)=>i%2?value+.75*delta[(i-1)/2]:value),
    'context-local-100pct':full.map((value,i)=>i%2?value+delta[(i-1)/2]:value),
    'context-local-125pct':full.map((value,i)=>i%2?value+1.25*delta[(i-1)/2]:value),
  };
  const predicted=protectedRows.map(s=>{
    const oldDrive=s.features.reduce((sum,value,i)=>sum+value*full[i*2+1],0)/3;
    const newDrive=s.features.reduce((sum,value,i)=>sum+value*updates['context-local-100pct'][i*2+1],0)/3;
    const oldNet=s.outputs[1]-s.outputs[2],change=2*s.gate*(Math.tanh(newDrive)-Math.tanh(oldDrive));
    return {along:s.along,oldNet,newNet:Math.max(-1,Math.min(1,oldNet+change))};
  });
  const targetOldDrive=currentDrive,targetNewDrive=features.reduce((sum,value,i)=>sum+value*updates['context-local-100pct'][i*2+1],0)/3;
  let topology=null;const agents=Object.entries(updates).map(([name,weights])=>{const env=Model.createFromLoaded(loaded,{weights,id:0,sharedTopology:topology});topology=env.topology;return {name,weights,env,trace:crypto.createHash('sha256'),controls:0,segments:[]};});
  const startedAt=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents.some(a=>a.env.currentCar().alive)){
      control++;
      for(const a of agents){const car=a.env.currentCar();if(!car.alive)continue;const s=a.env.step(),c=s.car;a.controls++;
        a.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
        const lap=c.laps,along=s.bestProgress-lap*telemetry.trackLength;
        if(control%10===0&&along>=650&&along<=900)a.segments.push({control,lap,progress:s.bestProgress,along,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),gate:a.env.stateHeadSnapshot().gate,lateralG:c.lateralG,longitudinalG:c.longitudinalG});
      }
      if(control%2000===0)console.log('STATEHEAD_CONTEXT_SEARCH_PROGRESS '+JSON.stringify({control,agents:agents.map(a=>({name:a.name,...summarize(a.env)}))}));
    }
    const results=agents.map(a=>({name:a.name,weightsSha256:sha(JSON.stringify(a.weights)),result:summarize(a.env),controls:a.controls,actionTraceSha256:a.trace.copy().digest('hex'),traceMatchesReference:a.name==='learned-full'&&a.trace.copy().digest('hex')===selected.actionTraceSha256,samples650to900m:a.segments}));
    const report={format:'male-cns-statehead-terminal-longitudinal-context-search-v1',appVersion:'5.6.0',passed:results.length===6&&results[0].actionTraceSha256===selected.actionTraceSha256,
      model:{sha256:loaded.sha256,file:selected.file,referenceTrace:selected.actionTraceSha256},
      method:'Six same-seed lockstep physical replays. The local coefficient update is the minimum-ridge-norm longitudinal-readout change that targets the recorded stopped state while penalizing changes to observed active pre-stall contexts. Comparison includes 75%, 100%, 125% local updates, a uniform bias shift and the zero-head parent. No inference-time route position or direct action rule is used.',
      fit:{ridge:RIDGE,targetDrive:TARGET_DRIVE,currentTargetDrive:targetOldDrive,updatedTargetDrive:targetNewDrive,protectedSampleCount:protectedRows.length,delta,protectedContextsPredicted:predicted,
        maxAbsWeight:Math.max(...updates['context-local-100pct'].map(Math.abs)),targetCorrectionBefore:2*target.gate*Math.tanh(targetOldDrive),targetCorrectionAfter:2*target.gate*Math.tanh(targetNewDrive)},
      controlsPerEpisode:control,results,gpu:Model.stats(),elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'Research-only single-seed replay; no training, model promotion, app change, or save migration. Even a successful escape requires validation across seeds and repeated generations before it can be considered a learning improvement.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_CONTEXT_SEARCH_RESULT '+JSON.stringify({passed:report.passed,controls:control,fit:report.fit,results:results.map(r=>({name:r.name,result:r.result,trace:r.actionTraceSha256,traceMatchesReference:r.traceMatchesReference,samples:r.samples650to900m.length,terminalSamples:r.samples650to900m.slice(-2)})),gpu:report.gpu,report:path.join(out,'report.json')}));
  }finally{for(const a of agents)a.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
