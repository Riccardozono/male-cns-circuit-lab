'use strict';
// Paired same-save CPU diagnostic: compare terminal practice snapshots with
// retaining the earliest live, real snapshot captured for local practice.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_PRACTICE_CHECKPOINT_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-practice-checkpoint-ab-20261021-01'));
const generationCount=Math.max(1,Math.min(8,Number(process.env.MALECNS_PRACTICE_CHECKPOINT_GENERATIONS)||5));
const simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8');
const Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const count=text.split(before).length-1;if(count!==1)throw Error(`Expected one source contract, got ${count}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(retainFirstPracticeState,practiceFactors){
  let text=simSource;
  if(retainFirstPracticeState)text=replaceExactly(text,
    'for(const parent of learningRanked.slice(0,practiceEliteBudget))parent.practiceState=capturePracticeState(parent);',
    'for(const parent of learningRanked.slice(0,practiceEliteBudget))if(!parent.practiceState)parent.practiceState=capturePracticeState(parent);');
  text=replaceExactly(text,'for(const factor of [1,-1,3,-3])',`for(const factor of ${JSON.stringify(practiceFactors)})`);
  text=replaceExactly(text,'let best=baseline,bestWeights=null;','let best=baseline,bestWeights=null,bestFactor=null;');
  text=replaceExactly(text,'best=result;bestWeights=candidate.policyWeights;','best=result;bestWeights=candidate.policyWeights;bestFactor=factor;');
  text=replaceExactly(text,
    'this.practiceResults.push({parentId:parent.id,baseline,best,improved:Boolean(bestWeights)});',
    'this.practiceResults.push({parentId:parent.id,baseline,best,improved:Boolean(bestWeights),candidateFactor:bestFactor,candidateWeights:bestWeights?.slice()||null});');
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(text,simFile);return m.exports;
}
function terminalRows(cars,engine,ppm){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,policyHash:sha(Buffer.from(JSON.stringify(c.genome.policyWeights||[]))),progressM:c.bestProgress/ppm,laps:c.laps,
  reason:c.reason,fitness:c.fitness,safe:engine.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
function summarizePractice(rows){return rows.map(row=>({parentId:row.parentId,baseline:{progress:row.baseline.progress,laps:row.baseline.laps,fitness:row.baseline.fitness,reason:row.baseline.reason},
  best:{progress:row.best.progress,laps:row.best.laps,fitness:row.best.fitness,reason:row.best.reason},improved:row.improved,
  candidateFactor:row.candidateFactor??null,candidateHash:row.candidateWeights?sha(Buffer.from(JSON.stringify(row.candidateWeights))):null}));}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing diagnostic report');
  if(!fs.existsSync(savePath))throw Error('Exact supplied V3/Monza save is missing');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await Progress.decode(saveBytes.toString('utf8'),'5.6.0');
  const stateOriginal=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The supplied save does not match the verified V3/Monza generation-64 identity');
  function run(label,practiceFactors){
    const engine=makeEngine(true,practiceFactors),state=structuredClone(stateOriginal),sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
    state.history=[];Progress.restore(sim,state);sim.running=true;
    const generations=[],started=performance.now();let terminal=null,lastLog=performance.now();
    sim.onTrialTick=s=>{
      if(s.cars.every(c=>!c.alive))terminal=terminalRows(s.cars,engine,s.track.pixelsPerMeter||1);
      if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('PRACTICE_CHECKPOINT_PROGRESS '+JSON.stringify({arm:label,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
    };
    for(let i=0;i<generationCount;i++){
      const generation=sim.generation,incomingPractice=summarizePractice(sim.practiceResults||[]);let ticks=0;
      while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
      if(sim.generation===generation||!terminal)throw Error(`${label}: generation ${generation} did not end naturally with terminal outcomes`);
      const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),cars=terminal,reasons=cars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{});
      const safe=cars.filter(c=>c.safe),safeLeader=safe.slice().sort((a,b)=>b.progressM-a.progressM)[0],rawLeader=cars.slice().sort((a,b)=>b.progressM-a.progressM)[0];
      const practice=summarizePractice(sim.practiceResults||[]),terminalByHash=new Map(cars.map(row=>[row.policyHash,row])),practiceOutcomes=incomingPractice.map(row=>{
        const rollout=row.candidateHash?terminalByHash.get(row.candidateHash):null;
        return {...row,appearedInPopulation:Boolean(rollout),rollout:rollout?{id:rollout.id,progressM:rollout.progressM,laps:rollout.laps,reason:rollout.reason,safe:rollout.safe,fitness:rollout.fitness}:null};
      });
      generations.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,
        maxLaps:h.maxLaps,reasons,safeEpisodeCount:safe.length,safeLeader:safeLeader?{id:safeLeader.id,progressM:safeLeader.progressM}:null,
        rawLeader:{id:rawLeader?.id,progressM:rawLeader?.progressM,reason:rawLeader?.reason},practice,practiceFromPriorGeneration:practiceOutcomes,practiceImprovedCount:practice.filter(p=>p.improved).length,
        nextPopulationSha256:sha(Buffer.from(JSON.stringify(sim.cars.map(c=>c.genome.policyWeights)))),terminal:cars});
      terminal=null;console.log('PRACTICE_CHECKPOINT_GENERATION '+JSON.stringify({arm:label,generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,
        safeEpisodes:safe.length,practiceRuns:practice.length,practiceImproved:practice.filter(p=>p.improved).length,practice}));
    }
    sim.running=false;return {label,generations,wallSeconds:(performance.now()-started)/1000};
  }
  const control=run('wide-factors-1-minus1-3-minus3',[1,-1,3,-3]),treatment=run('subunit-factors-quarter-minus-quarter-half-minus-half',[.25,-.25,.5,-.5]);
  const firstA=control.generations[0].terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const firstB=treatment.generations[0].terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const firstGenerationMatches=JSON.stringify(firstA)===JSON.stringify(firstB),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  if(!saveUnchanged)throw Error('Original user save SHA-256 changed');
  const report={format:'male-cns-saved-v3-practice-checkpoint-ab-v1',appVersion:'5.6.0',passed:firstGenerationMatches&&saveUnchanged,
    learningSucceeded:treatment.generations.some(r=>r.maxLaps>=2),settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,
      population:stateOriginal.population,naturalGenerations:generationCount,historyReset:true},save:{sha256:saveSha,unchanged:saveUnchanged},firstGenerationMatches,
    method:'Paired in-memory branches from the exact supplied save and identical controller/optimizer/rewards/physics. Both retain each car’s first real live snapshot captured for local practice. Control tests mutation factors [1,-1,3,-3]; treatment tests subunit factors [0.25,-0.25,0.5,-0.5]. Candidate genomes are tracked by exact policy-weight hash into the next full physical generation. No route teacher, app writes, save migration or source promotion.',
    control,treatment,comparison:{safeProgressDeltaMeters:treatment.generations.map((r,i)=>(r.safeLeader?.progressM??0)-(control.generations[i].safeLeader?.progressM??0)),lapDelta:treatment.generations.map((r,i)=>r.maxLaps-control.generations[i].maxLaps),
      practiceImprovementDelta:treatment.generations.map((r,i)=>(r.practiceImprovedCount||0)-(control.generations[i].practiceImprovedCount||0)),promoteTreatment:false},
    sourceHashes:{simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},
    boundary:`${generationCount} generations from one seed are a diagnostic, not a general learning claim. Two-lap completion, multi-seed/circuit generalization and native application verification remain required. The app source, version, releases and user save are not written.`};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('PRACTICE_CHECKPOINT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,firstGenerationMatches,saveUnchanged,
    baseline:control.generations.map(r=>({generation:r.generation,safeM:r.safeLeader?.progressM,laps:r.maxLaps,practice:r.practiceImprovedCount,nextPopulationSha256:r.nextPopulationSha256})),
    treatment:treatment.generations.map(r=>({generation:r.generation,safeM:r.safeLeader?.progressM,laps:r.maxLaps,practice:r.practiceImprovedCount,nextPopulationSha256:r.nextPopulationSha256})),comparison:report.comparison,output:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
