'use strict';

// Matched replay of encoder compensation only. Both branches use the current
// simulator; the legacy branch restores the audited pre-fix function in memory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const modeArg=process.argv.find(value=>value.startsWith('--sensory-compensation='));
const mode=modeArg?.split('=')[1];
const optimizerObjective=process.argv.find(value=>value.startsWith('--optimizer-objective='))?.split('=')[1]||'safe-progress';
if(!['safe-progress','fitness'].includes(optimizerObjective))throw Error('Optimizer objective must be safe-progress or fitness.');
const contextAnchorCount=Number(process.argv.find(value=>value.startsWith('--context-anchor-count='))?.split('=')[1]||0);
if(!Number.isInteger(contextAnchorCount)||contextAnchorCount<0||contextAnchorCount>8||mode==='legacy'&&contextAnchorCount>0)throw Error('Context anchors require corrected mode and a count in [1,8].');
const contextOutputTrust=Number(process.argv.find(value=>value.startsWith('--context-output-trust='))?.split('=')[1]||0);
if(!Number.isFinite(contextOutputTrust)||contextOutputTrust<0||contextOutputTrust>4||contextOutputTrust>0&&!contextAnchorCount)throw Error('Output trust requires context anchors and a scale in (0,4].');
if(optimizerObjective==='fitness'&&(mode!=='corrected'||contextAnchorCount))throw Error('Isolate the optimizer objective from encoder/context variants.');
const inspectReadout=process.argv.includes('--inspect-neural-readout');
if(inspectReadout&&!process.argv.includes('--replay-frontier'))throw Error('Readout inspection requires --replay-frontier.');
if(!['legacy','corrected'].includes(mode))throw Error('Specify --sensory-compensation=legacy or corrected.');
if(process.argv.some(value=>/^(--sensor-steering|--antithetic-steering|--sensitive-frontier)/.test(value)))throw Error('Do not combine this A/B with mutation-focus overlays.');
if(!process.argv.includes('--pedal-head-focus=control'))throw Error('This comparison requires --pedal-head-focus=control.');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const harnessSha256=sha(fs.readFileSync(__filename));
const simulationPath=path.join(root,'outputs/simulation.js');
const current=fs.readFileSync(simulationPath,'utf8');
const previous=execFileSync('git',['show','ad801d706aa8632ce7145ac88975b1f4e0f87bc7:outputs/simulation.js'],{cwd:root,encoding:'utf8',windowsHide:true});
const extract=source=>{
  const start=source.indexOf('  function mutateSensoryBlock('),end=source.indexOf('  function evaluatePractice(',start);
  if(start<0||end<start)throw Error('Missing bounded sensory mutation function.');
  return source.slice(start,end);
};
const legacy=extract(previous),corrected=extract(current);
if(legacy===corrected||!corrected.includes('preactivation'))throw Error('The expected compensation fix is not present.');
const wrapperPath=path.join(root,'work/research-v3-independent-pedal-focus.cjs');
const originalWrapper=fs.readFileSync(wrapperPath,'utf8');
const anchor="let runnerSource = fs.readFileSync(runnerPath, 'utf8');";
if(originalWrapper.split(anchor).length!==2)throw Error('Expected one runner-source anchor.');
const loadAnchor="let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');";
let loadPatch=`${loadAnchor}
  const correctedSensoryFunction=${JSON.stringify(corrected)},legacySensoryFunction=${JSON.stringify(legacy)};
  if(simulationRuntimeSource.split(correctedSensoryFunction).length!==2)throw Error('Compensation source mismatch.');
  if(${JSON.stringify(mode)}==='legacy')simulationRuntimeSource=simulationRuntimeSource.replace(correctedSensoryFunction,legacySensoryFunction);
  const sensoryGuard='if(!scale||!context||graph.full)return child;';
  if(simulationRuntimeSource.split(sensoryGuard).length!==2)throw Error('Compensation audit guard mismatch.');
  simulationRuntimeSource=${JSON.stringify('const sensoryMutationAudit={calls:0};\n')}+simulationRuntimeSource;
  simulationRuntimeSource=simulationRuntimeSource.replace(sensoryGuard,sensoryGuard+'sensoryMutationAudit.calls++;');
  simulationRuntimeSource=simulationRuntimeSource.replace('const api={Rewards,','const api={sensoryMutationAudit,Rewards,');`;
if(optimizerObjective==='fitness'){
  const start=current.indexOf('  function compareOptimizerAgents('),end=current.indexOf('  function compareSafeFrontier(',start);
  if(start<0||end<start)throw Error('Optimizer comparator source was not found.');
  loadPatch+=`\n  const expectedOptimizerComparator=${JSON.stringify(current.slice(start,end))};
  if(simulationRuntimeSource.split(expectedOptimizerComparator).length!==2)throw Error('Optimizer comparator changed.');
  simulationRuntimeSource=simulationRuntimeSource.replace(expectedOptimizerComparator,'  function compareOptimizerAgents(a,b){return compareAgents(a,b); }\\n');`;
}
let insertion=`${anchor}
runnerSource=replaceExactly(runnerSource,${JSON.stringify(loadAnchor)},${JSON.stringify(loadPatch)},1,'sensory compensation A/B runtime');
runnerSource=replaceExactly(runnerSource,'settings:{population:state.population,','sensoryCompensationAudit:F.sensoryMutationAudit,settings:{population:state.population,',1,'sensory mutation call audit');`;
if(optimizerObjective==='fitness'){
  const marker='let Cuda=null,originalDenseStep=null,outputCreated=false;';
  const hook=`const optimizerObjectiveAudit=[];
    const previousOptimizerUpdate=L.EvolutionStrategy.prototype.update;
    L.EvolutionStrategy.prototype.update=function(agents,compare){
      const sorted=agents.filter(a=>L.valid(this.graph,a.genome?.policyWeights)).slice().sort(compare);
      const before=this.mean.slice();
      const result=previousOptimizerUpdate.call(this,agents,compare);
      optimizerObjectiveAudit.push({update:this.updates,episodes:sorted.length,safe:sorted.filter(F.isSafeLearningOutcome).length,
        meanDeltaL2:Math.hypot(...this.mean.map((v,i)=>v-before[i])),
        ranking:sorted.map(a=>({id:a.id,fitness:a.fitness,progress:a.bestProgress,reason:a.reason,safe:F.isSafeLearningOutcome(a)}))});
      return result;
    };
    ${marker}`;
  insertion+=`\nrunnerSource=replaceExactly(runnerSource,${JSON.stringify(marker)},${JSON.stringify(hook)},1,'optimizer objective update audit');`;
  insertion+=`\nrunnerSource=replaceExactly(runnerSource,'sensoryCompensationAudit:F.sensoryMutationAudit,settings:','optimizerObjectiveAudit,sensoryCompensationAudit:F.sensoryMutationAudit,settings:',1,'optimizer objective report audit');`;
}
if(contextAnchorCount){
  const marker='let Cuda=null,originalDenseStep=null,outputCreated=false;';
  const hook=`const ContextMutation=require(${JSON.stringify(path.join(root,'work/neural-context-mutation.cjs'))});
    const contextAnchorMutationAudit={calls:0,applied:0,fallbacks:0,maxAnchors:0,maxAnchorLogitDrift:0,maxNormalizedRmsChange:0,maxNormalizedContextChange:0,changedByAction:[0,0,0],moduleSha256:${JSON.stringify(sha(fs.readFileSync(path.join(root,'work/neural-context-mutation.cjs'))))}};
    const priorContextMutation=L.safeMotorMutation;
    L.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
      contextAnchorMutationAudit.calls++;
      const result=ContextMutation.mutate(graph,values,r,amount,experience,{anchorCount:${contextAnchorCount},outputTrust:${contextOutputTrust},focus:focus==='longitudinal'?'combined':focus});
      if(!result.audit.applied){contextAnchorMutationAudit.fallbacks++;return priorContextMutation(graph,values,r,amount,experience,focus);}
      contextAnchorMutationAudit.applied++;contextAnchorMutationAudit.maxAnchors=Math.max(contextAnchorMutationAudit.maxAnchors,result.audit.anchors);
      contextAnchorMutationAudit.maxAnchorLogitDrift=Math.max(contextAnchorMutationAudit.maxAnchorLogitDrift,result.audit.maxAnchorLogitDrift);
      contextAnchorMutationAudit.maxNormalizedRmsChange=Math.max(contextAnchorMutationAudit.maxNormalizedRmsChange,result.audit.maxNormalizedRmsChange||0);
      contextAnchorMutationAudit.maxNormalizedContextChange=Math.max(contextAnchorMutationAudit.maxNormalizedContextChange,result.audit.maxNormalizedContextChange||0);
      const p=graph.learning;
      for(let i=p.readoutOffset;i<result.weights.length;i++)if(result.weights[i]!==values[i]){const action=i>=p.biasOffset?i-p.biasOffset:(i-p.readoutOffset)%p.readoutStride;if(action>=0&&action<3)contextAnchorMutationAudit.changedByAction[action]++;}
      return result.weights;
    };
    ${marker}`;
  insertion+=`\nrunnerSource=replaceExactly(runnerSource,${JSON.stringify(marker)},${JSON.stringify(hook)},1,'observed context mutation hook');`;
  insertion+=`\nrunnerSource=replaceExactly(runnerSource,'sensoryCompensationAudit:F.sensoryMutationAudit,settings:','contextAnchorMutationAudit,sensoryCompensationAudit:F.sensoryMutationAudit,settings:',1,'observed context mutation audit');`;
}
if(inspectReadout){
  const probes=[
    ['return{seconds:+car.lifetime.toFixed(3),','return{features:Array.from(car.brain.policyFeatures||[]),sensors:car.sensorVector.slice(),seconds:+car.lifetime.toFixed(3),'],
    ['if(car&&(car.bestProgress>=650||!car.alive)&&ticks%5===0)trace.push(snapshot(car));','if(car&&ticks%L.CONTROL_INTERVAL===0)trace.push(snapshot(car));'],
    ['safeFrontierBeforeReplay:restoredSafeFrontier,terminal,ticks,initialCarKeys,','readoutProbe:{featureNorm:sim.graph.learning.featureNorm,readoutOffset:sim.graph.learning.readoutOffset,readoutStride:sim.graph.learning.readoutStride,biasOffset:sim.graph.learning.biasOffset,weights:candidate.genome.policyWeights,experience:terminalCar?.brain?.policyExperience??null},safeFrontierBeforeReplay:restoredSafeFrontier,terminal,ticks,initialCarKeys,']
  ];
  for(const [from,to] of probes)insertion+=`\nrunnerSource=replaceExactly(runnerSource,${JSON.stringify(from)},${JSON.stringify(to)},1,'read-only neural context inspection');`;
}
const source=originalWrapper.replace(anchor,insertion);
const beforeHash=sha(fs.readFileSync(simulationPath));
process.on('exit',()=>{
  if(sha(fs.readFileSync(simulationPath))!==beforeHash)throw Error('Production source changed during replay.');
  const output=process.argv.find(value=>value.startsWith('--output='));
  if(!output)return;
  const filename=path.resolve(root,output.slice('--output='.length),'decoder7-main-runtime-result.json');
  // The delegated harness subsequently appends its own independent audit.
  if(!fs.existsSync(filename))return;
  const result=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(!contextAnchorCount&&optimizerObjective==='safe-progress'&&!(result.sensoryCompensationAudit?.calls>0))throw Error('No sensory mutation occurred; this is not a test of compensation.');
  if(contextAnchorCount&&(!(result.contextAnchorMutationAudit?.applied>0)||result.contextAnchorMutationAudit.maxAnchorLogitDrift>1e-8))throw Error('Observed context mutation did not satisfy its runtime audit.');
  if(contextOutputTrust&&(result.contextAnchorMutationAudit.maxNormalizedRmsChange>1+1e-8||result.contextAnchorMutationAudit.maxNormalizedContextChange>4+1e-8))throw Error('Observed output changes exceeded the trust budget.');
  if(optimizerObjective==='fitness'&&(!result.optimizerObjectiveAudit?.length||!result.optimizerObjectiveAudit.some(a=>a.meanDeltaL2>0)))throw Error('Optimizer objective did not update the distribution.');
  result.variant='decoder7-sensory-compensation-'+mode+(contextAnchorCount?'-context-anchors-'+contextAnchorCount:'')+(contextOutputTrust?'-output-trust-'+contextOutputTrust:'')+(optimizerObjective==='fitness'?'-optimizer-fitness':'');
  result.settings.sensoryCompensation=mode;
  result.settings.contextAnchorCount=contextAnchorCount;
  result.settings.contextOutputTrust=contextOutputTrust;
  result.settings.optimizerObjective=optimizerObjective;
  result.sensoryResearchHarnessSha256=harnessSha256;
  result.sensoryCompensationAudit={...result.sensoryCompensationAudit,legacyCommit:'ad801d706aa8632ce7145ac88975b1f4e0f87bc7',legacyFunctionSha256:sha(legacy),correctedFunctionSha256:sha(corrected),sourceUnchangedDuringRun:true};
  fs.writeFileSync(filename,JSON.stringify(result,null,2));
});
const loaded=new Module(wrapperPath,module);loaded.filename=wrapperPath;loaded.paths=Module._nodeModulePaths(path.dirname(wrapperPath));
loaded._compile(source,wrapperPath);
