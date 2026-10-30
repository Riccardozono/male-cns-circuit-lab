'use strict';
// Matched cold-start physical benchmark: test whether explicitly evaluating
// the learned evolution-strategy mean each generation helps actual driving.
// The incumbent and safety/reward rules are unchanged; no save is loaded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),source=path.join(root,'outputs'),out=path.join(root,'.impeccable/review/learning-ml/mean-candidate-v3-monza-seed7717-20261020-01');
const app=path.join(source,'simulation.js'),raw=fs.readFileSync(app,'utf8'),needle='      const genomes=[cloneGenome(selectionWinner?.genome||this.champion||(usesLearningOutcome&&baseMutation>0?makeLearningGenome(this.graph,this.random):winner.genome))];';
if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');
if(fs.existsSync(out))throw Error('Refusing to overwrite a previous A/B benchmark');
if(raw.split(needle).length!==2)throw Error('Simulation source anchor changed; no experiment loaded');
const treatmentSource=raw.replace(needle,needle+`\n      if(this.benchmarkInjectMean&&usesLearningOutcome&&baseMutation>0&&this.optimizer&&selectionWinner?.genome?.policyWeights?.length===this.optimizer.mean.length){\n        const meanGenome=cloneGenome(selectionWinner.genome);meanGenome.policyWeights=this.optimizer.mean.slice();\n        if(!genomes.some(g=>JSON.stringify(g)===JSON.stringify(meanGenome)))genomes.push(meanGenome);\n      }`);
const experimentModule=new Module(app,module);experimentModule.filename=app;experimentModule.paths=Module._nodeModulePaths(path.dirname(app));experimentModule._compile(treatmentSource,app);
const Baseline=require(app),Treatment=experimentModule.exports,Legacy=require(path.join(source,'legacy-models.js')),
  dataset=require(path.join(source,'data/connectome.json')),catalog=require(path.join(source,'data/circuits.json'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2;};
const cases=[];const started=Date.now();
function run(label,Engine,injectMean){
  const sim=new Engine.Simulation(Legacy.tagV3(dataset),{population:16,mutation:.16,seed:7717,circuits:catalog,circuitId:'monza'});
  sim.benchmarkInjectMean=injectMean;
  const topologySha=hash(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)),history=[];
  for(let generation=0;generation<5;generation++){
    const expected=sim.generation;let ticks=0;
    while(sim.generation===expected&&ticks++<60000)sim.tick();
    if(sim.generation===expected)throw Error(`${label}: natural-generation guard reached; no forced update`);
    history.push(structuredClone(sim.history.at(-1)));
    console.log('MEAN_CANDIDATE_PROGRESS '+JSON.stringify({variant:label,generation:history.at(-1).generation,bestProgressM:history.at(-1).bestProgress/(sim.track.pixelsPerMeter||1),laps:history.at(-1).maxLaps,fitness:history.at(-1).best}));
  }
  const distances=history.map(h=>h.bestProgress/(sim.track.pixelsPerMeter||1));
  return {variant:label,model:'V3',circuit:'Monza',seed:7717,population:16,mutation:.16,generations:5,
    elapsedSeconds:null,firstMedianProgressM:median(distances.slice(0,3)),lastMedianProgressM:median(distances.slice(-3)),bestProgressM:Math.max(...distances),
    maxLaps:Math.max(...history.map(h=>h.maxLaps??h.laps)),twoLapGeneration:history.find(h=>(h.maxLaps??h.laps)>=2)?.generation??null,
    meanDeltaRms:Math.sqrt(sim.optimizer.mean.reduce((sum,value,i)=>sum+(value-sim.graph.learning.mean[i])**2,0)/sim.optimizer.mean.length),
    topologyUnchanged:topologySha===hash(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)),
    history:history.map(h=>({generation:h.generation,bestProgressM:h.bestProgress/(sim.track.pixelsPerMeter||1),meanProgressM:h.meanProgress/(sim.track.pixelsPerMeter||1),bestFitness:h.best,maxLaps:h.maxLaps??h.laps,noLapCount:h.noLapCount,slowerLapCount:h.slowerLapCount,stagnation:h.stagnation,mutationAmount:h.mutationAmount,immigrantCount:h.immigrantCount,optimizerUpdates:h.learning?.updates,optimizerEpisodes:h.learning?.episodes}))};
}
try{
  const baseline=run('current-production',Baseline,false),treatment=run('evaluate-learned-mean-each-generation',Treatment,true);
  if(JSON.stringify(baseline.history[0])!==JSON.stringify(treatment.history[0]))throw Error('First-generation matched-control check failed');
  baseline.elapsedSeconds=(Date.now()-started)/1000;
  const report={format:'male-cns-learning-mean-candidate-ab-v1',appVersion:require(path.join(root,'package.json')).version,passed:baseline.topologyUnchanged&&treatment.topologyUnchanged,
    learningSucceeded:treatment.maxLaps>=2,settings:{seed:7717,circuit:'monza',model:'v3',population:16,mutation:.16,naturalGenerations:5},
    hypothesis:'The learned ES mean is only sampled in one branch of the remaining offspring mutations. This A/B evaluates the current post-update mean as one real individual in each next-generation population while preserving the evaluated incumbent, immigrants, physical reward and all other mutation rules.',
    source:{productionSimulationSha256:hash(raw),treatmentSimulationSha256:hash(treatmentSource),neuralLearningSha256:hash(fs.readFileSync(path.join(source,'neural-learning.js'))),rewardsSha256:hash(fs.readFileSync(path.join(source,'rewards.js')))},
    baseline:{...baseline,elapsedSeconds:null},treatment:{...treatment,elapsedSeconds:null},
    comparison:{firstGenerationExactlyMatched:JSON.stringify(baseline.history[0])===JSON.stringify(treatment.history[0]),
      bestProgressDeltaM:treatment.bestProgressM-baseline.bestProgressM,lastMedianDeltaM:treatment.lastMedianProgressM-baseline.lastMedianProgressM,
      lapDelta:treatment.maxLaps-baseline.maxLaps,meanCandidateIsPromotion:false},
    elapsedWallSeconds:(Date.now()-started)/1000,
    boundary:'A single-seed five-generation screening benchmark on the real JS simulator, not a convergence claim. The treatment is an ephemeral in-memory variant; no app source, physical reward, vehicle, neural graph, user save, packaged build, version, tag or release is changed. Any apparent gain requires repeats on independent seeds and other circuits/models before application.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('MEAN_CANDIDATE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,comparison:report.comparison,
    baseline:baseline.history.map(h=>({generation:h.generation,progressM:h.bestProgressM,lap:h.maxLaps})),treatment:treatment.history.map(h=>({generation:h.generation,progressM:h.bestProgressM,lap:h.maxLaps})),output:path.join(out,'report.json')}));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
