'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const outputDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-physics-sensor-routing-20261023-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
  const bytes=fs.readFileSync(savePath),saveHash=sha(bytes),decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state,
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8')),
    sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,state);const car=sim.cars[0],graph=sim.graph,base=car.sensorVector.slice(),perturbed=base.slice();
  for(let i=F.VISUAL_SENSOR_COUNT;i<perturbed.length;i++)perturbed[i]=i%2?1:-1;
  let changedDriveCount=0,maxDriveDelta=0;const policyChannelCounts=Array(require(path.join(root,'outputs/neural-learning.js')).CHANNELS).fill(0);
  for(let k=0;k<graph.inputs.length;k++){
    policyChannelCounts[k%policyChannelCounts.length]++;
    const a=F.sensorDrive(graph,car.genome,base,k,F.MAP_PHYSICS_ADAPTER_GAIN),b=F.sensorDrive(graph,car.genome,perturbed,k,F.MAP_PHYSICS_ADAPTER_GAIN),delta=Math.abs(a-b);
    if(delta>0)changedDriveCount++;maxDriveDelta=Math.max(maxDriveDelta,delta);
  }
  const perPhysicsSensor=Array.from({length:F.PHYSICS_SENSOR_COUNT},(_,index)=>{
    const channel=F.VISUAL_SENSOR_COUNT+index,probe=base.slice();probe[channel]=base[channel]<=0?1:-1;let changed=0;
    for(let k=0;k<graph.inputs.length;k++)if(k%policyChannelCounts.length===channel&&
      F.sensorDrive(graph,car.genome,base,k,F.MAP_PHYSICS_ADAPTER_GAIN)!==F.sensorDrive(graph,car.genome,probe,k,F.MAP_PHYSICS_ADAPTER_GAIN))changed++;
    return {sensorIndex:index,policyChannel:channel,actualValue:base[channel],mappedInputNodes:policyChannelCounts[channel],changedInputDrives:changed};
  });
  const mappedVehicle=new Set(Array.from(graph.physicsChannels).filter(x=>x>=F.VISUAL_SENSOR_COUNT)),
    mappedRoad=new Set(Array.from(graph.roadChannels).filter(x=>x>=F.VISUAL_SENSOR_COUNT+F.VEHICLE_PHYSICS_SENSOR_COUNT));
  const run=vector=>{const brain=F.makeBrain(graph);let output=null;for(let i=0;i<8;i++)output=F.neuralStep(graph,brain,car.genome,vector,true,true,F.MAP_PHYSICS_ADAPTER_GAIN);return {output,activity:brain.activity};};
  const a=run(base),b=run(perturbed);let changedNeurons=0,maxActivityDelta=0;
  for(let i=0;i<a.activity.length;i++){const delta=Math.abs(a.activity[i]-b.activity[i]);if(delta>0)changedNeurons++;maxActivityDelta=Math.max(maxActivityDelta,delta);}
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveHash;
  const physicalChannelsCovered=base.length===F.SENSOR_COUNT&&policyChannelCounts.length===F.SENSOR_COUNT&&
    policyChannelCounts.slice(F.VISUAL_SENSOR_COUNT).every(count=>count>0)&&perPhysicsSensor.every(sensor=>sensor.changedInputDrives>0),
    outputChanged=JSON.stringify(a.output)!==JSON.stringify(b.output);
  const report={appVersion:decoded.appVersion,model:decoded.payload.modelId,circuit:decoded.payload.circuitId,generation:state.generation,
    rewardRevision:state.rewardRevision,genomePolicyWeightCount:car.genome.policyWeights.length,sensorVectorCount:base.length,
    visualSensorCount:F.VISUAL_SENSOR_COUNT,physicsSensorCount:F.PHYSICS_SENSOR_COUNT,policyChannelCount:policyChannelCounts.length,
    graphInputCount:graph.inputs.length,policyInputNodesPerChannel:policyChannelCounts,perPhysicsSensor,
    legacyPhysicsRelayCount:graph.physicsRelayCount,legacyVehicleSensorIndices:[...mappedVehicle].sort((x,y)=>x-y),
    legacyRoadSensorIndices:[...mappedRoad].sort((x,y)=>x-y),changedInputDrivesAfterPhysicsOnlyPerturbation:changedDriveCount,
    maxInputDriveDelta:maxDriveDelta,baselineOutput:a.output,perturbedOutput:b.output,outputChanged,changedNeurons,maxActivityDelta,
    saveSha256:saveHash,saveUnchanged,physicalChannelsCovered,
    conclusion:'For this saved V3 genome, the 28-channel learned policy vector contains 11 visual plus 17 physical sensors. Every physical channel maps to 42 or 43 neural input nodes; a physics-only perturbation changes input drives, recurrent activity and motor outputs. This validates connectivity under a deliberately large diagnostic perturbation, not calibrated sensitivity or improved driving.'};
  report.passed=Boolean(saveUnchanged&&physicalChannelsCovered&&changedDriveCount>0&&changedNeurons>0&&maxActivityDelta>0&&outputChanged);
  if(!report.passed){console.log(JSON.stringify(report,null,2));process.exitCode=1;return;}
  fs.mkdirSync(outputDir,{recursive:false});const reportPath=path.join(outputDir,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  report.reportPath=reportPath;report.reportSha256=sha(fs.readFileSync(reportPath));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
