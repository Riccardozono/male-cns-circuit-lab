'use strict';
// Paired diagnostic only: exposes an already-learned neural correction when
// measured speed collapses while the frozen controller is braking. It does
// not issue a recovery action and never reads route, position, lap, or time.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const Motor=require('./neural-command-residual.cjs');
const root=path.resolve(__dirname,'..');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function makeContextGateEnv(loaded,topology,gateStrength){
  const genes=loaded.data.weights.slice(),brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  let hasMoved=false,recoveryContext=false,lastGate=0,firstGateControl=null,controls=0,lowSpeedBrakeControls=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
    onReset:()=>{brain.reset();head.reset();hasMoved=false;recoveryContext=false;lastGate=0;controls=0;firstGateControl=null;lowSpeedBrakeControls=0;},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior,car)=>{
      const base=brain.compose(prior),speed=Math.max(0,Number(car.speed)||0);
      if(speed>1.5){hasMoved=true;if(speed>2.5)recoveryContext=false;}
      if(hasMoved&&speed<0.6&&base[2]>=0.5)lowSpeedBrakeControls++;
      else lowSpeedBrakeControls=0;
      if(hasMoved&&lowSpeedBrakeControls>=10)recoveryContext=true;
      const contextual=recoveryContext?gateStrength:0,gate=Math.max(head.value(),contextual);
      if(contextual>0&&firstGateControl===null)firstGateControl=controls+1;
      const features=head.features();
      const drive=[0,1].map(a=>features.reduce((sum,f,k)=>sum+f*genes[k*2+a],0)/3);
      const residual=[Math.tanh(.2*drive[0]),Math.tanh(drive[1])];
      lastGate=gate;controls++;
      return Motor.compose(base,gate,residual);
    }});
  return {env,gateState:()=>({hasMoved,recoveryContext,lastGate,firstGateControl,controls,lowSpeedBrakeControls})};
}
function summary(state,context){
  const c=state.car;return {controls:Math.round(c.lifetime*10),progress:c.bestProgress,laps:c.laps,lapTimes:c.lapTimes,reason:c.alive?'':c.reason,alive:c.alive,simulatedSeconds:c.lifetime,speed:c.speed,outputs:c.outputs,fitness:c.fitness,context:context?.()||null};
}
async function rollout(selected,loaded,gateStrength,maxControls){
  const baseline=Model.createFromLoaded(loaded,{weights:loaded.data.weights,id:0});
  const tested=makeContextGateEnv(loaded,baseline.topology,gateStrength);
  const records=[];let firstOutputDivergence=null,maxOutputDelta=0,controls=0,a,b;
  for(controls=1;controls<=maxControls;controls++){
    a=baseline.step();b=tested.env.step();
    const ca=a.car,cb=b.car,delta=Math.max(...ca.outputs.map((v,i)=>Math.abs(v-cb.outputs[i])));maxOutputDelta=Math.max(maxOutputDelta,delta);
    if(firstOutputDivergence===null&&delta>1e-8)firstOutputDivergence=controls;
    if(controls%500===0||ca.laps!==records.at(-1)?.baselineLaps||cb.laps!==records.at(-1)?.testedLaps){records.push({control:controls,baselineProgress:ca.bestProgress,baselineLaps:ca.laps,testedProgress:cb.bestProgress,testedLaps:cb.laps,testedSpeed:cb.speed,testedOutputs:cb.outputs,context:tested.gateState()});}
    if(!ca.alive&&!cb.alive||ca.laps>=2||cb.laps>=2)break;
  }
  const baseResult=summary(a,null),testedResult=summary(b,tested.gateState);
  baseline.runtime.close?.();
  return {gateStrength,controls,firstOutputDivergence,maxOutputDelta,baseline:baseResult,tested:testedResult,samples:records};
}
async function main(){
  const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'');
  const maxControls=Number(process.argv.find(a=>a.startsWith('--max-controls='))?.slice(15)||16000);
  if(!output||await fs.stat(output).then(()=>true,()=>false))throw Error('Provide a new --output directory; existing evidence is never overwritten');
  if(!Number.isInteger(maxControls)||maxControls<8495||maxControls>30000)throw Error('Use 8,495–30,000 diagnostic controls');
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),results=[];
  try{
    for(const strength of [0.2,0.8]){
      results.push(await rollout(selected,loaded,strength,maxControls));
      console.log('STATEHEAD_STUCK_CONTEXT_VARIANT '+JSON.stringify({gateStrength:strength,controls:results.at(-1).controls,baseline:results.at(-1).baseline,tested:results.at(-1).tested,firstOutputDivergence:results.at(-1).firstOutputDivergence,maxOutputDelta:results.at(-1).maxOutputDelta}));
      Model.closeCuda();
    }
    const report={format:'statehead-stuck-context-gate-diagnostic-v1',passed:results.length===2,diagnosticOnly:true,model:{file:selected.file,sha256:selected.modelSha256},parentProof:selected.proofFile,runtime:process.versions.node,sourceSha256:crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),gate:'Raised only after the car has previously moved and then remains below 0.6 m/s for 10 controls (1 simulated second) while the frozen controller commands at least 0.5 brake; released above 2.5 m/s. The gate reads speed and the current motor output only, never route/progress/lap/time, and does not prescribe an action.',results,interpretation:'Same-seed paired physical replay of the verified learned coefficients. Diagnostic success is not a trained model or proof of generalization; the gate itself supplies no steering/throttle/brake command.'};
    await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
    console.log('STATEHEAD_STUCK_CONTEXT_REPORT '+JSON.stringify({passed:report.passed,results:results.map(r=>({gateStrength:r.gateStrength,baseline:r.baseline,tested:r.tested,firstOutputDivergence:r.firstOutputDivergence,maxOutputDelta:r.maxOutputDelta})),report:path.join(output,'report.json')}));
  }finally{Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
