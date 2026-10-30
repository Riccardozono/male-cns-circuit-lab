'use strict';
// Read-only audit: determine whether safeMotorMutation's most-frequent neural
// context anchor is the same context in which the saved V3 leader stops.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-context-anchor-audit-20261020-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const rms=(a,b)=>Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);
const motorVector=features=>[...features.map(value=>value/Math.sqrt(features.length)),1];
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing context-anchor audit');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);
  const targetId=Number(control.treatment.results[0].safeProgressLeader.id),target=sim.cars.find(car=>car.id===targetId);
  if(!target)throw Error('Saved physical progress leader is missing');
  const targetBrain=target.brain,observed=new WeakMap(),originalRemember=Learning.rememberActivity;
  Learning.rememberActivity=function(brain){
    originalRemember(brain);
    if(brain!==targetBrain)return;
    const features=brain.policyFeatures,centres=brain.policyExperience?.centres||[];if(!features?.length||!centres.length)return;
    let nearest=null,distance=Infinity;
    for(const centre of centres){let sum=0;for(let i=0;i<features.length;i++)sum+=(features[i]-centre.values[i])**2;sum/=features.length;if(sum<distance){distance=sum;nearest=centre;}}
    let stats=observed.get(nearest);if(!stats){stats={samples:0,movingSamples:0,stationarySamples:0,brakingSamples:0,throttleSamples:0};observed.set(nearest,stats);}
    stats.samples++;const speed=Math.abs(target.vehicle?.speedMps??0);
    if(speed>.6)stats.movingSamples++;else stats.stationarySamples++;
    if((Number(target.outputs?.[2])||0)>.05)stats.brakingSamples++;
    if((Number(target.outputs?.[1])||0)>.05)stats.throttleSamples++;
  };
  sim.running=true;const generation=sim.generation,terminal=new Map();let ticks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('CONTEXT_ANCHOR_AUDIT_PROGRESS '+JSON.stringify({ticks:s.ticks,alive:s.cars.filter(car=>car.alive).length,leaderProgressM:target.bestProgress/(s.track.pixelsPerMeter||1)}));}
  };
  try{
    while(sim.generation===generation&&ticks++<60000)sim.tick();
    if(sim.generation===generation||terminal.size!==state.population)throw Error('Exact saved generation did not terminate');
    const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
    if(JSON.stringify(outcomes)!==JSON.stringify(expected))throw Error('Generation-64 physical outcomes differ from their protected replay');
    const features=Array.from(targetBrain.policyFeatures||[]),experience=targetBrain.policyExperience;
    if(!features.length||!experience?.centres?.length||!observed.get(experience.centres[0]))throw Error('Terminal neuronal context or online center observations missing');
    const policy=sim.graph.learning,weights=target.genome.policyWeights,anchor=experience.centres.slice().sort((a,b)=>b.count-a.count)[0],terminalVector=motorVector(features),anchorVector=motorVector(anchor.values);
    const projection=dot(terminalVector,anchorVector)/dot(anchorVector,anchorVector),residual=terminalVector.map((value,i)=>value-projection*anchorVector[i]);
    const centers=experience.centres.map((centre,index)=>{
      const vector=motorVector(centre.values),delta=vector.map((value,i)=>value-anchorVector[i]);
      const stats=observed.get(centre)||{samples:0,movingSamples:0,stationarySamples:0,brakingSamples:0,throttleSamples:0};
      return {rank:index+1,count:centre.count,featureRmsToTerminal:rms(centre.values,features),motorVectorCosine:dot(vector,terminalVector)/Math.sqrt(dot(vector,vector)*dot(terminalVector,terminalVector)),
        terminalSensitivityAfterAnchorProjection:Math.sqrt(dot(orthogonal(terminalVector,anchorVector),orthogonal(terminalVector,anchorVector)))/Math.sqrt(dot(terminalVector,terminalVector)),
        outputAtCenter:decode(centre.values,weights,policy),observedSpeedAndPriorActions:stats};
    }).sort((a,b)=>b.count-a.count);
    const targetResult=terminal.get(targetId),report={format:'male-cns-saved-v3-context-anchor-audit-v1',appVersion:'5.6.0',passed:true,
      save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      method:'Exact in-memory replay of the supplied generation-64 save. All 40 terminal physical outcomes must match the protected current-source replay. A read-only wrapper measures speed and the prior motor commands while the real rememberActivity function assigns contexts; no sensor/action/route or reward data is added to the policy experience.',
      selectedLeader:{id:targetId,...targetResult,experienceSamples:experience.samples,contextCentreCount:experience.centres.length,terminalSpeedMps:target.vehicle?.speedMps??0,
        terminalOutputs:target.outputs.slice(),terminalNeuralFeatureCount:features.length,dominantAnchorCount:anchor.count,dominantAnchorFeatureRmsToTerminal:rms(anchor.values,features),
        terminalMotorProjectionOntoDominantAnchor:projection,terminalMotorChangeFractionAvailableUnderAnchorConstraint:Math.sqrt(dot(residual,residual))/Math.sqrt(dot(terminalVector,terminalVector)),
        dominantAnchorCommandObservations:observed.get(anchor)||null,centres:centers},
      sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      gpu:Cuda.stats(),
      boundary:'This audit can establish whether the dominant mutation anchor overlaps the actual terminal neural state. It does not itself prove a mutation change improves driving. User save, application source, version, release, and model weights are not changed.'};
    if(!report.save.unchanged||report.gpu.cpuFallbacks!==0||report.gpu.gpuCalls===0)throw Error('Save integrity or exact CUDA verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('CONTEXT_ANCHOR_AUDIT_RESULT '+JSON.stringify({passed:report.passed,saveUnchanged:report.save.unchanged,leader:report.selectedLeader,report:path.join(out,'report.json')}));
  }finally{Learning.rememberActivity=originalRemember;Dense.step=originalDenseStep;sim.running=false;Cuda.close();}
}
function orthogonal(a,b){const scale=dot(a,b)/dot(b,b);return a.map((value,i)=>value-scale*b[i]);}
function decode(features,weights,policy){
  const norm=1/Math.sqrt(policy.nodes.length);let longitudinal=weights.at(-1);
  for(let j=0;j<policy.nodes.length;j++)longitudinal+=features[j]*weights[policy.readoutOffset+j*2+1]*norm;
  const value=Math.tanh(longitudinal);return {gas:Math.max(0,value),brake:Math.max(0,-value),longitudinalLogit:longitudinal};
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
