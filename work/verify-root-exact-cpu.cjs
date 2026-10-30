'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.impeccable/review/exact-coo/root-replay'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),before=hash(savePath);
const F=require('../outputs/simulation.js'),Learning=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),P=require('../outputs/progress-save.js');
const oldPath=path.join(root,'.impeccable/review/exact-coo/root-before/simulation.js'),oldModule=new Module(path.join(root,'outputs/simulation-before-cpu.js'),module);
oldModule.filename=path.join(root,'outputs/simulation.js');oldModule.paths=Module._nodeModulePaths(path.join(root,'outputs'));oldModule._compile(fs.readFileSync(oldPath,'utf8'),oldModule.filename);const Old=oldModule.exports;
const data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json'),physical=car=>[car.x,car.y,car.heading,car.speed,car.distance,car.progress,car.bestProgress,car.fitness,car.laps,car.alive,car.reason,JSON.stringify(car.vehicle),JSON.stringify(car.rewardState)];
async function main(){
  const file=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0'),sim=new F.Simulation(data,{population:1,circuitId:'monza',circuits}),graph=sim.graph,track=sim.track;
  P.validatePayload(file.payload,{graph,circuits:sim.circuits});
  const genomes=[['global-champion',file.payload.globalChampion.genome],['worker-0-agent-3',file.payload.workers[0].state.genomes[3]],['worker-4-agent-3',file.payload.workers[4].state.genomes[3]]],cases=[];
  for(const [name,genome]of genomes){
    const oldCar=Old.makeCar(track,0,Old.cloneGenome(genome)),car=F.makeCar(track,0,F.cloneGenome(genome));oldCar.brain=Old.makeBrain(graph);car.brain=F.makeBrain(graph);
    let ticks=0,controls=0,oldCommands=[0,0,0],commands=[0,0,0];
    while(oldCar.alive&&ticks<120000){
      if(ticks%Learning.CONTROL_INTERVAL===0){
        const sensors=Old.sense(track,oldCar).concat(Old.physicsSense(oldCar,track));assert.deepStrictEqual(F.sense(track,car).concat(F.physicsSense(car,track)),sensors);
        oldCommands=Old.neuralStep(graph,oldCar.brain,genome,sensors);commands=F.neuralStep(graph,car.brain,genome,sensors);assert.deepStrictEqual(commands,oldCommands);
        for(const key of ['activity','next','sum','injection','policyFeatures'])assert.deepStrictEqual(car.brain[key],oldCar.brain[key],name+' '+key+' control '+controls);
        controls++;
      }
      Old.drive(track,oldCar,oldCommands,Old.DT);F.drive(track,car,commands,F.DT);assert.deepStrictEqual(physical(car),physical(oldCar),name+' physical tick '+ticks);ticks++;
    }
    assert.equal(car.alive,false,'Episode was censored');cases.push({name,physicalTicks:ticks,neuralControls:controls,bestProgress:car.bestProgress,laps:car.laps,reason:car.reason,fitness:car.fitness,exact:true});
    console.log('ROOT_CPU_CASE '+JSON.stringify(cases.at(-1)));
  }
  assert.equal(hash(savePath),before);fs.mkdirSync(output,{recursive:true});
  const report={passed:true,version:require('../package.json').version,saveSha256:before,originalUnchanged:true,cases,sourceHashes:{original:hash(oldPath),current:hash(path.join(root,'outputs/simulation.js')),densePass:hash(path.join(root,'outputs/dense-neural.js'))},boundary:'Three real genomes from the original V3 Monza save, independently driven from the start line. Exact dense neural arrays, controls and body/reward state checked at every relevant tick. This is compatibility evidence, not evidence of improved convergence.'};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log('ROOT_CPU_DONE '+JSON.stringify({passed:true,cases:cases.length,originalUnchanged:true}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
