'use strict';
// Read-only replay and neural Jacobian diagnostics. Perturbed sensory vectors
// are diagnostic fixtures ONLY: never vehicle actions or training examples.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',output=path.join(root,'.impeccable/review/learning-observability');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function point(track,s){const q=s*(track.pixelsPerMeter||1),segment=track.segments.find(v=>v.start+v.length>=q)||track.segments.at(-1),t=(q-segment.start)/segment.length;return {x:segment.a.x+(segment.b.x-segment.a.x)*t,y:segment.a.y+(segment.b.y-segment.a.y)*t};}
function radius(a,b,c,ppm){const ab=Math.hypot(a.x-b.x,a.y-b.y),bc=Math.hypot(b.x-c.x,b.y-c.y),ac=Math.hypot(a.x-c.x,a.y-c.y),area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;return area>1e-9?ab*bc*ac/(4*area)/ppm:null;}
const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
async function main(){
  const before=hash(original),file=await P.decode(fs.readFileSync(original,'utf8'),'5.6.0'),sim=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});sim.mutation=0;sim.spawn([file.payload.globalChampion.genome]);
  const car=sim.cars[0],policy=sim.graph.learning,trace=[],snapshots=[],wanted=[100,400,550,650,700,740,770,790];let ticks=0,next=0;
  while(car.alive&&ticks++<12000){
    sim.tick();if(sim.ticks%6!==1)continue;
    const features=Array.from(car.brain.policyFeatures);
    trace.push({progress:car.bestProgress/ car.pixelsPerMeter,elapsed:car.lifetime,speedKmh:car.vehicle.speedMps*3.6,outputs:car.slowOutputs.slice(),features});
    if(car.bestProgress/car.pixelsPerMeter>=wanted[next]){snapshots.push({progress:car.bestProgress/car.pixelsPerMeter,activity:car.brain.activity.slice(),sensors:car.sensorVector.slice(),outputs:car.slowOutputs.slice()});next++;}
  }
  if(car.alive)throw Error('Natural champion episode unfinished');
  const sensitivity=[];
  for(const snapshot of snapshots){
    const brain=()=>{const b=F.makeBrain(sim.graph);b.activity.set(snapshot.activity);return b;};
    const b=brain(),baseline=F.neuralStep(sim.graph,b,car.genome,snapshot.sensors),features=Array.from(b.policyFeatures),channels=[];
    for(let channel=0;channel<F.SENSOR_COUNT;channel++){
      const sensors=snapshot.sensors.slice(),eps=1e-4;sensors[channel]+=eps;
      const changed=brain(),commands=F.neuralStep(sim.graph,changed,car.genome,sensors),delta=Array.from(changed.policyFeatures,(v,i)=>(v-features[i])/eps);
      channels.push({channel,featureDerivativeRms:rms(delta),steeringDerivative:(commands[0]-baseline[0])/eps,longitudinalDerivative:(commands[1]-commands[2]-baseline[1]+baseline[2])/eps});
    }
    sensitivity.push({progress:snapshot.progress,outputs:baseline,channels});
  }
  const geometry=[];for(let s=730;s<=900;s+=5)geometry.push({s,radiusEstimateM:radius(point(sim.track,s-5),point(sim.track,s),point(sim.track,s+5),car.pixelsPerMeter),width:F.trackWidthAt(sim.track,s*car.pixelsPerMeter).widthMeters});
  const early=trace.filter(t=>t.progress>=400&&t.progress<=600),late=trace.filter(t=>t.progress>=700),average=rows=>Array.from({length:policy.nodes.length},(_,j)=>rows.reduce((s,t)=>s+t.features[j],0)/rows.length),a=average(early),z=average(late);
  const report={sourceSha256:before,sourceUnchanged:hash(original)===before,configuration:{model:'v3',circuit:'monza',genome:'actual saved global champion',parameters:policy.length,neurons:sim.graph.n,edges:sim.graph.edgeCount},
    episode:{bestProgressM:car.bestProgress/car.pixelsPerMeter,laps:car.laps,reason:car.reason},geometry,sensitivity,trace,featureContrastRms:rms(a.map((v,j)=>v-z[j])),
    individualFeatureContrast:a.map((v,j)=>({node:policy.nodes[j],bodyId:sim.graph.bodyIds[policy.nodes[j]],straight:v,approach:z[j],contrast:z[j]-v})),
    minimumKinematicRadiusM:F.Vehicle.SPEC.wheelbaseM/Math.tan(F.PHYSICS.maxSteerAngle),
    sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','vehicle-992.js','rewards.js'].map(f=>[f,hash(path.join(root,'outputs',f))])),
    boundary:'Singleton diagnostic replay of the real saved champion, unchanged physics/anatomy/policy. Geometry measurements are from the existing approximate map, not a surveyed circuit or prescribed route. Finite-difference perturbations are standalone inference diagnostics and never training observations, examples, applied controls or copied rewards.'};
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'monza-v3.json'),JSON.stringify(report,null,2));
  console.log('OBSERVABILITY_AUDIT '+JSON.stringify({...report,trace:undefined,geometry:undefined,individualFeatureContrast:undefined,sensitivity:sensitivity.map(s=>({progress:s.progress,outputs:s.outputs,leadingChannels:s.channels.toSorted((a,b)=>b.featureDerivativeRms-a.featureDerivativeRms).slice(0,6)}))}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
