'use strict';
// Shadow experiment only: preserve the V3 linear policy as an exact skip path,
// add a small learned nonlinear residual decoder, and compare three generations
// from the same saved population. No save/app source/release is written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-residual-decoder-ab-20261021-01'));
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const HIDDEN=8,GENERATIONS=Number(process.env.MALECNS_EXPERIMENT_GENERATIONS||3),MAX_TICKS=60000;
let ResidualProjection=null,ResidualBias=null;
function normal(random){let a=0;do{a=random();}while(a<=0);return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*random());}
function makeResidual(){return new Array(ResidualLength).fill(0);}
function buildResidualProjection(){const random=F.rng(20261021);ResidualProjection=new Float64Array(LearningBuildNodes*HIDDEN);ResidualBias=new Float64Array(HIDDEN);
  for(let i=0;i<ResidualProjection.length;i++)ResidualProjection[i]=normal(random)*.7;
}
function mutateResidual(values,random,amount,focus){const next=values.slice(),scale=Math.max(0,amount)/.16,
  selected=focus==='steering'?[0]:focus==='longitudinal'?[1]:[0,1];
  for(const action of selected){for(let h=0;h<HIDDEN;h++)next[h*2+action]=F.clamp(next[h*2+action]+normal(random)*.32*scale,-8,8);
    next[next.length-2+action]=F.clamp(next[next.length-2+action]+normal(random)*.16*scale,-8,8);}
  return next;
}
function extendGenome(genome,random){const copy=F.cloneGenome(genome),prefixLength=LearningBaseLength;
  if(copy.policyWeights.length===prefixLength)copy.policyWeights.push(...makeResidual());
  else if(copy.policyWeights.length!==prefixLength+ResidualLength)throw Error('Residual decoder genome length mismatch');
  return copy;
}
function neuralOutcome(car){return {id:car.id,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,safe:F.isSafeLearningOutcome(car),
  reason:car.reason||'',fitness:car.fitness,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0};}
function runArm(data,circuits,payload,state,control,label,experimental,migrateRewards=false){
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);
  if(migrateRewards){sim.rewardRevision=F.Rewards.REVISION;sim.history=[];for(const car of sim.cars){car.rewardRevision=F.Rewards.REVISION;car.rewardState.brakeLockSeconds??=0;}}
  let originalLearningMethods=null;
  if(experimental){
    const originalValid=Learning.valid,originalCommands=Learning.commands,originalMutation=Learning.safeMotorMutation,originalMirror=Learning.mirroredMutation;
    originalLearningMethods={originalValid,originalCommands,originalMutation,originalMirror};
    Learning.valid=(graph,values)=>values?.length===LearningBaseLength+ResidualLength&&values.every(v=>Number.isFinite(v)&&Math.abs(v)<=8)||originalValid(graph,values);
    Learning.commands=(graph,brain,genome,enabled=true,edgesEnabled=true)=>{
      if(!enabled||!edgesEnabled)return [0,0,0];const values=genome.policyWeights;
      if(values.length===LearningBaseLength)return originalCommands(graph,brain,genome,enabled,edgesEnabled);
      const baseGenome={...genome,policyWeights:values.slice(0,LearningBaseLength)},base=originalCommands(graph,brain,baseGenome,enabled,edgesEnabled);
      const features=brain.policyFeatures,n=LearningBuildNodes,norm=1/Math.sqrt(n),residualOffset=LearningBaseLength,hidden=new Float64Array(HIDDEN);
      if(values.slice(residualOffset).every(value=>value===0))return base;
      for(let h=0;h<HIDDEN;h++){let sum=ResidualBias[h];for(let i=0;i<n;i++)sum+=features[i]*ResidualProjection[i*HIDDEN+h]*norm;hidden[h]=Math.tanh(sum);}
      let steer=0,longitudinal=0;for(let h=0;h<HIDDEN;h++){steer+=hidden[h]*values[residualOffset+h*2]*1/Math.sqrt(HIDDEN);longitudinal+=hidden[h]*values[residualOffset+h*2+1]*1/Math.sqrt(HIDDEN);}
      steer+=values[values.length-2];longitudinal+=values[values.length-1];
      const logit=value=>Math.atanh(F.clamp(value,-1+1e-12,1-1e-12)),s=Math.tanh(logit(base[0])+steer),l=Math.tanh(logit(base[1]-base[2])+longitudinal);
      return [s,Math.max(0,l),Math.max(0,-l)];
    };
    Learning.safeMotorMutation=(graph,values,random,amount,experience,focus)=>{
      const prefix=originalMutation(graph,values.slice(0,LearningBaseLength),random,amount,experience,focus),
        residual=values.length>LearningBaseLength?values.slice(LearningBaseLength):makeResidual();
      return prefix.concat(mutateResidual(residual,random,amount,focus));
    };
    Learning.mirroredMutation=(values,child)=>originalMirror(values,child).map(value=>F.clamp(value,-8,8));
    sim.optimizer.mean.push(...makeResidual());sim.optimizer.sigma.push(...new Array(ResidualLength).fill(.12));
    sim.optimizer.update=function(ranked,compare=(a,b)=>b.fitness-a.fitness){
      const eligible=ranked.filter(agent=>Learning.valid(this.graph,agent.genome?.policyWeights)).slice().sort(compare);if(eligible.length<2)return;
      this.updates++;this.episodes+=eligible.length;if(eligible.every(agent=>compare(agent,eligible[0])===0))return;
      const count=Math.min(eligible.length,Math.max(2,Math.ceil(eligible.length/4))),weights=Array.from({length:eligible.length},(_,i)=>i<count?Math.log(count+.5)-Math.log(i+1):0),total=weights.reduce((a,b)=>a+b,0);
      weights.forEach((_,i)=>weights[i]/=total);
      for(let start=0;start<eligible.length;){let end=start+1;while(end<eligible.length&&compare(eligible[end],eligible[start])===0)end++;
        const tied=weights.slice(start,end).reduce((a,b)=>a+b,0)/(end-start);for(let i=start;i<end;i++)weights[i]=tied;start=end;}
      for(let j=0;j<this.mean.length;j++){let mean=0;for(let i=0;i<eligible.length;i++)mean+=weights[i]*eligible[i].genome.policyWeights[j];
        let variance=0;for(let i=0;i<eligible.length;i++)variance+=weights[i]*(eligible[i].genome.policyWeights[j]-this.mean[j])**2;
        this.mean[j]=F.clamp(.35*this.mean[j]+.65*mean,-8,8);const scale=j<LearningBaseLength?this.graph.learning.scales[j]:.12;
        this.sigma[j]=F.clamp(Math.sqrt(.85*this.sigma[j]**2+.15*variance),scale*.5,scale*3);}
    };
    for(const car of sim.cars)car.genome=extendGenome(car.genome,F.rng(state.seed+car.id+9500));
    const spawn=sim.spawn.bind(sim);sim.spawn=genomes=>{
      const originals=genomes.map(genome=>F.cloneGenome(genome)),baseOnly=genomes.map(genome=>({...F.cloneGenome(genome),policyWeights:genome.policyWeights.slice(0,LearningBaseLength)}));
      spawn(baseOnly);
      for(let i=0;i<sim.cars.length;i++){const source=originals[i],car=sim.cars[i];
        car.genome=extendGenome({...car.genome,policyWeights:source.policyWeights},sim.random);
      }
    };
  }
  const start=sim.generation,endGeneration=start+GENERATIONS,genRows=[],expected=control.treatment.results[0].outcomes;
  let firstOutcomes=null,ticks=0;sim.running=true;
  sim.onTrialTick=s=>{if(s.cars.every(car=>!car.alive)){const rows=s.cars.map(neuralOutcome).sort((a,b)=>a.id-b.id);
    if(s.generation===start)firstOutcomes=rows;
    const safe=rows.filter(row=>row.safe).sort((a,b)=>b.laps-a.laps||b.progressM-a.progressM||b.fitness-a.fitness);
    genRows.push({generation:s.generation,ticks:s.ticks,safeCount:safe.length,safeLeader:safe[0]||null,maxLaps:Math.max(0,...rows.map(row=>row.laps)),meanProgressM:rows.reduce((sum,row)=>sum+row.progressM,0)/rows.length,
      topFiveSafe:safe.slice(0,5).map(({id,progressM,laps,fitness,reason})=>({id,progressM,laps,fitness,reason}))});
  }};
  while(sim.generation<endGeneration&&ticks++<MAX_TICKS)sim.tick();
  sim.running=false;if(sim.generation<endGeneration||genRows.length!==GENERATIONS)throw Error(label+': did not finish all requested generations');
  if(originalLearningMethods){Learning.valid=originalLearningMethods.originalValid;Learning.commands=originalLearningMethods.originalCommands;
    Learning.safeMotorMutation=originalLearningMethods.originalMutation;Learning.mirroredMutation=originalLearningMethods.originalMirror;}
  const physical=firstOutcomes?.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  if(!firstOutcomes||JSON.stringify(physical)!==JSON.stringify(expected)){
    const expectedById=new Map(expected.map(row=>[row.id,row])),firstDifferences=physical.filter(row=>JSON.stringify(row)!==JSON.stringify(expectedById.get(row.id))).slice(0,4).map(row=>({actual:row,expected:expectedById.get(row.id)}));
    throw Error(label+': first saved generation did not reproduce exact baseline driving outcomes; differences='+JSON.stringify(firstDifferences));
  }
  return {label,experimental,migrateRewards,rewardRevision:migrateRewards?F.Rewards.REVISION:state.rewardRevision,firstGenerationPhysicalMatch:true,generations:genRows,finalGeneration:sim.generation,
    saveRestoredGeneration:state.generation,decoder:{type:experimental?'fixed random-feature 8-unit tanh residual with evolved output weights and exact linear skip':'original V3 linear readout',hiddenUnits:experimental?HIDDEN:0,
      basePolicyLength:LearningBaseLength,residualWeights:experimental?ResidualLength:0},gpu:Cuda.stats()};
}
let LearningBuildNodes=0,LearningBaseLength=0,ResidualLength=0;
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing residual-decoder report');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8')),
    raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(!control.passed||decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  try{
    const probe=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    LearningBuildNodes=probe.graph.learning.nodes.length;LearningBaseLength=probe.graph.learning.length;ResidualLength=HIDDEN*2+2;buildResidualProjection();
    probe.running=false;
    const skipControl=process.env.MALECNS_SKIP_CONTROL==='1';let baseline;
    if(skipControl){
      const prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-residual-decoder-8gen-ab-20261021-01/report.json'),'utf8'));
      for(const [file,hash] of Object.entries(prior.sourceHashes))if(sha(fs.readFileSync(path.join(root,'outputs',file)))!==hash)throw Error('Prior control source hash changed: '+file);
      if(prior.save.sha256!==saveSha||!prior.save.unchanged||prior.settings.generations!==GENERATIONS)throw Error('Prior matched control does not fit this exact experiment');
      baseline=prior.arms.baseline;
    }else baseline=runArm(data,circuits,decoded.payload,state,control,'linear control',false);
    const baselineGpu=baseline.gpu;Cuda.close();
    const migrateRewards=process.env.MALECNS_MIGRATE_REWARD==='1',experimental=runArm(data,circuits,decoded.payload,state,control,
      migrateRewards?'progress-5 reward migration copy':'residual-decoder migration copy',!migrateRewards,migrateRewards),treatmentGpu=experimental.gpu,
      gpu={baseline:baselineGpu,treatment:treatmentGpu,calls:baselineGpu.calls+treatmentGpu.calls,gpuCalls:baselineGpu.gpuCalls+treatmentGpu.gpuCalls,
        cpuFallbacks:baselineGpu.cpuFallbacks+treatmentGpu.cpuFallbacks},saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
      gen64Matched=baseline.firstGenerationPhysicalMatch&&experimental.firstGenerationPhysicalMatch,
      baseLeader=baseline.generations.at(-1).safeLeader,experimentalLeader=experimental.generations.at(-1).safeLeader;
    const report={format:'male-cns-saved-v3-residual-decoder-shadow-ab-v1',appVersion:'5.6.0',passed:true,
      learningSucceeded:experimental.generations.some(row=>row.maxLaps>=2),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      settings:{matchedContinuation:true,generations:GENERATIONS,population:state.population,hiddenUnits:experimental.experimental?HIDDEN:0,baselineRewardRevision:state.rewardRevision,experimentalRewardRevision:experimental.rewardRevision,historyReset:experimental.migrateRewards},
      method:experimental.migrateRewards?`Both arms restore the same checked generation-64 save and run ${GENERATIONS} matched generations. The treatment changes only the in-memory reward revision to ${F.Rewards.REVISION} and clears the copied history; it keeps the saved neural weights, optimizer, seed, population, sensors and physics. No save file is written.`:
        `Both arms restore the same checked generation-64 save and run ${GENERATIONS} matched generations. The experiment appends an eight-unit fixed random-feature tanh residual over the same real descending-neuron activity; zero output weights preserve the saved V3 motor outputs exactly in generation 64. Its 18 residual output parameters are included in the in-memory evolution strategy and are learned alongside V3 weights. No route targets, action rules, fake sensors, or vehicle/track physics are added. The new decoder is discarded after the run.`,
      arms:{baseline,experimental},summary:{savedGenerationPhysicalOutcomesMatched:gen64Matched,
        baselineMaxSafeProgressM:Math.max(...baseline.generations.map(row=>row.safeLeader?.progressM||0)),experimentalMaxSafeProgressM:Math.max(...experimental.generations.map(row=>row.safeLeader?.progressM||0)),
        baselineLaps:Math.max(...baseline.generations.map(row=>row.maxLaps)),experimentalLaps:Math.max(...experimental.generations.map(row=>row.maxLaps)),
        finalLeaderProgressDeltaM:(experimentalLeader?.progressM||0)-(baseLeader?.progressM||0),
        generationMetricsChanged:experimental.generations.slice(1).some((row,i)=>row.safeLeader?.progressM!==baseline.generations[i+1]?.safeLeader?.progressM)},gpu,
      sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:`${GENERATIONS} matched generations on the exact saved V3/Monza population are exploratory evidence only, not proof of general learning or a 2-lap completion. Decoder migration exists only in memory; no save, application source, version, tag, release, portable or installer was changed.`};
    if(!saveUnchanged||gpu.gpuCalls===0||gpu.cpuFallbacks!==0||!gen64Matched)throw Error('Save, same-start, or GPU verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('RESIDUAL_DECODER_AB '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,summary:report.summary,
      baseline:baseline.generations.map(row=>({generation:row.generation,progressM:row.safeLeader?.progressM,laps:row.maxLaps})),
      experimental:experimental.generations.map(row=>({generation:row.generation,progressM:row.safeLeader?.progressM,laps:row.maxLaps})),gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
