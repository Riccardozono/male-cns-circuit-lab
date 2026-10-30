'use strict';
// Neural-only nonlinear residual, actual reached-state curriculum, PPO-Clip.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Dense=require('../outputs/dense-neural.js'),Legacy=require('../outputs/legacy-models.js');
const PPO=require('./ppo-neural.cjs'),Head=require('./traced-neural-ppo.cjs'),{BatchCudaPass}=require('./cuda-exact-v3-batch-pass.cjs');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen82.malecns-save');
const protectedRun=args.protection==='neural-distance',collisionExtra=Number(args.collisionExtra||0);
if(!Number.isFinite(collisionExtra)||collisionExtra<0||collisionExtra>10000)throw Error('Research collision penalty must be between 0 and 10000');
const out=path.resolve(root,args.out||(protectedRun?'.impeccable/review/learning-ml/traced-v3-residual-ppo-protected-gen82-20261022-01':'.impeccable/review/learning-ml/traced-v3-residual-ppo-gen82-20261022-01')),updates=Number(args.updates||8),environmentCount=16,stepsPerUpdate=128;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const sourceFiles=['work/train-traced-v3-residual-ppo.cjs','work/traced-neural-ppo.cjs','work/ppo-neural.cjs','work/cuda-exact-v3-batch-pass.cjs','work/cuda-exact-v3-pass.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/data/connectome.json','outputs/data/circuits.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
function outcome(env){const c=env.car;return {progressM:c.bestProgress/(env.track.pixelsPerMeter||1),fitness:c.fitness,laps:c.laps,reason:c.reason,simSeconds:c.lifetime,safe:F.isSafeLearningOutcome(c),lapTimes:c.lapTimes.slice()};}
async function main(){
  if(fs.existsSync(out)||!Number.isInteger(updates)||updates<1||updates>64)throw Error('New output and bounded update count required');
  const raw=fs.readFileSync(input),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza')throw Error('Actual V3 Monza checkpoint required');
  const before=hashes(),inputSha=sha(raw),random=F.rng(222610),data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
  const reference=new F.Simulation(data,{population:1,modelId:'v3',circuitId:'monza',circuits,mutation:0,seed:state.seed});reference.rewardRevision=state.rewardRevision;reference.spawn([F.cloneGenome(state.genomes[0])]);
  const graph=reference.graph,track=reference.track,parent=F.cloneGenome(state.genomes[0]),dimension=graph.learning.nodes.length*2+2,actor=new Head.Actor(dimension,random),batch=new BatchCudaPass();
  let protection=null;
  fs.mkdirSync(out,{recursive:false});
  const status={phase:'preflight',pid:process.pid,updatesCompleted:0,actualTransitions:0,started:new Date().toISOString()},progress=()=>fs.writeFileSync(path.join(out,'state.json'),JSON.stringify(status,null,2));progress();
  function create(id,snapshot=null){
    const car=snapshot?structuredClone(snapshot.car):F.makeCar(track,id,F.cloneGenome(parent),state.rewardRevision);
    if(!snapshot){car.brain=F.makeBrain(graph);car.footprintSensorsEnabled=true;}car.id=id;
    return {car,track,previous:snapshot?snapshot.previous.slice():Array(graph.learning.nodes.length).fill(0),noise:[0,0],observation:null,startProgress:car.bestProgress};
  }
  function observe(envs){
    const pending=envs.filter(e=>!e.observation&&e.car.alive),requests=[],original=Dense.step;if(!pending.length)return;
    Dense.step=(g,brain,iterations,enabled,gains)=>{assert.equal(g,graph);assert.ok(enabled);requests.push({brain,iterations,gains});};
    try{for(const e of pending){const c=e.car;c.inputs=F.sense(track,c);c.physicsInputs=F.physicsSense(c,track);c.sensorVector=c.inputs.concat(c.physicsInputs);F.neuralStep(graph,c.brain,c.genome,c.sensorVector,true,true,F.MAP_PHYSICS_ADAPTER_GAIN);}}
    finally{Dense.step=original;}
    assert.equal(requests.length,pending.length);assert.ok(requests.every(r=>r.iterations===requests[0].iterations));batch.passMany(graph,requests.map(r=>r.brain),requests[0].iterations,requests.map(r=>r.gains));
    for(const e of pending){L.commands(graph,e.car.brain,e.car.genome);e.observation=Head.logits(graph,e.car.brain,e.car.genome,e.previous);e.observation.gate=Head.gate(e.observation.x,protection);e.previous=e.observation.features.slice();L.rememberActivity(e.car.brain);}
  }
  function drive(e,commands){e.car.slowOutputs=commands;e.car.outputs=commands;for(let k=0;k<L.CONTROL_INTERVAL&&e.car.alive;k++)F.drive(track,e.car,commands,F.DT);if(collisionExtra>0&&e.car.reason==='urto'&&!e.car.researchCollisionPenaltyApplied){e.car.researchCollisionPenaltyApplied=true;e.car.rewardBreakdown.penalties.collision+=collisionExtra;e.car.penalty+=collisionExtra;e.car.fitness-=collisionExtra;e.car.baseFitness-=collisionExtra;e.car.lastPenalty=collisionExtra;}e.observation=null;}
  function parity(a,b){
    for(const key of ['activity','next','sum','injection'])assert.ok(bytes(a.brain[key]).equals(bytes(b.brain[key])),key);
    for(const key of ['x','y','heading','speed','bestProgress','progress','fitness','laps','lifetime','reason','alive','vehicle','rewardState','rewardBreakdown'])assert.deepEqual(a[key],b[key],key);
  }
  function evaluate(policy,collect=false){
    const e=create(0),trace=crypto.createHash('sha256'),rows=[],snapshots=[];let controls=0,refCar=collect?reference.cars[0]:null;
    while(e.car.alive){
      if(collect&&controls%16===0)snapshots.push({car:structuredClone(e.car),previous:e.previous.slice(),control:controls});
      observe([e]);const obs=e.observation,mean=policy.forward(obs.x).mean,commands=Head.compose(obs,mean),before=e.car.fitness;drive(e,commands);controls++;
      trace.update(JSON.stringify([e.car.bestProgress,e.car.lifetime,commands])+'\n');
      if(collect){for(let k=0;k<L.CONTROL_INTERVAL&&refCar.alive;k++)reference.tick();parity(e.car,refCar);rows.push({x:obs.x,criticFeatures:obs.x.concat([0,0]),reward:(e.car.fitness-before)/1000,terminal:!e.car.alive,progressM:e.car.bestProgress/(track.pixelsPerMeter||1)});}
    }
    return {result:outcome(e),controls,actionTraceSha256:trace.digest('hex'),rows,snapshots};
  }
  try{
    const baseline=evaluate(actor,true);assert.ok(baseline.result.safe&&Number.isFinite(baseline.result.progressM)&&baseline.result.progressM>0,'Parent must produce a safe, measurable from-line replay');assert.equal(baseline.result.laps,0);
    const bank=baseline.snapshots.filter(s=>s.car.vehicle.speedMps>1).slice(-12),prefix=baseline.rows.filter((r,i)=>i%8===0&&r.progressM<baseline.result.progressM*.65).map(r=>r.x);
    let protectedPrefixProof=null;
    if(protectedRun){
      const prototypes=baseline.rows.filter(r=>r.progressM<baseline.result.progressM*.65).map(r=>r.x),terminalDistance=Head.nearestDistance(baseline.rows.at(-1).x,prototypes);
      assert.ok(terminalDistance>1e-5,'Terminal neural context must differ from the protected data');
      const spacing=prototypes.map((x,i)=>Head.nearestDistance(x,prototypes.filter((_,j)=>j!==i))).sort((a,b)=>a-b),radius=Math.max(1e-8,Math.min(terminalDistance*.2,spacing[Math.floor(spacing.length*.95)]*1.25));
      protection={format:'actual-neural-support-v1',prototypes,radius,ramp:terminalDistance-radius,terminalDistance};
      assert.ok(prototypes.every(x=>Head.gate(x,protection)===0));
      const check=evaluate(actor);assert.deepEqual(check.result,baseline.result);assert.equal(check.actionTraceSha256,baseline.actionTraceSha256);
      const probe=new Head.Actor(dimension,F.rng(3));probe.weights=actor.weights.slice();probe.weights[probe.outputOffset+probe.hidden]=1;probe.weights[probe.weights.length-1]=-1;
      const e=create(0),ref=new F.Simulation(data,{population:1,modelId:'v3',circuitId:'monza',circuits,mutation:0,seed:state.seed});ref.rewardRevision=state.rewardRevision;ref.spawn([F.cloneGenome(parent)]);const refCar=ref.cars[0],protectedProgressM=baseline.result.progressM*.65;let controls=0;
      while(e.car.alive){observe([e]);if(e.observation.gate>0){protectedPrefixProof={passed:true,comparedControls:controls,firstActiveControl:controls,firstActiveGate:e.observation.gate,physicalPrefixIdenticalWithLargeNonzeroHead:true};break;}
        drive(e,Head.compose(e.observation,probe.forward(e.observation.x).mean));for(let k=0;k<L.CONTROL_INTERVAL&&refCar.alive;k++)ref.tick();parity(e.car,refCar);controls++;
      }
      assert.ok(protectedPrefixProof&&protectedPrefixProof.comparedControls>0);
      protectedPrefixProof.firstActiveProgressM=e.car.bestProgress/(track.pixelsPerMeter||1);protectedPrefixProof.requiredProtectedProgressM=protectedProgressM;
      assert.ok(protectedPrefixProof.firstActiveProgressM>=protectedProgressM,'Residual gate activated before the observed neural prefix ended');
    }
    assert.ok(bank.length>=4&&prefix.length>=8);const proofActor=new Head.Actor(dimension,F.rng(17));proofActor.weights=actor.weights.slice();
    for(let j=proofActor.outputOffset;j<proofActor.weights.length;j++)proofActor.weights[j]=PPO.normal(F.rng(100+j))*.1;
    const x=baseline.rows[Math.floor(baseline.rows.length*.6)].x,loss=[.31,-.27],gradient=proofActor.gradient(x,loss),gradientChecks=[];
    for(const index of [0,dimension,proofActor.outputOffset-1,proofActor.outputOffset,proofActor.weights.length-1]){
      const old=proofActor.weights[index],epsilon=1e-5,score=()=>proofActor.forward(x).mean.reduce((s,v,i)=>s+v*loss[i],0);proofActor.weights[index]=old+epsilon;const plus=score();proofActor.weights[index]=old-epsilon;const minus=score();proofActor.weights[index]=old;
      const numeric=(plus-minus)/(2*epsilon);assert.ok(Math.abs(numeric-gradient[index])<1e-7);gradientChecks.push({index,analytic:gradient[index],numeric});
    }
    const preflight={passed:true,parentInputSha256:inputSha,zeroHeadFullStateMatchesOriginalAtEveryControl:true,baseline:{result:baseline.result,controls:baseline.controls,actionTraceSha256:baseline.actionTraceSha256},bankActualSnapshotCount:bank.length,bankSourceControls:bank.map(s=>s.control),prefixActualObservations:prefix.length,gradientChecks,protectedPrefixProof,protectionCalibration:protection?{radius:protection.radius,ramp:protection.ramp,terminalDistance:protection.terminalDistance,actualProtectedObservations:protection.prototypes.length}:null,sourceHashes:before};
    fs.writeFileSync(path.join(out,'preflight.json'),JSON.stringify(preflight,null,2),{flag:'wx'});console.log('TRACED_PPO_PREFLIGHT '+JSON.stringify(preflight.baseline));
    const critic=new PPO.Critic(dimension+2,random,32),criticAdam=new PPO.Adam(critic.weights.length,.001),actorAdam=new PPO.Adam(actor.weights.length,.0005);
    let target=0;for(let i=baseline.rows.length-1;i>=0;i--){target=baseline.rows[i].reward+target;baseline.rows[i].targetValue=target;}
    for(let epoch=0;epoch<24;epoch++)for(let start=0;start<baseline.rows.length;start+=64){const rows=baseline.rows.slice(start,start+64),g=Array(critic.weights.length).fill(0);for(const row of rows){const d=critic.gradient(row.criticFeatures,row.targetValue).gradient;for(let j=0;j<g.length;j++)g[j]+=d[j]/rows.length;}criticAdam.update(critic.weights,g,1);}
    const reset=id=>create(id,random()<.25?null:bank[Math.floor(random()*bank.length)]),envs=Array.from({length:environmentCount},(_,i)=>reset(i)),events=[];
    let best={result:baseline.result,controls:baseline.controls,actionTraceSha256:baseline.actionTraceSha256},bestActor=actor.snapshot();observe(envs);
    for(let update=1;update<=updates;update++){
      status.phase='rollout';status.currentUpdate=update;progress();const perEnv=envs.map(()=>[]),episodes=[];
      for(let t=0;t<stepsPerUpdate;t++){
        const pending=[];
        for(let i=0;i<envs.length;i++){
          const e=envs[i],obs=e.observation,residual=actor.forward(obs.x).mean,noiseBefore=e.noise.slice(),rho=.9,gate=obs.gate??1,std=gate>0?[gate*.18*Math.sqrt(1-rho*rho),gate*.18*Math.sqrt(1-rho*rho)]:[1,1],shift=e.noise.map(v=>gate*.18*rho*v);
          const noise=e.noise.map(v=>rho*v+Math.sqrt(1-rho*rho)*PPO.normal(random)),sample=residual.map((v,j)=>obs.base[j]+gate*(v+.18*noise[j])),commands=obs.active?[Math.tanh(sample[0]),Math.max(0,Math.tanh(sample[1])),Math.max(0,-Math.tanh(sample[1]))]:[0,0,0],before=e.car.fitness;
          const criticFeatures=obs.x.concat(noiseBefore),row={x:obs.x,base:obs.base,gate,shift,std,sample,active:obs.active&&gate>0,logp:PPO.logProbability(sample,residual.map((v,j)=>gate*v+obs.base[j]+shift[j]),std),criticFeatures,value:critic.forward(criticFeatures).value};
          drive(e,commands);e.noise=noise;row.reward=(e.car.fitness-before)/1000;row.terminal=!e.car.alive;
          if(row.terminal){episodes.push({...outcome(e),additionalProgressM:(e.car.bestProgress-e.startProgress)/(track.pixelsPerMeter||1),curriculumEpisode:true});envs[i]=reset(i);}
          perEnv[i].push(row);pending.push(row);
        }
        observe(envs);for(let i=0;i<envs.length;i++)pending[i].nextValue=pending[i].terminal?0:critic.forward(envs[i].observation.x.concat(envs[i].noise)).value;
      }
      for(const rows of perEnv)PPO.gae(rows,1,.995);const rows=perEnv.flat();status.phase='updating';progress();
      const metrics=Head.update(actor,critic,actorAdam,criticAdam,rows,prefix,random,{prefixStrength:protectedRun?0:.1}),full=evaluate(actor),event={update,actualTransitions:rows.length,actualCompletedEpisodes:episodes.length,episodes,metrics,fullMeanEvaluation:{result:full.result,controls:full.controls,actionTraceSha256:full.actionTraceSha256}};
      const safe=full.result.safe,better=safe&&(full.result.laps>best.result.laps||(full.result.laps===best.result.laps&&full.result.progressM>best.result.progressM+1e-6));if(better){best=event.fullMeanEvaluation;bestActor=actor.snapshot();}
      const checkpoint={format:'male-cns-traced-residual-ppo-dev-v1',appVersion:'5.6.0',status:'research-unverified',parentGenome:parent,actor:actor.snapshot(),protection,critic:critic.snapshot(),actorAdam,criticAdam,rngState:random.getState(),sourceHashes:before,update,trainingRewardRevision:state.rewardRevision,boundary:'Different nonlinear decoder format; never load as a standard .malecns-save. No route/time/position/controller-independent sensor inputs.'};
      fs.writeFileSync(path.join(out,`update-${String(update).padStart(3,'0')}.json`),JSON.stringify(event,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,`policy-${String(update).padStart(3,'0')}.json`),JSON.stringify(checkpoint,null,2),{flag:'wx'});
      events.push(event);status.phase='training';status.updatesCompleted=update;status.actualTransitions+=rows.length;status.best=best.result;progress();console.log('TRACED_PPO_UPDATE '+JSON.stringify({update,metrics,result:full.result,completedEpisodes:episodes.length}));
      if(best.result.safe&&best.result.laps>=2)break;
    }
    const model={format:'male-cns-traced-residual-policy-dev-v1',appVersion:'5.6.0',parentGenome:parent,actor:bestActor,protection,sourceHashes:before,parentInputSha256:inputSha,status:'research-candidate',expected:best};
    const modelFile=path.join(out,'best-policy.json');fs.writeFileSync(modelFile,JSON.stringify(model,null,2),{flag:'wx'});
    const loaded=JSON.parse(fs.readFileSync(modelFile,'utf8')),proofs=[];protection=loaded.protection;
    for(let i=0;i<2;i++){const candidate=new Head.Actor(loaded.actor.dimension,F.rng(i+4),loaded.actor.hidden);candidate.weights=loaded.actor.weights.slice();const actual=evaluate(candidate);assert.deepEqual(actual.result,loaded.expected.result);assert.equal(actual.actionTraceSha256,loaded.expected.actionTraceSha256);proofs.push({result:actual.result,controls:actual.controls,actionTraceSha256:actual.actionTraceSha256});}
    const unchanged=JSON.stringify(before)===JSON.stringify(hashes()),report={format:'male-cns-traced-residual-ppo-study-v1',passed:unchanged&&sha(fs.readFileSync(input))===inputSha,learningSucceeded:proofs.every(p=>p.result.safe&&p.result.laps>=2),sourceHashes:before,sourceFilesUnchanged:unchanged,
      input:{file:input,sha256:inputSha,generation:state.generation},settings:{environmentCount,stepsPerUpdate,updates:events.length,neuronalFeatures:graph.learning.nodes.length,deltaFeatures:graph.learning.nodes.length,parentMotorFeatures:2,artificialHiddenUnits:actor.hidden,trainableActorParameters:actor.weights.length,gamma:1,lambda:.995,explorationStd:.18,noiseRho:.9,prefixRegularization:protectedRun?'exact zero support on actual earlier neuronal observations':'soft zero residual on actual earlier parent neuronal observations',researchOnlyExtraCollisionPenalty:collisionExtra},protectedPrefixProof,baseline:preflight.baseline,events,best,modelFile,modelSha256:sha(fs.readFileSync(modelFile)),independentFromLineReloads:proofs,gpu:batch.stats(),
      boundary:'Only actual simulator transitions and rewards train this nonlinear neuronal readout. Curriculum snapshots are complete actually reached car/neural/reward states; their inherited progress is not new driving credit. Any extra collision penalty is an in-memory development overlay applied after the real terminal collision reward; it is not an app/reward revision. Promotion is assessed only by complete deterministic from-line evaluation and fresh model-file reloads. One checkpoint/model/circuit, not general convergence. Different private decoder format; app, user save, version and published packages unchanged.'};
    assert.ok(report.passed&&report.gpu.cpuFallbacks===0);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});status.phase='complete';status.learningSucceeded=report.learningSucceeded;progress();console.log('TRACED_PPO_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:preflight.baseline.result,best:best.result,report:path.join(out,'report.json')}));
  }catch(e){status.phase='failed';status.error=e.stack||String(e);progress();throw e;}
  finally{batch.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
