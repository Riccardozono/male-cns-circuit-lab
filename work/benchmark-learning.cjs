'use strict';
// Paired cold-start evaluation. No save imports, teacher, forced generation,
// path-following action or changes to physics/anatomical connectivity.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const arg=(key,fallback)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const source=path.resolve(root,arg('source','outputs'));
const models=arg('models','v2').split(','),circuits=arg('circuits','monza,monaco,le-mans').split(',');
const seeds=arg('seeds','7717,1847,9021').split(',').map(Number),generations=Number(arg('generations','16')),population=Number(arg('population','16'));
if(!Number.isInteger(generations)||generations<5||generations>1000||!Number.isInteger(population)||population<4||population>100||seeds.some(s=>!Number.isInteger(s)||s<0||s>0xffffffff)||models.some(m=>!['v2','v3','v4','v5'].includes(m)))throw Error('Invalid evaluation configuration');
let F;const eliteCount=Number(arg('elite-count','4'));
if(!Number.isInteger(eliteCount)||eliteCount<1||eliteCount>4)throw Error('Invalid experimental elite count');
const unsafeLearningFeedback=process.argv.includes('--unsafe-learning-feedback');
const fitnessRankedLearning=process.argv.includes('--fitness-ranked-learning-feedback');
const unsafeFrontierBranch=process.argv.includes('--unsafe-frontier-branch');
const strictBrakeLock=process.argv.includes('--strict-brake-lock');
const unsafeFrontierMinMeters=Number(arg('unsafe-frontier-min-meters','12'));
if([unsafeLearningFeedback,fitnessRankedLearning,unsafeFrontierBranch,strictBrakeLock].filter(Boolean).length>1)throw Error('Select one experimental learning-feedback mode');
if(!Number.isFinite(unsafeFrontierMinMeters)||unsafeFrontierMinMeters<0)throw Error('Invalid unsafe frontier threshold');
if(eliteCount!==4||unsafeLearningFeedback||fitnessRankedLearning||unsafeFrontierBranch||strictBrakeLock){
  const Module=require('node:module'),filename=path.join(source,'simulation.js'),experiment=new Module(filename,module);
  experiment.filename=filename;experiment.paths=module.paths;
  let text=fs.readFileSync(filename,'utf8');
  if(eliteCount!==4){if(!text.includes('eliteCount:4'))throw Error('Experiment source contract changed');text=text.replace('eliteCount:4','eliteCount:'+eliteCount);}
  if(unsafeLearningFeedback||fitnessRankedLearning){
    const learningLine='const learningRanked=usesLearningOutcome?(safeEligible.length?safeEligible.slice().sort(compareLearningAgents):this.mutation===0?ranked:[]):ranked,selectionWinner=learningRanked[0]||null;';
    const comparator=fitnessRankedLearning?'compareAgents':'compareLearningAgents';
    const experimentLine=`const learningRanked=usesLearningOutcome?eligible.filter(agent=>!agent.censored&&!agent.overlap&&!(Number(agent.rewardBreakdown?.penalties?.invalid)>0)&&!['progresso non valido','invalid progress'].includes(String(agent.reason||'').trim().toLowerCase())).sort(${comparator}):ranked,selectionWinner=learningRanked[0]||null;`;
    if(text.split(learningLine).length!==2||!text.includes('noSafeLearningCandidate=usesLearningOutcome&&safeEligible.length===0;'))throw Error('Unsafe-feedback experiment source contract changed');
    text=text.replace(learningLine,experimentLine).replace('noSafeLearningCandidate=usesLearningOutcome&&safeEligible.length===0;','noSafeLearningCandidate=false;');
    text=text.replace('if(this.mutation>0&&!noSafeLearningCandidate)this.optimizer?.update(learningRanked,usesLearningOutcome?compareLearningAgents:undefined);','if(this.mutation>0&&learningRanked.length>1)this.optimizer?.update(learningRanked,usesLearningOutcome?compareLearningAgents:undefined);');
  }
  if(unsafeFrontierBranch){
    const safetyFn="  function isSafeLearningOutcome(agent){\n    const car=agent?.car||agent,reason=String(car?.reason||'').trim().toLowerCase(),penalties=car?.rewardBreakdown?.penalties||{};\n    return !car?.censored&&!car?.overlap&&!unsafeLearningReasons.has(reason)&&!(Number(penalties.collision)>0)&&!(Number(penalties.offTrack)>0)&&!(Number(penalties.invalid)>0);\n  }";
    const failureFn="  function isSafeLearningOutcome(agent){\n    const car=agent?.car||agent,reason=String(car?.reason||'').trim().toLowerCase(),penalties=car?.rewardBreakdown?.penalties||{};\n    return !car?.censored&&!car?.overlap&&!unsafeLearningReasons.has(reason)&&!(Number(penalties.collision)>0)&&!(Number(penalties.offTrack)>0)&&!(Number(penalties.invalid)>0);\n  }\n  function isExploratoryFailure(agent){\n    const car=agent?.car||agent,reason=String(car?.reason||'').trim().toLowerCase(),penalties=car?.rewardBreakdown?.penalties||{};\n    return !car?.censored&&!car?.overlap&&!(Number(penalties.invalid)>0)&&!['progresso non valido','invalid progress'].includes(reason)&&(Number(penalties.collision)>0||Number(penalties.offTrack)>0||['urto','fuori pista','collision','off track'].includes(reason));\n  }";
    const safeLeaderLine='const safeEligible=eligible.filter(isSafeLearningOutcome),safeProgressLeader=safeEligible.length?safeEligible.slice().sort((a,b)=>b.bestProgress-a.bestProgress||compareAgents(a,b))[0]:null;';
    const safeLeaderWithRisk=safeLeaderLine+'const unsafeProgressLeader=eligible.filter(isExploratoryFailure).sort((a,b)=>b.bestProgress-a.bestProgress||compareAgents(a,b))[0]||null;';
    const frontierLine='const frontierParent=progressExplorer||(stagnantFrontier?safeProgressLeader:null);';
    const frontierWithRisk=frontierLine+`\n      const riskThreshold=Math.max(${unsafeFrontierMinMeters}*(this.track.pixelsPerMeter||1),this.track.total*.002),knownSafeProgress=Math.max(Number(this.safeLearningFrontier?.progress)||0,Number(safeProgressLeader?.bestProgress)||0);\n      const unsafeFrontierParent=baseMutation>0&&unsafeProgressLeader&&unsafeProgressLeader.bestProgress>knownSafeProgress+riskThreshold?unsafeProgressLeader:null;\n      if(unsafeFrontierParent)this.benchmarkUnsafeFrontierPicks=(this.benchmarkUnsafeFrontierPicks||0)+1;`;
    const offspringLine='       let frontierOffspringCount=0;';
    const offspringWithRisk=offspringLine+'\n       let unsafeFrontierOffspringCount=0;\n       const unsafeFrontierOffspringTarget=unsafeFrontierParent?Math.min(1,Math.max(0,this.population-immigrantCount-genomes.length)):0;';
    const loopLine='      while(genomes.length<this.population) {\n         if(noSafeLearningCandidate&&baseMutation>0)';
    const loopWithRisk='      while(genomes.length<this.population) {\n         if(unsafeFrontierOffspringCount<unsafeFrontierOffspringTarget&&genomes.length<this.population-immigrantCount){\n           const child=cloneGenome(unsafeFrontierParent.genome);\n           child.policyWeights=Learning.safeMotorMutation(this.graph,unsafeFrontierParent.genome.policyWeights,this.random,childMutationAmount(),unsafeFrontierParent.brain.policyExperience);\n           genomes.push(child);unsafeFrontierOffspringCount++;continue;\n         }\n         if(noSafeLearningCandidate&&baseMutation>0)';
    if(text.split(safetyFn).length!==2||text.split(safeLeaderLine).length!==2||text.split(frontierLine).length!==2||text.split(offspringLine).length!==2||text.split(loopLine).length!==2)throw Error('Unsafe-frontier experiment source contract changed');
    text=text.replace(safetyFn,failureFn).replace(safeLeaderLine,safeLeaderWithRisk).replace(frontierLine,frontierWithRisk).replace(offspringLine,offspringWithRisk).replace(loopLine,loopWithRisk);
  }
  if(strictBrakeLock){
    const rewardFile=path.join(source,'rewards.js'),originalRewards=fs.readFileSync(rewardFile,'utf8'),baseline='brakeLockGraceSeconds:2,brakeLockPenaltyPerSecond:350';
    if(originalRewards.split(baseline).length!==2)throw Error('Brake-lock ablation source contract changed');
    const rewardModule=new Module(rewardFile,module);rewardModule.filename=rewardFile;rewardModule.paths=Module._nodeModulePaths(path.dirname(rewardFile));
    rewardModule._compile(originalRewards.replace(baseline,'brakeLockGraceSeconds:.5,brakeLockPenaltyPerSecond:700'),rewardFile);
    const nativeRequire=Module.createRequire(filename);experiment.require=request=>request==='./rewards.js'?rewardModule.exports:nativeRequire(request);
    experiment._compile(text,filename);F=experiment.exports;
  }else{experiment._compile(text,filename);F=experiment.exports;}
}else F=require(path.join(source,'simulation.js'));
const Legacy=require(path.join(source,'legacy-models.js')),Profiles=require(path.join(source,'model-profiles.js'));
// A bounded optimizer-only ablation. Applied in memory to this diagnostic,
// never to production files or a persisted/user checkpoint.
const eliteBlend=Number(arg('elite-blend','0')),pairedInitial=process.argv.includes('--paired-initial');
if(!Number.isFinite(eliteBlend)||eliteBlend<0||eliteBlend>1)throw Error('Invalid elite blend');
if(eliteBlend){
  const Learning=require(path.join(source,'neural-learning.js')),update=Learning.EvolutionStrategy.prototype.update;
  Learning.EvolutionStrategy.prototype.update=function(ranked){
    update.call(this,ranked);
    if(ranked.length>1&&ranked[0].fitness!==ranked.at(-1).fitness)this.mean=this.mean.map((v,j)=>(1-eliteBlend)*v+eliteBlend*ranked[0].genome.policyWeights[j]);
  };
}
const compact=require(path.join(source,'data/connectome.json')),catalog=require(path.join(source,'data/circuits.json'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceSha256=Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','vehicle-992.js'].map(f=>[f,hash(fs.readFileSync(path.join(source,f)))]));
const median=values=>{const v=values.slice().sort((a,b)=>a-b);return (v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2;};
let full;
function modelData(id){
  if(id==='v2')return Legacy.buildV2(compact);
  if(id==='v3')return Legacy.tagV3(compact);
  if(!full){
    const meta=require(path.join(source,'data/connectome-full.json')),bytes=fs.readFileSync(path.join(source,'data',meta.binary));
    if(hash(bytes)!==meta.binarySha256)throw Error('Connectome checksum mismatch');
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};
    full={...meta,compact:true};for(const [name,item]of Object.entries(meta.arrays))full[name]=new types[item.dtype](buffer,item.offset,item.length);
  }
  return id==='v5'?Profiles.buildV5(full):full;
}
const target=path.resolve(root,arg('out','.impeccable/review/learning-ml/'+arg('tag','candidate')+'.json'));
if(fs.existsSync(target))throw Error('Refusing to overwrite previous evaluation: '+target);
fs.mkdirSync(path.dirname(target),{recursive:true});
const report={created:new Date().toISOString(),version:require(path.join(source,'../package.json')).version,source,sourceSha256,settings:{models,circuits,seeds,generations,population,mutation:.16,eliteBlend,eliteCount,pairedInitial,unsafeLearningFeedback,fitnessRankedLearning,unsafeFrontierBranch,unsafeFrontierMinMeters},cases:[],boundary:unsafeFrontierBranch?`Diagnostic-only progress frontier: one mutated offspring may branch from a completed collision/off-track-penalized episode only when it beats the prior safe frontier by max(${unsafeFrontierMinMeters} m, 0.2% of track length). It never updates safe champion/archive/frontier; reward penalties remain unchanged. Headless CPU, natural cold-start, no imports. Matched seeds/settings required. No GPU/FPS or convergence claim.`:fitnessRankedLearning?'Diagnostic-only ablation: all complete, valid episodes rank by actual penalized fitness for neural feedback and exploratory parents. Crashes/off-track remain penalized and excluded from safe champion/archive/frontier. Headless CPU, natural cold-start, no imports. Matched seeds/settings are required. No GPU/FPS or convergence claim.':unsafeLearningFeedback?'Diagnostic-only ablation: crash/off-track outcomes remain penalized and excluded from safe champion/archive/frontier, but can guide exploratory parent ranking after safe-first ordering. Headless CPU, natural cold-start generations, no progress imports. Matched seeds/settings are required. No GPU/FPS or convergence claim.':'Headless CPU, natural cold-start generations, no progress imports. Matched seeds/settings are required for comparisons. No GPU/FPS or convergence claim.'};
report.settings.strictBrakeLock=strictBrakeLock;
if(strictBrakeLock)report.boundary='Diagnostic-only in-memory reward ablation: brake-lock grace 0.5 s and cost 700 pt/s; physics, sensors, networks and selection are unchanged. Headless CPU, natural cold-start, no imports. Matched seeds/settings required. No GPU/FPS or convergence claim.';
for(const modelId of models)for(const circuitId of circuits)for(const seed of seeds){
  const sim=new F.Simulation(modelData(modelId),{population,mutation:.16,seed,circuits:catalog,circuitId});
  if(pairedInitial)for(let i=1;i<sim.cars.length;i+=2)sim.cars[i].genome.policyWeights=sim.graph.learning.mean.map((v,j)=>F.clamp(2*v-sim.cars[i-1].genome.policyWeights[j],-8,8));
  const started=performance.now(),history=[],topology=hash(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength));
  const initialMean=sim.optimizer.mean.slice();
  for(let i=0;i<generations;i++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks++<60000)sim.tick();
    if(sim.generation===generation)throw Error('Natural-generation guard reached; no forced fitness update');
    history.push(sim.history.at(-1));
  }
  const ppm=sim.track.pixelsPerMeter||1,distances=history.map(h=>h.bestProgress/ppm);
  const result={modelId,circuitId,seed,population,generations,elapsedSeconds:(performance.now()-started)/1000,
    firstMedianMeters:median(distances.slice(0,5)),lastMedianMeters:median(distances.slice(-5)),maxMeters:Math.max(...distances),
    maxLaps:Math.max(...history.map(h=>h.maxLaps??h.laps)),firstTwoLapsGeneration:history.find(h=>(h.maxLaps??h.laps)>=2)?.generation??null,
    meanDeltaRms:Math.sqrt(sim.optimizer.mean.reduce((s,v,i)=>s+(v-initialMean[i])**2,0)/initialMean.length),
    unsafeFrontierPicks:sim.benchmarkUnsafeFrontierPicks||0,
    topologyUnchanged:topology===hash(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)),history};
  report.cases.push(result);fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
  console.log('LEARNING_CASE '+JSON.stringify({...result,history:undefined}));
}
console.log('LEARNING_REPORT '+target);
