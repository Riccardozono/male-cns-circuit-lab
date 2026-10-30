'use strict';
// Compare balanced versus steering-focused readout mutations from real saved-run
// practice states immediately before the first Monza collision zone.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),savePath=process.argv[2]||'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',out=path.join(root,'.impeccable/review/neural-sacl/steering-practice-search-gen64');
assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:false});
const F=require('../outputs/simulation.js'),Learning=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js');
const raw=fs.readFileSync(savePath,'utf8'),data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
async function main(){
  const verified=await Progress.decode(raw,'5.6.0'),descriptor=new F.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});
  const payload=Progress.validatePayload(verified.payload,{graph:descriptor.graph,circuits:descriptor.circuits}),state=payload.workers[0].state;
  const sim=new F.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});Progress.restore(sim,state);
  let parents=[],experiment=null;
  const original=sim.evolve.bind(sim);sim.evolve=function(){
    parents=this.cars.filter(car=>car.practiceState&&car.genome?.policyWeights).sort((a,b)=>b.bestProgress-a.bestProgress||F.compareAgents(a,b)).slice(0,2);
    const perParent=[];
    for(const parent of parents){
      const baseline=F.evaluatePractice(this.track,this.graph,parent.genome,parent.practiceState,720),groups=[];
      for(const [label,steeringFocus] of [['balanced',false],['steering-focused',true]]){
        const results=[];
        for(let i=0;i<6;i++){
          const child=F.cloneGenome(parent.genome);child.policyWeights=Learning.safeMotorMutation(this.graph,parent.genome.policyWeights,F.rng(7717+parent.id*100+i+(steeringFocus?1000:0)),.24,parent.brain.policyExperience,steeringFocus);
          results.push(F.evaluatePractice(this.track,this.graph,child,parent.practiceState,720));
        }
        const best=results.slice().sort((a,b)=>b.progress-a.progress||b.fitness-a.fitness)[0];
        groups.push({label,count:results.length,best,improvedOverBaseline:results.filter(r=>r.progress>baseline.progress+(this.track.pixelsPerMeter||1)&&r.fitness>baseline.fitness).length,
          meanProgress:results.reduce((n,r)=>n+r.progress,0)/results.length,meanSteeringMax:results.reduce((n,r)=>n+r.steeringMax,0)/results.length,
          meanBrakeMax:results.reduce((n,r)=>n+r.brakeMax,0)/results.length});
      }
      perParent.push({carId:parent.id,observedBestProgress:parent.bestProgress,contextX:parent.practiceState.x,contextY:parent.practiceState.y,
        contextSpeedMps:parent.practiceState.speed,baseline,groups});
    }
    experiment=perParent;return original();
  };
  const generation=sim.generation;let ticks=0;while(sim.generation===generation&&ticks<14000){sim.tick();ticks++;}
  if(sim.generation===generation)sim.evolve();
  const report={format:'male-cns-steering-practice-search-v1',appVersion:'5.6.0',saveSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    validation:'Exact save checksum/version/schema and V3/Monza/physics descriptors passed the app validator. The original file was read-only; all practice simulations were isolated copies of actual observed recurrent states.',
    sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))).digest('hex'),
    method:'One real generation from saved worker0, then six deterministic .24 mutations per group from each of the two highest-progress actual contexts with stored practice state. Same recurrent state, sensors, physics and 720-tick local rollout; groups differ only in balanced versus steering-focused action selection. No route, target action, teacher or saved-genome writes.',
    savedState:{generation:state.generation,population:state.population,stagnation:state.stagnation,frontierProgress:state.learningFrontier.progress},
    evaluatedGeneration:{generation,ticks,cars:sim.population,practiceContexts:parents.length,contexts:experiment},
    boundary:'This is a small local counterfactual search from at most two saved states, not full-generation learning, not a two-lap result and not evidence across seeds.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({report:path.join(out,'report.json'),savedState:report.savedState,evaluatedGeneration:report.evaluatedGeneration},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
