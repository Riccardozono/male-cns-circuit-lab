'use strict';
// Shared declared physical environment for protected-parent diagnostics and
// collection of its own driving experience. Model validators are unchanged.
const Runtime=require('./current-physics-runtime.cjs');
const Model=require('./neural-statehead-cuda-model.cjs'),Legacy=require('../outputs/legacy-models.js');
const {sha,sourceHashes}=Runtime;
let active=false;
function create({footprint='on',paceMode='strict'}={}){
  if(active)throw Error('One owned physical environment per process; reset it between episodes.');
  if(!['on','off'].includes(footprint)||!['strict','first-lap-moving'].includes(paceMode))throw Error('Unknown declared observation/pace mode.');
  const runtime=Runtime.create(paceMode),F=runtime.F,sourceBefore=sourceHashes(),choice=Model.defaultChoice(),loaded=Model.load(choice.file),env=Model.createFromLoaded(loaded);
  const current=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  const fingerprint=array=>sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
  for(const key of ['bodyIds','from','to','weights'])if(!env.graph[key]||fingerprint(env.graph[key])!==fingerprint(current.graph[key]))throw Error('Actual connectome differs: '+key);
  for(const key of Object.keys(env.track))delete env.track[key];Object.assign(env.track,current.track);
  Object.assign(env.runtime,{drive:F.drive,sense:F.sense,physicsSense:F.physicsSense,makeCar:(track,id,genome)=>{const car=F.makeCar(track,id,genome);car.footprintSensorsEnabled=footprint==='on';return car;}});
  const initial=env.reset(),car=env.currentCar();
  if(initial.bestProgress!==0||initial.laps!==0||initial.totalSimulationSeconds!==0||car.vehicle.speedMps!==0||car.rewardRevision!==F.Rewards.REVISION)throw Error('A cold current-environment start is required.');
  if(JSON.stringify(car.inputs)!==JSON.stringify(F.sense(env.track,car)))throw Error('Current wall observations differ.');
  const p=current.graph.learning,baseGenome=F.cloneGenome(current.cars[0].genome),learnedSensorBlock=env.model.head.causalModel.baseGenome.policyWeights;
  baseGenome.policyWeights=p.mean.slice();
  for(let i=0;i<p.readoutOffset;i++)baseGenome.policyWeights[i]=learnedSensorBlock[i];
  const readoutIndices=env.model.head.environment.readoutNodes.slice(),readoutBodyIds=env.model.head.environment.readoutBodyIds.slice();
  if(readoutIndices.length!==128||readoutIndices.some((index,k)=>current.graph.bodyIds[index]!==readoutBodyIds[k]||current.graph.classNames[current.graph.classCodes[index]]!=='descending_neuron'))throw Error('Real descending-neuron observations are required.');
  active=true;
  return {...env,currentF:F,currentGraph:current.graph,observerSpec:{baseGenome,readoutIndices,readoutBodyIds,history:4,previousActions:2},
    identity:{modelSha256:choice.modelSha256,legacyExpected:choice.expected,currentRewardRevision:car.rewardRevision,paceMode,researchRewardOverlaySha256:runtime.rewardOverlaySha256,footprint,anatomicalNodes:env.graph.n,anatomicalEdges:env.graph.edgeCount,currentTrackLength:env.track.total,pixelsPerMeter:env.track.pixelsPerMeter,sourceSha256:sourceBefore},
    verifySources:()=>{if(JSON.stringify(sourceHashes())!==JSON.stringify(sourceBefore))throw Error('Current source/data changed during replay.');},
    close:()=>{Model.closeCuda();active=false;}};
}
module.exports={create,sourceHashes,stats:Model.stats,close:()=>{Model.closeCuda();active=false;},sha};
