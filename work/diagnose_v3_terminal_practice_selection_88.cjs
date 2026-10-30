'use strict';
// Offline replay of local mutation selection from genuine terminal states.
// This does not alter the app, the saved session, or prescribe any car action.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const prior=path.join(base,'saved-v3-moving-pace-copy-two-generations-20261027-86/report.json');
const phaseReport=path.join(base,'saved-v3-practice-control-phase-audit-20261027-87/report.json');
const out=path.join(base,'saved-v3-terminal-practice-phase-selection-20261027-88');
const P=require('../outputs/progress-save.js'),F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const expected={original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
  copy:'9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2',
  prior:'babf14a5091ebf2e5043777a4e66aa80517776c5ba86498d9a6559e4464cca7f',
  phase:'8f4979a8bdff4d1bfbd882e4cd82ed5a3f83da2c69707ece1921493848491c42'};
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(path.join(root,f))]));
const check=(v,m)=>{if(!v)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
function shadow(track,graph,genome,state,phase,held,steps,keepPhase){
  const car=F.makeCar(track,0,F.cloneGenome(genome),state.rewardRevision);
  Object.assign(car,{x:state.x,y:state.y,heading:state.heading,speed:state.speed,_physicsSpeed:state.speed},state.physics);
  car.footprintSensorsEnabled=state.footprintSensorsEnabled;car.vehicle=structuredClone(state.vehicle);
  car.brain=F.makeBrain(graph);car.brain.activity.set(state.activity);
  F.Rewards.initialise(track,car,null,state.rewardRevision);car.rewardState.along=state.along;
  let commands=keepPhase?held.slice():[0,0,0],brakeMax=0,steeringMax=0,ticks=0;
  while(ticks<steps&&car.alive){
    if((ticks+(keepPhase?phase:0))%L.CONTROL_INTERVAL===0){
      commands=F.neuralStep(graph,car.brain,car.genome,F.sense(track,car).concat(F.physicsSense(car,track)));
    }
    brakeMax=Math.max(brakeMax,commands[2]);steeringMax=Math.max(steeringMax,Math.abs(commands[0]));
    F.drive(track,car,commands,F.DT);ticks++;
  }
  if(car.alive)F.Rewards.finish(track,car,'fine prova locale');
  return {fitness:car.fitness,progress:car.bestProgress,laps:car.laps,reason:car.reason,brakeMax,steeringMax,ticks};
}
function winner(rows,ppm){
  const baseline=rows[0].result;let best=baseline,factor=null;
  for(const item of rows.slice(1))if(item.result.progress>baseline.progress+ppm&&item.result.fitness>best.fitness){best=item.result;factor=item.factor;}
  return {factor,progress:best.progress,fitness:best.fitness,reason:best.reason};
}
async function main(){
  check(!fs.existsSync(out)&&process.versions.node==='24.19.0','New output directory and pinned Node are required');
  for(const [file,key] of [[original,'original'],[copy,'copy'],[prior,'prior'],[phaseReport,'phase']])check(sha(file)===expected[key],key+' identity mismatch');
  const before=hashes(),phase=JSON.parse(fs.readFileSync(phaseReport,'utf8')),previous=JSON.parse(fs.readFileSync(prior,'utf8'));
  check(phase.passed&&phase.summary.differentCommands===10&&phase.summary.differentWhenNextPhaseZero===0,'Phase audit mismatch');
  for(const [f,h] of Object.entries(phase.sourceHashes))check(before[f]===h,'Source changed after phase audit: '+f);
  const decoded=await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  check(state.generation===64&&state.population===40&&state.rewardRevision==='progress-7-moving-pace','Unexpected experimental state');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:state.population,modelId:'v3',circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;
  const mutation=sim.mutation,captured=new Map();
  sim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!captured.has(car.id)){
    captured.set(car.id,{car,phase:s.ticks%L.CONTROL_INTERVAL,held:car.slowOutputs.slice(),snapshot:F.capturePracticeState(car),
      observed:{id:car.id,tick:s.ticks,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,heading:car.heading,
        progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,outputs:car.outputs.slice(),fitness:car.fitness,safe:F.isSafeLearningOutcome(car)}});
  }};
  let ticks=0;const started=Date.now();
  while(sim.generation===64){check(ticks<10000,'Diagnostic generation guard reached');sim.tick();ticks++;}
  check(captured.size===40,'Incomplete observed terminal census');
  const ref=previous.copy.rows[0],actual=[...captured.values()].map(v=>v.observed).sort((a,b)=>a.id-b.id);
  check(ref.generation===64&&ref.ticks===ticks&&ref.outcomes.length===actual.length,'Prior generation shape mismatch');
  for(const a of actual){const b=ref.outcomes[a.id];
    check(b.id===a.id&&b.tick===a.tick&&b.reason===a.reason&&b.laps===a.laps&&b.safe===a.safe&&
      ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i])),
      'Physical generation differs from prior verification for agent '+a.id);
  }
  const eligible=[...captured.values()].filter(x=>F.isSafeLearningOutcome(x.car)).sort((a,b)=>F.compareLearningAgents(a.car,b.car));
  const parents=eligible.slice(0,F.EVOLUTION_RULES.eliteCount),results=[];
  check(parents.length===4,'Expected four genuine safe elite states');
  console.log('TERMINAL_PHASE_CENSUS '+JSON.stringify({generation:64,ticks,safe:eligible.length,elite:parents.map(x=>({id:x.car.id,progress:x.car.bestProgress,phase:x.phase})),wallSeconds:(Date.now()-started)/1000}));
  for(const parent of parents){
    const g=parent.car.genome,random=F.rng(8800+parent.car.id);
    const mutated=L.safeMotorMutation(sim.graph,g.policyWeights,random,mutation,parent.car.brain.policyExperience);
    check(L.valid(sim.graph,mutated),'Invalid mutation');
    const tests=[{factor:0,genome:F.cloneGenome(g)},...[1,-1,3,-3].map(factor=>{
      const genome=F.cloneGenome(g);genome.policyWeights=L.scaleMutation(g.policyWeights,mutated,factor);
      check(L.valid(sim.graph,genome.policyWeights),'Invalid scaled mutation');return {factor,genome};
    })];
    const old=[],aligned=[];
    for(const test of tests){
      const official=F.evaluatePractice(sim.track,sim.graph,test.genome,parent.snapshot,720);
      const repeated=shadow(sim.track,sim.graph,test.genome,parent.snapshot,parent.phase,parent.held,720,false);
      for(const k of ['fitness','progress','laps','reason','brakeMax','steeringMax'])check(official[k]===repeated[k],'Shadow differs from production evaluator: '+k);
      old.push({factor:test.factor,result:{...official,ticks:repeated.ticks}});
      aligned.push({factor:test.factor,result:shadow(sim.track,sim.graph,test.genome,parent.snapshot,parent.phase,parent.held,720,true)});
    }
    const incumbent=winner(old,sim.track.pixelsPerMeter||1),phaseAware=winner(aligned,sim.track.pixelsPerMeter||1);
    results.push({parentId:parent.car.id,terminalProgressM:parent.car.bestProgress/(sim.track.pixelsPerMeter||1),nextControlPhase:parent.phase,
      terminalReason:parent.car.reason,baseline:old,phaseAware:aligned,selectedOld:incumbent,selectedPhaseAware:phaseAware,
      selectionChanged:incumbent.factor!==phaseAware.factor});
    console.log('TERMINAL_PHASE_PARENT '+JSON.stringify({id:parent.car.id,phase:parent.phase,old:incumbent,aligned:phaseAware,selectionChanged:incumbent.factor!==phaseAware.factor,wallSeconds:(Date.now()-started)/1000}));
  }
  const after=hashes();check(JSON.stringify(before)===JSON.stringify(after)&&sha(original)===expected.original&&sha(copy)===expected.copy,'Source or save changed');
  const report={passed:true,learningSucceeded:false,approvedForApp:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',
    originalSaveSha256:expected.original,migratedCopySha256:expected.copy,referenceReportSha256:expected.prior,phaseReportSha256:expected.phase,
    runnerSha256:sha(__filename),sourceHashes:{before,after},settings:{worker:0,generation:64,population:40,parents:4,
      mutationRate:mutation,mutationFactors:[1,-1,3,-3],practiceTicks:720,seedForEachParent:'8800 + parent ID'},
    referencePhysicalCensusMatched:true,census:{ticks,safe:eligible.length,collisionCount:actual.filter(a=>a.reason==='urto').length,
      bestSafeProgressM:Math.max(...eligible.map(x=>x.car.bestProgress/(sim.track.pixelsPerMeter||1)))},
    summary:{selectionsChanged:results.filter(x=>x.selectionChanged).length,comparedParents:results.length},results,
    boundary:'One real 40-car generation reproduced from the experimental V3/Monza save. The four safe elite terminal states are genuine, but the mutations are seeded offline probes: practice was not asserted to have run in this generation. Phase-aware local replay starts from the observed stopped state; it is not an end-to-end proof of learning or convergence. No scripted route, teacher, user save, production code, or distributed build modified.'};
  fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('TERMINAL_PHASE_REPORT '+JSON.stringify({report:file,sha256:sha(file),summary:report.summary,census:report.census}));
}
main().catch(error=>{console.error('TERMINAL_PHASE_FAILED '+(error.stack||error));process.exitCode=1;});
