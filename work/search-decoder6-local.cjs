'use strict';
// Experimental output-sensitive random search from an ACTUALLY reached state.
// No track coordinates, desired line/speed or teacher commands enter mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const X=require('./decoder6-model.cjs'),{F,L,P}=X,root=path.resolve(__dirname,'..');
const save=path.join(root,'.impeccable/review/decoder6/migration/Circuit-Lab-5.6.0-v3-decoder6-monza-gen64.malecns-save');
const output=path.join(root,'.impeccable/review/decoder6/local-search-representation');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
  const originalHash=hash(save),file=await P.decode(fs.readFileSync(save,'utf8'),'5.6.0'),data=X.model(require('../outputs/data/connectome.json')),catalog=require('../outputs/data/circuits.json');
  const sim=new F.Simulation(data,{population:1,circuitId:'monza',circuits:catalog}),genome=file.payload.globalChampion.genome;
  P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});sim.spawn([genome]);sim.mutation=0;
  const car=sim.cars[0];let ticks=0,state,stateProgress;
  while(car.alive&&ticks++<10000){
    sim.tick();
    if(!state&&car.alive&&car.bestProgress>=file.payload.globalChampion.stats.bestProgress*.9){state=F.capturePracticeState(car);stateProgress=car.bestProgress;}
  }
  if(!state||car.alive)throw Error('Parent did not finish a natural reached-state episode');
  const experience=JSON.parse(JSON.stringify(car.brain.policyExperience));
  const baseline=F.evaluatePractice(sim.track,sim.graph,genome,state),r=F.rng(700619),records=[],started=performance.now();
  let best=baseline,bestGenome=F.cloneGenome(genome),accepted=0;
  fs.mkdirSync(output,{recursive:true});
  for(let iteration=0;iteration<200;iteration++){
    // A mix of short and wide mirrored trials, all bounded at the same ±8.
    // Incumbent commands in its dominant observed neural state are protected.
    const parent=iteration<80?genome:bestGenome,
      representation=L.representationMutation(sim.graph,parent.policyWeights,r,experience),
      weights=L.safeMotorMutation(sim.graph,representation.weights,r,.24,representation.experience);
    for(const sign of [1,-1]){
      const factor=[1,2,4,8][iteration%4]*sign,candidate=F.cloneGenome(parent);
      candidate.policyWeights=L.scaleMutation(representation.weights,weights,factor);
      const result=F.evaluatePractice(sim.track,sim.graph,candidate,state);
      records.push({iteration,factor,...result});
      if(result.progress>best.progress+1&&result.fitness>best.fitness){best=result;bestGenome=candidate;accepted++;console.log('LOCAL_DECODER6_IMPROVED '+JSON.stringify({iteration,factor,best,wallSeconds:(performance.now()-started)/1000}));}
    }
    if(iteration%10===9)console.log('LOCAL_DECODER6_PROGRESS '+JSON.stringify({iterations:iteration+1,trials:records.length,accepted,best,wallSeconds:(performance.now()-started)/1000}));
  }
  // A proposal is never called a champion until a full start-line rollout.
  const full=new F.Simulation(data,{population:1,circuitId:'monza',circuits:catalog});full.spawn([bestGenome]);full.mutation=0;
  const winner=full.cars[0];ticks=0;while(winner.alive&&ticks++<60000)full.tick();if(winner.alive)throw Error('Full natural episode unfinished');
  const payload=JSON.parse(JSON.stringify(file.payload));
  // Same population size and all original policies retained in the source.
  // The proposal enters one slot of a further new disposable training copy.
  payload.workers[0].state.genomes[1]=F.cloneGenome(bestGenome);
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
  const target=path.join(output,'Circuit-Lab-5.6.0-v3-decoder6-local-proposal.malecns-save');
  fs.writeFileSync(target,await P.encode(payload,'5.6.0'),{flag:'wx'});
  const report={passed:true,saveUnchanged:hash(save)===originalHash,sourceSha256:originalHash,sourceStateProgress:stateProgress,experienceSamples:experience.samples,experienceContexts:experience.centres.length,baseline,best,accepted,trials:records.length,records,
    fullEpisode:{bestProgress:winner.bestProgress,laps:winner.laps,fitness:winner.fitness,reason:winner.reason},proposalCopy:target,
    wallSeconds:(performance.now()-started)/1000,sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','vehicle-992.js'].map(f=>[f,hash(path.join(X.runtime,'outputs',f))])),
    boundary:'Actual incumbent reached-state random policy search. Candidate ranking requires both better unchanged reward and >1m extra local physical progress. No gifted inherited metres/laps, teacher, artificial position or prescribed speed/steering. Full natural episode from start reported separately; proposal is not a proven champion or general learning result.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('LOCAL_DECODER6_DONE '+JSON.stringify({...report,records:undefined,sourceHashes:undefined}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
