'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),Pool=require('./physical-rollout-pool.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-prefix-constrained-readout-20261024-01');if(fs.existsSync(out))throw Error('Preserve prior constrained readout probe');
  const trainingDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01'),training=JSON.parse(fs.readFileSync(path.join(trainingDir,'report.json'),'utf8')),
    privateModel=JSON.parse(fs.readFileSync(path.join(trainingDir,'zero-only.private.json'),'utf8')),genome=privateModel.genome,
    expected=training.final.find(x=>x.arm==='zero-only').best.zero,sim=Pool.setup(),observations=[],started=Date.now();
  if(!training.passed||sha(JSON.stringify(genome))!==training.final.find(x=>x.arm==='zero-only').best.genomeSha256)throw Error('Verified full-episode parent required');
  const physical=fullRollout(F,sim.track,sim.graph,genome,{rewardRevision:'progress-3',maxTicks:60000,onControl:(car,tick)=>observations.push({tick,progressM:car.bestProgress/(sim.track.pixelsPerMeter||1),features:Array.from(car.brain.policyFeatures)})}),
    baseline={...outcome(F,physical),progressM:physical.car.bestProgress/(sim.track.pixelsPerMeter||1)};
  if(!Pool.same(baseline,expected))throw Error('Parent calibration replay differs');
  const sourceHashes=Pool.sources(),pythonFile=path.join(root,'work/fit-prefix-constrained-readout.py'),pythonHash=sha(fs.readFileSync(pythonFile));
  fs.mkdirSync(out,{recursive:false});const input=path.join(out,'calibration.private.json'),candidateFile=path.join(out,'candidates.private.json');
  fs.writeFileSync(input,JSON.stringify({format:'actual-neuronal-prefix-v1',genome,parentSha256:sha(JSON.stringify(genome)),baseline,readoutOffset:sim.graph.learning.readoutOffset,observations}),{flag:'wx'});
  const fitted=spawnSync(path.join(root,'.impeccable/rl-venv/Scripts/python.exe'),[pythonFile,input,candidateFile],{windowsHide:true,encoding:'utf8',maxBuffer:1024*1024});
  if(fitted.status!==0)throw Error('Readout fit failed: '+fitted.stderr);console.log('READOUT_FIT '+fitted.stdout.trim());
  const candidateData=JSON.parse(fs.readFileSync(candidateFile,'utf8')),unique=new Map();
  if(candidateData.inputParentSha256!==sha(JSON.stringify(genome)))throw Error('Numeric fitter parent mismatch');
  for(const row of candidateData.variants){if(!L.valid(sim.graph,row.genome.policyWeights)||JSON.stringify(row.genome.policyWeights.slice(0,sim.graph.learning.readoutOffset))!==JSON.stringify(genome.policyWeights.slice(0,sim.graph.learning.readoutOffset)))throw Error('Candidate changed anatomy/sensory adapter');
    const h=sha(JSON.stringify(row.genome));row.genomeSha256=h;if(!unique.has(h))unique.set(h,row);}
  const reference={genome,headingOffsetRad:0,rewardRevision:'progress-3',expected:baseline},tasks=[...unique].map(([id,row])=>({id,genome:row.genome,headingOffsetRad:0,rewardRevision:'progress-3'})),
    measured=await Pool.runPool(tasks,reference,{onResult:(_id,r,n,total)=>{if(n%8===0||r.safe&&r.progressM>baseline.progressM+1)console.log('READOUT_PHYSICAL '+JSON.stringify({completed:n,total,progressM:r.progressM,safe:r.safe,laps:r.laps}));}});
  for(const row of candidateData.variants)row.outcome=measured.results.get(row.genomeSha256);
  const ranked=[...unique.values()].filter(x=>x.outcome.safe).sort((a,b)=>F.compareLearningAgents(a.outcome,b.outcome)),top=ranked.slice(0,3),offsets=[-.002,-.001,0,.001,.002],
    validationTasks=[{id:'parent',genome},...top.map(x=>({id:x.genomeSha256,genome:x.genome}))].flatMap(c=>offsets.filter(x=>x!==0).map(offset=>({id:c.id+':'+offset,genome:c.genome,headingOffsetRad:offset,rewardRevision:'progress-3'}))),
    validation=await Pool.runPool(validationTasks,reference),starts=[{id:'parent',baseline},...top.map(x=>({id:x.genomeSha256,baseline:x.outcome}))].map(c=>({id:c.id,outcomes:offsets.map(offset=>({headingOffsetRad:offset,...(offset===0?c.baseline:validation.results.get(c.id+':'+offset))}))}));
  const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveUnchanged=sha(fs.readFileSync(savePath))==='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
    sourceStable=JSON.stringify(Pool.sources())===JSON.stringify(sourceHashes)&&sha(fs.readFileSync(pythonFile))===pythonHash,
    publicRow=({genome,...rest})=>rest,report={format:'prefix-constrained-readout-probe-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:saveUnchanged&&sourceStable,
      learningSucceeded:starts.some(x=>x.outcomes.every(r=>r.safe&&r.laps>=2)),singleStartImproved:Boolean(ranked[0]&&ranked[0].outcome.progressM>baseline.progressM+1),
      baseline,numericVersion:candidateData.numpyVersion,diagnostics:candidateData.diagnostics,variants:candidateData.variants.map(publicRow),planned:candidateData.variants.length,uniqueEpisodes:unique.size,
      starts,top:top.map(publicRow),settings:{fractions:[.85,.93,.98],retainedPrefixFraction:.8,prefixLogitLimit:.001,ridges:[.01,.0001,.000001],requestedMotorLogitChanges:[-.1,0,.1],workers:2,maxTicks:60000},
      method:'Fit static readout coefficient directions to actual neuronal states: minimise response energy on the retained prefix subject to unit response at an observed target and zero mean-prefix response. Symmetric requested motor changes are bounded by the existing weight limits and prefix logit cap, then judged only by full physical episodes. Geometry/progress chooses calibration samples offline; no runtime route, clock or teacher action enters the policy.',
      integrity:{saveUnchanged,sourceStable,sourceHashes,pythonSourceSha256:pythonHash,trainingReportSha256:sha(fs.readFileSync(path.join(trainingDir,'report.json'))),calibrationSha256:sha(fs.readFileSync(input)),candidateDataSha256:sha(fs.readFileSync(candidateFile))},
      wallSeconds:(Date.now()-started)/1000,boundary:'Recorded-state constraints do not guarantee closed-loop retention. These are candidate weight probes, not proof of learned two-lap performance.'};
  if(!report.passed)throw Error('Constrained readout integrity failed');const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2),{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));fs.copyFileSync(pythonFile,path.join(out,'fitter-at-run.py'));
  if(report.singleStartImproved)fs.writeFileSync(path.join(out,'best.private.json'),JSON.stringify({format:'private-constrained-readout-v1',appVersion:'5.6.0',genome:ranked[0].genome,sourceReport:'report.json'},null,2),{flag:'wx'});
  console.log('READOUT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,baseline,planned:report.planned,unique:report.uniqueEpisodes,
    top:report.top,starts,saveUnchanged,sourceStable,wallSeconds:report.wallSeconds,report:target,sha256:sha(fs.readFileSync(target))}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
