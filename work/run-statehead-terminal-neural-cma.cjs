'use strict';
// Isolated one-generation CMA-ES search over local neuronal longitudinal
// residuals. Every candidate is ranked only by the physical episode fitness.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const {Search}=require('./neural-head-cma-transport.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const continueGeneration2=process.argv.includes('--continue-generation-2');
const previousReportFile=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-neural-cma-20261020-02/report.json');
const out=path.join(root,`.impeccable/review/learning-ml/statehead-terminal-neural-cma-${continueGeneration2?'20261020-03':'20261020-02'}`);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=10500,POPULATION=4,SEED=20261020,COEFFICIENT_SCALE=1.5;
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function gateValues(features,centres){return centres.map(centre=>support(features,centre.features,centre.radius));}
function summarize(agent,trackLength){
  const s=agent.env.state(),c=s.car,lap=Math.max(0,c.laps||0);
  return {progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.alive?'censored at diagnostic control limit':c.reason,
    seconds:s.totalSimulationSeconds,complete:!c.alive,fitness:c.fitness,speedMps:c.vehicle?.speedMps??0,
    outputs:c.outputs.slice(),along:s.bestProgress-lap*trackLength};
}
function makeAgent(loaded,topology,centres,coefficients,variant){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{
      const learned=head.compose(brain.compose(prior),loaded.data.weights),gates=gateValues(head.features(),centres);
      const total=gates.reduce((sum,value)=>sum+value,0);
      if(total===0)return learned;
      const residual=COEFFICIENT_SCALE*gates.reduce((sum,value,index)=>sum+value*Math.tanh(coefficients[index]),0)/total;
      if(residual===0)return learned;
      const longitudinal=Math.max(-1+1e-9,Math.min(1-1e-9,learned[1]-learned[2]));
      const corrected=Math.tanh(Math.atanh(longitudinal)+residual);
      return [learned[0],Math.max(0,corrected),Math.max(0,-corrected)];
    }});
  return {name:variant.name,coefficients:coefficients.slice(),env,trace:crypto.createHash('sha256'),controls:0,segments:[]};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing CMA replay report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||
      telemetry.observedActionTraceSha256!==selected.actionTraceSha256||loaded.data.weights.length!==18)throw Error('Exact protected model and replay-verified telemetry are required');
  const lap1=telemetry.segments?.lap1,lap2=telemetry.segments?.lap2;
  if(!Array.isArray(lap1)||!Array.isArray(lap2)||lap1.length<10||lap2.length<10)throw Error('Recorded lap contexts are required');
  // Recorded route position selects where diagnostic neural centres come from;
  // the live policy receives only 9-D neuronal state and actual episode fitness.
  const terminal=lap2.filter(s=>s.speedMps<=.25&&s.along>=790&&s.features?.length===9);
  const protectedRows=[...lap1,...lap2.filter(s=>!(s.speedMps<=.25&&s.along>=790))].filter(s=>s.features?.length===9);
  if(terminal.length<6||protectedRows.length<50)throw Error('Insufficient terminal or protected contexts');
  const centres=terminal.map(s=>{
    const nearest=Math.min(...protectedRows.map(p=>rms(s.features,p.features)));
    if(!(nearest>0))throw Error('Terminal centre overlaps a protected context');
    return {control:s.control,along:s.along,features:s.features,radius:.75*nearest,nearestProtectedDistance:nearest};
  });
  const activationAudit=[.75,1,1.25].map(factor=>{
    const activations=protectedRows.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius*factor))));
    return {radiusFactor:factor,protectedSamplesWithSupport:activations.filter(v=>v>0).length,maxProtectedActivation:Math.max(...activations)};
  });
  const search=new Search({mean:Array(centres.length).fill(0),sigma:.55,population:POPULATION,seed:SEED});
  let candidates,priorGeneration=null;
  if(continueGeneration2){
    const prior=JSON.parse(fs.readFileSync(previousReportFile,'utf8'));
    if(prior.passed!==true||prior.optimizer?.generation!==1||prior.optimizer?.population!==POPULATION||
        prior.results?.length!==POPULATION||prior.results[0].traceMatchesReference!==true||
        prior.model?.sha256!==loaded.sha256||prior.gate?.centres?.length!==centres.length)throw Error('A complete, exact first-generation physical report is required');
    const firstCandidates=search.ask(Array(centres.length).fill(0));
    if(firstCandidates.some((vector,index)=>JSON.stringify(vector)!==JSON.stringify(prior.results[index].coefficients)))throw Error('Cannot reconstruct the original deterministic CMA-ES generation');
    search.tell(prior.results.map(row=>row.fitnessUsedByCmaEs));
    const elite=prior.results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0];
    candidates=search.ask(elite.coefficients);
    priorGeneration={report:previousReportFile,reportSha256:sha(fs.readFileSync(previousReportFile)),
      bestCandidate:elite.name,bestPhysicalFitness:elite.fitnessUsedByCmaEs,bestProgress:elite.result.progress,laps:elite.result.laps};
  }else candidates=search.ask(Array(centres.length).fill(0));
  const variants=continueGeneration2
    ?[{name:'learned-full-zero-residual-control',coefficients:Array(centres.length).fill(0),cmaCandidate:false},
      ...candidates.map((coefficients,index)=>({name:index===0?'generation-2-protected-elite':`generation-2-cma-candidate-${String(index).padStart(2,'0')}`,coefficients,cmaCandidate:true}))]
    :candidates.map((coefficients,index)=>({name:index===0?'learned-full-zero-residual':`cma-candidate-${String(index).padStart(2,'0')}`,coefficients,cmaCandidate:true}));
  let topology=null;
  const agents=variants.map(variant=>{const agent=makeAgent(loaded,topology,centres,variant.coefficients,variant);topology=agent.env.topology;return agent;});
  const startedAt=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents.some(agent=>agent.env.currentCar().alive)){
      control++;
      for(const agent of agents){
        if(!agent.env.currentCar().alive)continue;
        const s=agent.env.step(),c=s.car;agent.controls++;
        agent.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
        const lap=c.laps||0,along=s.bestProgress-lap*telemetry.trackLength;
        if(control%10===0&&along>=700&&along<=900)agent.segments.push({control,lap,progress:s.bestProgress,along,
          speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),lateralG:c.lateralG,longitudinalG:c.longitudinalG});
      }
      if(control%1000===0)console.log('STATEHEAD_TERMINAL_CMA_PROGRESS '+JSON.stringify({control,agents:agents.map(agent=>({name:agent.name,...summarize(agent,telemetry.trackLength)}))}));
    }
    const results=agents.map(agent=>{
      const actionTraceSha256=agent.trace.copy().digest('hex'),result=summarize(agent,telemetry.trackLength);
      return {name:agent.name,coefficients:agent.coefficients,fitnessUsedByCmaEs:result.fitness,result,controls:agent.controls,
        actionTraceSha256,traceMatchesReference:agent.coefficients.every(value=>value===0)&&actionTraceSha256===selected.actionTraceSha256,
        samples700to900m:agent.segments};
    });
    const optimizerUpdate=search.tell((continueGeneration2?results.slice(1):results).map(row=>row.fitnessUsedByCmaEs));
    const gpu=Model.stats(),report={format:'male-cns-statehead-terminal-neural-cma-v1',appVersion:'5.6.0',
      passed:results.length===(continueGeneration2?POPULATION+1:POPULATION)&&results[0].traceMatchesReference&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      model:{sha256:loaded.sha256,file:selected.file,referenceTrace:selected.actionTraceSha256},
      method:continueGeneration2
        ?'Second actual CMA-ES generation, reconstructed deterministically from the exact first-generation proposals and their recorded physical fitness. Four same-seed CUDA physical replays score the protected elite and three new proposals; an additional exact zero-residual episode verifies the unmodified baseline. CMA-ES receives only completed episode physical fitness. Live residual is a bounded weighted combination of current 9-D neuronal activations in longitudinal latent space; steering, route/time inputs, sensors, physics, rewards, parent model, app and saves are unchanged. No candidate is promoted.'
        :'One actual CMA-ES generation over 12 (recorded terminal-context) neuronal RBF coefficients. Four same-seed CUDA physical replays include the exact zero-residual baseline and three sampled candidates. CMA-ES receives only each completed episode physical fitness. Live residual is a bounded weighted combination of current 9-D neuronal activations, added in longitudinal latent space; steering, route/time inputs, sensors, physics, rewards, parent model, app and saves are unchanged. No candidate is promoted.',
      optimizer:{name:'CMA-ES',population:POPULATION,evaluatedEpisodes:results.length,seed:SEED,generation:optimizerUpdate.generation,sigma:optimizerUpdate.sigma,
        parameterCount:centres.length,coefficientScale:COEFFICIENT_SCALE,fitness:'actual episode fitness from the unchanged physical reward ledger',
        ...(priorGeneration?{continuedFrom:priorGeneration}:{})},
      gate:{metric:'Maximum compact-support RBF activation; RMS in the 9 actual projected neuronal features',
        centres:centres.map(({features,...centre})=>centre),protectedFirstLapSamples:lap1.filter(s=>s.features?.length===9).length,
        protectedOtherSecondLapSamples:lap2.filter(s=>!(s.speedMps<=.25&&s.along>=790)&&s.features?.length===9).length,
        terminalContextSamples:terminal.length,activationAudit},
      controlsPerEpisode:control,results,bestByPhysicalFitness:results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0].name,
      gpu,elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'Single-seed diagnostic with sampled telemetry; an improvement is not a promotion-ready model. Require independent seeds, multi-generation validation, a complete two-lap episode and separate save/version review.'};
    fs.mkdirSync(out,{recursive:false});
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_TERMINAL_CMA_RESULT '+JSON.stringify({passed:report.passed,controls:control,optimizer:report.optimizer,
      bestByPhysicalFitness:report.bestByPhysicalFitness,results:results.map(row=>({name:row.name,fitness:row.fitnessUsedByCmaEs,
        progress:row.result.progress,laps:row.result.laps,reason:row.result.reason,traceMatchesReference:row.traceMatchesReference,
        weights:row.coefficients})),gpu,report:path.join(out,'report.json')}));
  }finally{for(const agent of agents)agent.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
