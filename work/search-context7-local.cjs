'use strict';
const decoder=Number(process.argv.find(a=>a.startsWith('--decoder='))?.slice(10)||7);if(![7,8].includes(decoder))throw Error('Invalid decoder');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),X=require('./context'+decoder+'-model.cjs'),{F,L,P}=X;
const root=path.resolve(__dirname,'..'),source=path.join(root,'.impeccable/review/context'+decoder+'/migration/Circuit-Lab-5.6.0-v3-context'+decoder+'-monza-gen64.malecns-save');
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)||'initial';if(!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid report tag');
const output=path.join(root,'.impeccable/review/context'+decoder,tag),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
  const before=hash(source),file=await P.decode(fs.readFileSync(source,'utf8'),'5.6.0'),data=X.model(require('../outputs/data/connectome.json')),catalog=require('../outputs/data/circuits.json'),sim=new F.Simulation(data,{population:1,circuitId:'monza',circuits:catalog}),genome=file.payload.globalChampion.genome;
  P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});sim.mutation=0;sim.spawn([genome]);const car=sim.cars[0],protectedFeatures=[];let ticks=0,state,startProgress;
  while(car.alive&&ticks++<12000){
    sim.tick();if(car.alive&&sim.ticks%48===1&&car.bestProgress<file.payload.globalChampion.stats.bestProgress*.65)protectedFeatures.push(Array.from(car.brain.policyFeatures));
    if(!state&&car.alive&&car.bestProgress>=file.payload.globalChampion.stats.bestProgress*.65){state=F.capturePracticeState(car);startProgress=car.bestProgress;}
  }
  if(!state||car.alive)throw Error('Actual incumbent episode did not reach/finish naturally');
  const baseline=F.evaluatePractice(sim.track,sim.graph,genome,state,1200),experience=JSON.parse(JSON.stringify(car.brain.policyExperience)),initial=L.initialiseContexts(sim.graph,genome.policyWeights,experience),records=[],r=F.rng(700741),started=performance.now();
  const initialGenome={...F.cloneGenome(genome),policyWeights:initial};let best=baseline,bestGenome=initialGenome,bestFull=null;
  fs.mkdirSync(output,{recursive:true});
  const trials=Number(process.argv.find(a=>a.startsWith('--trials='))?.slice(9)||400);if(!Number.isInteger(trials)||trials<2||trials>4000)throw Error('Invalid trial budget');
  for(let trial=0;trial<trials;trial++){
    const parent=trial<trials/3?initialGenome:bestGenome,proposal=L.safeContextMutation(sim.graph,parent.policyWeights,r,.24,experience,protectedFeatures);
    const candidate=F.cloneGenome(parent);candidate.policyWeights=L.scaleMutation(proposal.base,proposal.child,trial%2?1:-1);
    const result=F.evaluatePractice(sim.track,sim.graph,candidate,state,1200),record={trial,leak:proposal.leak,...result};records.push(record);
    if(result.progress>best.progress+1&&result.fitness>best.fitness){
      const check=new F.Simulation(data,{population:1,circuitId:'monza',circuits:catalog});check.spawn([candidate]);check.mutation=0;const checked=check.cars[0];let n=0;while(checked.alive&&n++<60000)check.tick();
      record.full={bestProgress:checked.bestProgress,fitness:checked.fitness,laps:checked.laps,reason:checked.reason};
      if(!checked.alive&&checked.bestProgress>file.payload.globalChampion.stats.bestProgress+1&&checked.fitness>file.payload.globalChampion.stats.fitness&&(!bestFull||checked.fitness>bestFull.fitness)){
        best=result;bestGenome=candidate;bestFull=record.full;console.log('CONTEXT7_LOCAL_IMPROVED '+JSON.stringify({trial,best,full:bestFull,wallSeconds:(performance.now()-started)/1000}));
      }
    }
    if(trial%40===39)console.log('CONTEXT7_LOCAL_PROGRESS '+JSON.stringify({trials:trial+1,best,wallSeconds:(performance.now()-started)/1000}));
  }
  const full=new F.Simulation(data,{population:1,circuitId:'monza',circuits:catalog});full.spawn([bestGenome]);full.mutation=0;const winner=full.cars[0];ticks=0;while(winner.alive&&ticks++<60000)full.tick();if(winner.alive)throw Error('Full natural episode incomplete');
  const payload=JSON.parse(JSON.stringify(file.payload));payload.workers[0].state.genomes[1]=F.cloneGenome(bestGenome);P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
  fs.writeFileSync(path.join(output,'context7-local-proposal.malecns-save'),await P.encode(payload,'5.6.0'),{flag:'wx'});
  const report={passed:true,sourceUnchanged:hash(source)===before,sourceSha256:before,baseline,best,startProgress,protectedContexts:protectedFeatures.length,experienceSamples:experience.samples,experienceContexts:experience.centres.length,trials,records,
    fullEpisode:{bestProgress:winner.bestProgress,laps:winner.laps,fitness:winner.fitness,reason:winner.reason},wallSeconds:(performance.now()-started)/1000,
    sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','vehicle-992.js','rewards.js'].map(f=>[f,hash(path.join(X.runtime,'outputs',f))])),
    boundary:'Policy search over neural contexts seen in real incumbent episode, untouched rewards/physics. Local selection requires better real reward and physical progress. Separate full start-line natural episode rejects any local-only success claim. Proposal is not automatically champion; no teacher, target trajectory, raw sensor-to-motor shortcut or gifted lap/progress.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('CONTEXT7_SEARCH_DONE '+JSON.stringify({...report,records:undefined,sourceHashes:undefined}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
