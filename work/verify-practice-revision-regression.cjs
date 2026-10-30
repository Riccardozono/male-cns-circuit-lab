'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'.impeccable/review/learning-ml/practice-reward-revision-20261023-01'),
  filename=path.join(root,'outputs/simulation.js'),oldSource=fs.readFileSync(path.join(folder,'simulation-before.js'),'utf8'),
  F=require(filename),Legacy=require(path.join(root,'outputs/legacy-models.js')),data=require(path.join(root,'outputs/data/connectome.json'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),old=new Module(filename,module);
old.filename=filename;old.paths=Module._nodeModulePaths(path.dirname(filename));old._compile(oldSource,filename);
const prior=old.exports,sim=new F.Simulation(Legacy.buildV2(data),{population:1,seed:7717}),car=sim.cars[0],p=sim.graph.learning;
F.Rewards.initialise(sim.track,car,null,F.Rewards.LEGACY_REVISION);car.genome.policyWeights.fill(0,p.readoutOffset);
car.genome.policyWeights[car.genome.policyWeights.length-1]=-.1;car.speed=15*(sim.track.pixelsPerMeter||1);F.drive(sim.track,car,[0,0,0]);
const parentHash=hash(JSON.stringify(car)),state=F.capturePracticeState(car),before=prior.evaluatePractice(sim.track,sim.graph,car.genome,state,1200),
  after=F.evaluatePractice(sim.track,sim.graph,car.genome,state,1200),latest=F.evaluatePractice(sim.track,sim.graph,car.genome,{...state,rewardRevision:F.Rewards.REVISION},1200);
assert.equal(prior.capturePracticeState(car).rewardRevision,undefined);assert.equal(state.rewardRevision,'progress-3');
assert.equal(before.fitness,latest.fitness);assert.equal(before.progress,after.progress);assert.equal(before.reason,after.reason);
assert.ok(Math.abs(after.fitness-before.fitness-1540)<1e-7);assert.equal(hash(JSON.stringify(car)),parentHash);
const report={format:'practice-reward-revision-regression-v1',created:new Date().toISOString(),passed:true,
  fixture:'Controlled V2 physical rollout: initial 15 m/s, zero steering, fixed learned longitudinal bias -0.1. This is a regression fixture, not the user driving policy.',
  capturedRevisionBefore:prior.capturePracticeState(car).rewardRevision??null,capturedRevisionAfter:state.rewardRevision,
  before,after,currentRevisionControl:latest,removedWrongPenalty:after.fitness-before.fitness,parentUnchanged:true,
  sources:{beforeSha256:hash(oldSource),afterSha256:hash(fs.readFileSync(filename))},
  boundary:'The numerical difference proves preservation of the historical reward objective; it does not prove better learning.'};
const output=path.join(folder,'regression-proof.json');fs.writeFileSync(output,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({passed:true,beforeFitness:before.fitness,afterFitness:after.fitness,removedWrongPenalty:report.removedWrongPenalty,
  output,reportSha256:hash(fs.readFileSync(output))}));
