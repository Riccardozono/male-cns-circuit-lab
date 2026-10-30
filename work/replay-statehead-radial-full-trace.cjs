'use strict';
// Isolated physical replay only: records every exact V3/Monza control, derives
// a compact neuronal RBF gate protected against all earlier recorded states,
// then replays one previously evaluated residual. Does not edit/promote saves.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const priorFile=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-joint-cma-20261020-02/report.json');
const out=path.resolve(process.env.MALECNS_RADIAL_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/statehead-radial-full-trace-replay-20261020-01'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function makeTrace(){return crypto.createHash('sha256');}
function resultSummary(state,control,trackLength){const c=state.car;return {complete:state.complete===true,progress:state.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),fitness:c.fitness,reason:c.reason,totalSimulationSeconds:state.totalSimulationSeconds,controls:control,along:state.bestProgress-Math.max(0,c.laps||0)*trackLength,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice()};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing diagnostic output');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file);
  const telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  const prior=JSON.parse(fs.readFileSync(priorFile,'utf8'));
  if(loaded.sha256!==telemetry.modelSha256||selected.actionTraceSha256!==telemetry.selectedActionTraceSha256||telemetry.observedActionTraceSha256!==selected.actionTraceSha256||
     !prior.passed||prior.model?.sha256!==loaded.sha256||prior.optimizer?.generation!==2||!Array.isArray(prior.results))throw Error('Exact protected V3/Monza model and prior complete diagnostics required');
  const best=prior.results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0];
  if(!best||best.coefficients.length!==24)throw Error('A previously evaluated 24-coefficient residual is required');
  const env=Model.createFromLoaded(loaded,{id:0}),trackLength=telemetry.trackLength,baselineRows=[],baselineTrace=makeTrace();
  let baselineState=null,control=0;
  try{
    while(control<12000){
      baselineState=env.step();control++;
      const car=env.currentCar(),snapshot=env.stateHeadSnapshot();
      baselineTrace.update(JSON.stringify([baselineState.bestProgress,baselineState.totalSimulationSeconds,car.outputs])+'\n');
      baselineRows.push({control,progress:baselineState.bestProgress,lap:car.laps||0,along:baselineState.bestProgress-Math.max(0,car.laps||0)*trackLength,
        speedMps:car.vehicle?.speedMps??0,features:snapshot.features});
      if(control%2000===0)console.log('RADIAL_REPLAY_BASELINE '+JSON.stringify({control,progress:baselineState.bestProgress,laps:car.laps,speedMps:car.vehicle?.speedMps??0}));
      if(baselineState.complete)break;
    }
    const baselineHash=baselineTrace.digest('hex'),baseline=resultSummary(baselineState,control,trackLength);
    if(!baseline.complete||baselineHash!==selected.actionTraceSha256||control!==telemetry.controls||baseline.progress!==telemetry.result.progress||baseline.laps!==telemetry.result.laps)
      throw Error('Fresh complete exact V3 baseline replay did not match the protected reference');

    const terminal=telemetry.segments.lap2.filter(s=>s.speedMps<=.25&&s.along>=790&&s.features?.length===9);
    if(terminal.length<6)throw Error('Insufficient actual stationary terminal neuronal contexts');
    for(const row of terminal){const exact=baselineRows[row.control-1];if(!exact||exact.control!==row.control||exact.features.some((v,i)=>v!==row.features[i]))throw Error(`Every fifth-control telemetry check failed at ${row.control}`);}
    const targetStart=Math.min(...terminal.map(s=>s.control));
    const protectedRows=baselineRows.filter(row=>row.control<targetStart);
    const centres=terminal.map(row=>{
      const nearest=Math.min(...protectedRows.map(p=>rms(row.features,p.features)));
      if(!(nearest>0))throw Error(`Terminal state overlaps prior exact trajectory at control ${row.control}`);
      return {control:row.control,features:row.features.slice(),radius:.95*nearest,nearestProtectedDistance:nearest};
    });
    const allBefore=baselineRows.filter(row=>row.control<targetStart).map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius))));
    const targetActivation=terminal.map(row=>({control:row.control,activation:Math.max(...centres.map(c=>support(row.features,c.features,c.radius)))}));
    if(allBefore.some(v=>v>0)||!targetActivation.some(r=>r.activation>0))throw Error('Full-trajectory radial support audit failed');

    const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let lastGate=0,lastResidual=[0,0];
    const candidateEnv=Live.create(loaded.modelFile,{sharedTopology:env.topology,id:1,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
      onReset:()=>{brain.reset();head.reset();},
      actionOverride:(_model,raw)=>{const parent=brain.observe(raw);head.observe(raw);return parent;},
      motorOverride:(_model,_raw,parentRaw)=>{
        const learned=head.compose(brain.compose(parentRaw),loaded.data.weights),features=head.features();
        const gates=centres.map(c=>support(features,c.features,c.radius)),total=gates.reduce((sum,value)=>sum+value,0);
        lastGate=total?Math.min(1,Math.max(...gates)):0;
        if(total===0){lastResidual=[0,0];return learned;}
        lastResidual=[0,1].map(axis=>1.5*gates.reduce((sum,value,index)=>sum+value*Math.tanh(best.coefficients[index*2+axis]),0)/total);
        const steering=Math.max(-1+1e-9,Math.min(1-1e-9,learned[0]));
        const longitudinal=Math.max(-1+1e-9,Math.min(1-1e-9,learned[1]-learned[2]));
        const nextSteering=Math.tanh(Math.atanh(steering)+lastResidual[0]);
        const nextLongitudinal=Math.tanh(Math.atanh(longitudinal)+lastResidual[1]);
        return [nextSteering,Math.max(0,nextLongitudinal),Math.max(0,-nextLongitudinal)];
      }});
    const candidateTrace=makeTrace(),activationRows=[];let candidateState=null,candidateControls=0;
    try{
      while(candidateControls<12000){
        candidateState=candidateEnv.step();candidateControls++;
        const car=candidateEnv.currentCar();
        candidateTrace.update(JSON.stringify([candidateState.bestProgress,candidateState.totalSimulationSeconds,car.outputs])+'\n');
        if(lastGate>0||candidateControls>=targetStart-2&&candidateControls<=targetStart+80){const snap=head.features();activationRows.push({control:candidateControls,progress:candidateState.bestProgress,
          along:candidateState.bestProgress-Math.max(0,car.laps||0)*trackLength,speedMps:car.vehicle?.speedMps??0,gate:lastGate,residual:lastResidual.slice(),features:snap});}
        if(candidateControls%2000===0)console.log('RADIAL_REPLAY_CANDIDATE '+JSON.stringify({control:candidateControls,progress:candidateState.bestProgress,laps:car.laps,speedMps:car.vehicle?.speedMps??0,gate:lastGate}));
        if(candidateState.complete)break;
      }
      const candidateHash=candidateTrace.digest('hex'),candidate=resultSummary(candidateState,candidateControls,trackLength);
      const firstSupport=activationRows.find(row=>row.gate>0)?.control??null;
      const report={format:'male-cns-statehead-radial-full-trace-replay-v1',appVersion:'5.6.0',passed:true,learningSucceeded:candidate.laps>=2,
        model:{sha256:loaded.sha256,file:selected.file,protectedReferenceTraceSha256:selected.actionTraceSha256},
        baseline:{...baseline,actionTraceSha256:baselineHash,exactReferenceMatch:true},
        gate:{metric:'Compact RBF on the V3 nine-feature neuronal projection; each radius is 0.95 times its exact nearest distance to every protected baseline control before target activation',
          targetStartControl:targetStart,protectedBaselineControls:protectedRows.length,targetCentres:centres.length,
          centres:centres.map(({features,...row})=>row),fullPreTargetTrajectory:{maxActivation:Math.max(0,...allBefore),controlsWithActivation:allBefore.filter(v=>v>0).length},
          sampledTerminalActivations:targetActivation,firstSupportControl:firstSupport},
        candidate:{name:best.name,sourceReportSha256:sha(fs.readFileSync(priorFile)),coefficients:best.coefficients,coefficientScale:1.5,
          ...candidate,actionTraceSha256:candidateHash,activationRows},
        gpu:Model.stats(),elapsedWallSeconds:null,
        boundary:'Isolated exact V3/Monza physical replay, not the Windows app. Baseline matched the protected complete trace; candidate used one previously evaluated neuronal residual with support checked against all 8,439 earlier controls. No route, geometry, time, teacher, altered reward/physics, save migration, app edit, version change, or promotion.'};
      fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
      console.log('RADIAL_REPLAY_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,
        gate:{targetStartControl:targetStart,protectedControls:protectedRows.length,maxPriorActivation:report.gate.fullPreTargetTrajectory.maxActivation,firstSupportControl:firstSupport},
        candidate:report.candidate,output:path.join(out,'report.json')}));
    }finally{candidateEnv.close?.();}
  }finally{env.close?.();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
