'use strict';
// Isolated CMA-ES over joint steering/longitudinal residuals on actual neurons.
// All candidates start from line; no intervention labels enter learning.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const {Search}=require('./neural-head-cma-transport.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const continueGeneration2=process.argv.includes('--continue-generation-2');
const wideRadius=process.argv.includes('--wide-radius');
const radius125=process.argv.includes('--radius-1-25');
if(Number(wideRadius)+Number(radius125)>1||continueGeneration2&&(wideRadius||radius125))throw Error('Choose one fresh radius experiment or preserve the original CMA basis for continuation');
const RADIUS_FACTOR=radius125?1.25:wideRadius?1.5:.75;
const previousReportFile=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-joint-cma-20261020-01/report.json');
const radiusTag=String(RADIUS_FACTOR).replace('.','-');
const out=path.join(root,`.impeccable/review/learning-ml/statehead-terminal-joint-cma-${radius125?`radius-${radiusTag}-20261020-01`:wideRadius?'wide-radius-20261020-01':continueGeneration2?'20261020-02':'20261020-01'}`);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=10500,POPULATION=4,SEED=20261020,COEFFICIENT_SCALE=1.5;
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function summary(agent,trackLength){
  const s=agent.env.state(),c=s.car,lap=Math.max(0,c.laps||0);
  return {progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.alive?'censored at diagnostic control limit':c.reason,
    complete:!c.alive,fitness:c.fitness,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),
    controls:agent.controls,along:s.bestProgress-lap*trackLength};
}
function makeAgent(loaded,topology,centres,coefficients,variant){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let lastGate=0,lastResidual=[0,0];
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const parent=brain.observe(raw);head.observe(raw);return parent;},
    motorOverride:(_model,_raw,parentRaw)=>{
      const learned=head.compose(brain.compose(parentRaw),loaded.data.weights),features=head.features();
      const gates=centres.map(c=>support(features,c.features,c.radius)),total=gates.reduce((sum,value)=>sum+value,0);lastGate=total?Math.min(1,Math.max(...gates)):0;
      if(total===0){lastResidual=[0,0];return learned;}
      const residual=[0,1].map(axis=>COEFFICIENT_SCALE*gates.reduce((sum,value,index)=>sum+value*Math.tanh(coefficients[index*2+axis]),0)/total);
      lastResidual=residual;
      if(residual[0]===0&&residual[1]===0)return learned;
      const steering=Math.max(-1+1e-9,Math.min(1-1e-9,learned[0]));
      const longitudinal=Math.max(-1+1e-9,Math.min(1-1e-9,learned[1]-learned[2]));
      const nextSteering=Math.tanh(Math.atanh(steering)+residual[0]);
      const nextLongitudinal=Math.tanh(Math.atanh(longitudinal)+residual[1]);
      return [nextSteering,Math.max(0,nextLongitudinal),Math.max(0,-nextLongitudinal)];
    }});
  return {name:variant.name,coefficients:coefficients.slice(),env,trace:crypto.createHash('sha256'),controls:0,segments:[],
    get gate(){return lastGate;},get residual(){return lastResidual.slice();}};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing joint-head CMA report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||
      telemetry.observedActionTraceSha256!==selected.actionTraceSha256||loaded.data.weights.length!==18)throw Error('Exact protected model and replay-verified telemetry are required');
  const lap1=telemetry.segments?.lap1,lap2=telemetry.segments?.lap2;
  if(!Array.isArray(lap1)||!Array.isArray(lap2)||lap1.length<10||lap2.length<10)throw Error('Actual recorded neuronal contexts required');
  const terminal=lap2.filter(s=>s.speedMps<=.25&&s.along>=790&&s.features?.length===9);
  const protectedRows=[...lap1,...lap2.filter(s=>!(s.speedMps<=.25&&s.along>=790))].filter(s=>s.features?.length===9);
  if(terminal.length<6||protectedRows.length<50)throw Error('Insufficient terminal/protected contexts');
  const centres=terminal.map(s=>{
    const nearest=Math.min(...protectedRows.map(p=>rms(s.features,p.features)));
    if(!(nearest>0))throw Error('Terminal neural centre overlaps a protected sample');
    return {control:s.control,along:s.along,features:s.features,radius:RADIUS_FACTOR*nearest,nearestProtectedDistance:nearest};
  });
  const activationAudit=[.75,1,1.25].map(factor=>{
    const activations=protectedRows.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius*factor))));
    return {radiusFactor:factor,protectedSamplesWithSupport:activations.filter(v=>v>0).length,maxProtectedActivation:Math.max(...activations)};
  });
  const search=new Search({mean:Array(centres.length*2).fill(0),sigma:.55,population:POPULATION,seed:SEED});
  let candidates,priorGeneration=null;
  if(continueGeneration2){
    const prior=JSON.parse(fs.readFileSync(previousReportFile,'utf8'));
    if(prior.passed!==true||prior.optimizer?.generation!==1||prior.optimizer?.population!==POPULATION||
        prior.results?.length!==POPULATION||prior.results[0].traceMatchesReference!==true||
        prior.model?.sha256!==loaded.sha256||prior.optimizer?.parameterCount!==centres.length*2)throw Error('A complete exact first-generation report is required');
    const firstCandidates=search.ask(Array(centres.length*2).fill(0));
    if(firstCandidates.some((vector,index)=>JSON.stringify(vector)!==JSON.stringify(prior.results[index].coefficients)))throw Error('Cannot deterministically reconstruct the first CMA-ES generation');
    search.tell(prior.results.map(row=>row.fitnessUsedByCmaEs));
    const elite=prior.results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0];
    candidates=search.ask(elite.coefficients);
    priorGeneration={report:previousReportFile,reportSha256:sha(fs.readFileSync(previousReportFile)),
      bestCandidate:elite.name,bestPhysicalFitness:elite.fitnessUsedByCmaEs,bestProgress:elite.result.progress,laps:elite.result.laps};
  }else candidates=search.ask(Array(centres.length*2).fill(0));
  const variants=continueGeneration2
    ?[{name:'learned-full-zero-joint-residual-control',coefficients:Array(centres.length*2).fill(0)},
      ...candidates.map((coefficients,index)=>({name:index===0?'joint-generation-2-protected-elite':`joint-generation-2-candidate-${String(index).padStart(2,'0')}`,coefficients}))]
    :candidates.map((coefficients,index)=>({name:index===0?'learned-full-zero-joint-residual':`joint-cma-candidate-${String(index).padStart(2,'0')}`,coefficients}));
  let topology=null;const agents=variants.map(v=>{const a=makeAgent(loaded,topology,centres,v.coefficients,v);topology=a.env.topology;return a;});
  const startedAt=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents.some(a=>a.env.currentCar().alive)){
      control++;
      for(const agent of agents){
        if(!agent.env.currentCar().alive)continue;
        const s=agent.env.step(),c=s.car;agent.controls++;
        agent.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,c.outputs])+'\n');
        const lap=c.laps||0,along=s.bestProgress-lap*telemetry.trackLength;
        if(control%5===0&&lap>=1&&along>=720&&along<=900)agent.segments.push({control,lap,progress:s.bestProgress,along,
          speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),gate:agent.gate,residual:agent.residual,
          lateralG:c.lateralG,longitudinalG:c.longitudinalG});
      }
      if(control%2000===0)console.log('STATEHEAD_TERMINAL_JOINT_CMA_PROGRESS '+JSON.stringify({control,
        agents:agents.map(a=>({name:a.name,...summary(a,telemetry.trackLength)}))}));
    }
    const results=agents.map(agent=>{
      const result=summary(agent,telemetry.trackLength),actionTraceSha256=agent.trace.copy().digest('hex');
      return {name:agent.name,coefficients:agent.coefficients,fitnessUsedByCmaEs:result.fitness,result,actionTraceSha256,
        traceMatchesReference:agent.coefficients.every(v=>v===0)&&actionTraceSha256===selected.actionTraceSha256,
        terminalSamples:agent.segments};
    });
    const completeBatch=results.every(r=>r.result.complete),optimizerUpdate=completeBatch
      ?search.tell((continueGeneration2?results.slice(1):results).map(r=>r.fitnessUsedByCmaEs)):null;
    const gpu=Model.stats(),report={format:'male-cns-statehead-terminal-joint-cma-v1',appVersion:'5.6.0',
      passed:results.length===(continueGeneration2?POPULATION+1:POPULATION)&&results[0].traceMatchesReference&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&completeBatch,
      learningSucceeded:results.some(r=>r.result.laps>=2),model:{sha256:loaded.sha256,file:selected.file,referenceTrace:selected.actionTraceSha256},
      method:continueGeneration2
        ?'Second CMA-ES generation reconstructed deterministically from the actual complete first-generation episodes and scores. Four full-from-line CUDA episodes reevaluate the protected elite and three new joint steering/longitudinal candidates; an additional zero-residual full replay verifies the untouched baseline. Only complete episodes enter CMA-ES ranking. No route/time input, teacher, diagnostic intervention, changed physics/reward, parent policy, save migration or candidate promotion.'
        :'One same-seed CMA-ES generation on 24 coefficients (steering and longitudinal residuals across 12 compact neuronal RBF centres). Four actual full-from-line CUDA episodes include an exact zero-residual baseline. CMA-ES ranks only complete episodes by the unchanged physical fitness ledger; an incomplete/censored batch is never passed to the optimizer. At inference the residual reads only current 9-D neuronal features. No scripted route, teacher actions, intervention, physics/reward change, parent/sensor change, save migration, or model promotion.',
      optimizer:{name:'CMA-ES',population:POPULATION,evaluatedEpisodes:results.length,seed:SEED,generation:optimizerUpdate?.generation??0,sigma:optimizerUpdate?.sigma??null,
        parameterCount:centres.length*2,centres:centres.length,coefficientScale:COEFFICIENT_SCALE,
        fitness:'actual complete episode fitness; no censored candidate ranking',...(priorGeneration?{continuedFrom:priorGeneration}:{})},
      gate:{metric:'Maximum compact-support RBF; RMS over 9 actual neuronal projection features',
        radiusFactor:RADIUS_FACTOR,
        centres:centres.map(({features,...c})=>c),terminalContextSamples:terminal.length,
        protectedFirstLapSamples:lap1.filter(s=>s.features?.length===9).length,
        protectedOtherSecondLapSamples:lap2.filter(s=>!(s.speedMps<=.25&&s.along>=790)&&s.features?.length===9).length,activationAudit},
      controlsPerEpisode:control,completeBatch,results,
      bestByPhysicalFitness:completeBatch?results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0].name:null,
      gpu,elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'Single-seed exploratory study only. Success requires at least two genuinely completed laps and independent seeds, plus separate cross-model/circuit/cold-start validation before any promotion.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_TERMINAL_JOINT_CMA_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      controls:control,completeBatch,optimizer:report.optimizer,
      results:results.map(r=>({name:r.name,progress:r.result.progress,laps:r.result.laps,fitness:r.fitnessUsedByCmaEs,
        reason:r.result.reason,traceMatchesReference:r.traceMatchesReference,controls:r.result.controls})),gpu,
      report:path.join(out,'report.json')}));
  }finally{for(const a of agents)a.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
