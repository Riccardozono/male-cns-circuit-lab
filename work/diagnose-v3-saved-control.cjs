'use strict';
// Read-only physical-control audit of worker 0 from the supplied V3/Monza save.
// Captures the app's measured road rays and actual normalized motor outputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),savePath=process.argv[2]||'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',out=path.join(root,'.impeccable/review/neural-sacl/v3-saved-gen64-control-telemetry-r2');
assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:false});
const F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js');
const raw=fs.readFileSync(savePath,'utf8'),file=JSON.parse(raw),data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
async function main(){
  const decoded=await Progress.decode(raw,'5.6.0'),descriptor=new F.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});
  const payload=Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits}),state=payload.workers[0].state;
  const sim=new F.Simulation(data,{modelId:'v3',population:4,mutation:.12,circuits,circuitId:'monza'});Progress.restore(sim,state);
  const sampleByCar=new Map(),lastBand=new Map();let ticksAtEnd=[];const generation=sim.generation;let ticks=0;
  sim.onTrialTick=active=>{
    for(const car of active.cars){
      if(!car.bestProgress)continue;
      const band=Math.floor(car.bestProgress/100)*100;
      if(band<100||band>active.track.total/(active.track.pixelsPerMeter||1)||band<=(lastBand.get(car.id)||0))continue;
      lastBand.set(car.id,band);
      const rays=F.sensorDistances(active.track,car),ppm=active.track.pixelsPerMeter||1,outputs=car.outputs||[0,0,0];
      const list=sampleByCar.get(car.id)||[];list.push({carId:car.id,bandMeters:band,bestProgress:car.bestProgress,
        steering:outputs[0],throttle:outputs[1],brake:outputs[2],speedKmh:(car.vehicle?.speedMps??0)*3.6,
        forwardRayMeters:rays[3]/ppm,leftRayMeters:rays[1]/ppm,rightRayMeters:rays[5]/ppm,
        longitudinalG:car.longitudinalG,lateralG:car.lateralG,slipAngleDeg:car.slipAngle*180/Math.PI});sampleByCar.set(car.id,list);
    }
  };
  const original=sim.evolve.bind(sim);sim.evolve=function(){
    ticksAtEnd=this.cars.map(car=>({carId:car.id,bestProgress:car.bestProgress,laps:car.laps,reason:car.reason,alive:car.alive,
      outputs:car.outputs,speedKmh:(car.vehicle?.speedMps??0)*3.6}));return original();
  };
  while(sim.generation===generation&&ticks<14000){sim.tick();ticks++;}
  if(sim.generation===generation)sim.evolve();
  const samples=[...sampleByCar.values()].flat(),bands=[...new Set(samples.map(s=>s.bandMeters))].sort((a,b)=>a-b);
  const bandSummary=bands.map(band=>{const rows=samples.filter(s=>s.bandMeters===band);const mean=key=>rows.reduce((sum,row)=>sum+row[key],0)/Math.max(1,rows.length);
    return {bandMeters:band,cars:rows.length,brakeCommandOver005:rows.filter(s=>s.brake>.05).length,throttleCommandOver005:rows.filter(s=>s.throttle>.05).length,
      bothPedals:rows.filter(s=>s.brake>.005&&s.throttle>.005).length,meanThrottle:mean('throttle'),meanBrake:mean('brake'),meanSteering:mean('steering'),
      meanSpeedKmh:mean('speedKmh'),meanForwardRayMeters:mean('forwardRayMeters'),meanLeftRayMeters:mean('leftRayMeters'),meanRightRayMeters:mean('rightRayMeters'),
      meanLongitudinalG:mean('longitudinalG'),meanLateralG:mean('lateralG')};
  });
  ticksAtEnd.sort((a,b)=>b.bestProgress-a.bestProgress);
  const report={format:'male-cns-v3-saved-control-telemetry-v1',appVersion:'5.6.0',saveSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    validation:'Exact save checksum/version/schema/V3 graph/vehicle/Monza validation passed; original file was read-only.',state:{generation:state.generation,population:state.population,mutation:state.mutation,stagnation:state.stagnation,frontierMeters:state.learningFrontier.progress,laps:state.learningFrontier.laps},
    episode:{evaluatedGeneration:generation,ticks,episodes:ticksAtEnd.length,maxProgress:Math.max(...ticksAtEnd.map(car=>car.bestProgress)),maxLaps:Math.max(...ticksAtEnd.map(car=>car.laps||0)),
      terminalReasons:ticksAtEnd.reduce((acc,car)=>(acc[car.reason||'non specificato']=(acc[car.reason||'non specificato']||0)+1,acc),{}),topThree:ticksAtEnd.slice(0,3),
      telemetrySampleCount:samples.length,bands:bandSummary},
    outputConvention:'Outputs are the actual post-normalization commands passed to the vehicle. Rays are measured against the current real closed track walls. No command was injected.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({report:path.join(out,'report.json'),state:report.state,episode:report.episode},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
