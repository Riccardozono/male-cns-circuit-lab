'use strict';
// Replay an actual trained elite and measure the existing mutation operators.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),rms=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length);
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
function decoder(features,weights,p){let steer=0,long=0,norm=1/Math.sqrt(p.nodes.length);for(let j=0;j<features.length;j++){steer+=features[j]*weights[p.readoutOffset+j*2]*norm;long+=features[j]*weights[p.readoutOffset+j*2+1]*norm;}long=Math.tanh(long+weights.at(-1));return [Math.tanh(steer+weights.at(-2)),Math.max(0,long),Math.max(0,-long)];}
function quantiles(xs){xs=xs.slice().sort((a,b)=>a-b);return {min:xs[0],median:xs[Math.floor(xs.length/2)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)};}
function firstAnchorModule(){
  const p=require.resolve('../outputs/neural-learning.js'),source=fs.readFileSync(p,'utf8'),anchor='const sorted=(centres||[]).slice().sort((a,b)=>b.count-a.count),basis=[];';
  if(source.split(anchor).length!==2)throw Error('Expected one anchor ordering');const changed=source.replace(anchor,'const sorted=(centres||[]).slice(),basis=[];'),m=new Module(p,module);m.filename=p;m.paths=Module._nodeModulePaths(path.dirname(p));m._compile(changed,p);return {api:m.exports,sha256:sha(changed)};
}
async function main(){
  if(fs.existsSync(out))throw Error('Preserve prior audit');const before=hashes(),raw=fs.readFileSync(file),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza')throw Error('Actual V3 Monza checkpoint required');
  const sim=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json'),seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};sim.spawn([F.cloneGenome(state.genomes[0])]);
  const car=sim.cars[0],rows=[];sim.onTrialTick=s=>{if((s.ticks-1)%s.neuralInterval===0)rows.push({simTime:car.lifetime,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),speedMps:car.vehicle.speedMps,commands:car.outputs.slice(),features:Array.from(car.brain.policyFeatures)});};
  const generation=sim.generation;while(sim.generation===generation)sim.tick();
  const p=sim.graph.learning,weights=car.genome.policyWeights,experience=car.brain.policyExperience,terminal=rows.at(-1),first=rows[0],dominant=experience.centres.slice().sort((a,b)=>b.count-a.count)[0],firstVariant=firstAnchorModule();
  const methods=[['safe-motor',L.safeMotorMutation,null],['safe-longitudinal',L.safeMotorMutation,'longitudinal'],['first-context-anchor',firstVariant.api.safeMotorMutation,null],['local-block',L.localMutation,null]];
  const measured=methods.map(([name,mutate,focus],method)=>{
    const random=F.rng(20261022+method),samples=[],baseline=decoder(terminal.features,weights,p),start=decoder(first.features,weights,p);
    for(let i=0;i<1024;i++){
      const child=name==='local-block'?mutate(sim.graph,weights,random,.32*.35):mutate(sim.graph,weights,random,.32,experience,focus);
      if(!L.valid(sim.graph,child))throw Error('Mutation produced invalid weights');const a=decoder(terminal.features,child,p),b=decoder(first.features,child,p);
      samples.push({l2:Math.sqrt(child.reduce((s,v,j)=>s+(v-weights[j])**2,0)),terminalSteerDelta:a[0]-baseline[0],terminalLongitudinal:a[1]-a[2],terminalLongDelta:a[1]-a[2]-baseline[1]+baseline[2],startMaxDelta:Math.max(...b.map((v,j)=>Math.abs(v-start[j])))});
    }
    return {name,samples:1024,coefficientL2:quantiles(samples.map(s=>s.l2)),terminalSteerDelta:quantiles(samples.map(s=>s.terminalSteerDelta)),terminalLongitudinal:quantiles(samples.map(s=>s.terminalLongitudinal)),terminalLongDelta:quantiles(samples.map(s=>s.terminalLongDelta)),startMaxDelta:quantiles(samples.map(s=>s.startMaxDelta)),unchangedCoefficients:samples.filter(s=>s.l2<1e-12).length,terminalLongChangeAbove001:samples.filter(s=>Math.abs(s.terminalLongDelta)>.01).length};
  });
  const genomes=state.genomes.map(g=>g.policyWeights),groups=[['sensor-gain',0,28],['sensor-bias',28,56],['synaptic-gain',56,p.readoutOffset],['motor-readout',p.readoutOffset,p.length]];
  const diversity=groups.map(([name,start,end])=>{const std=[];for(let j=start;j<end;j++){const avg=genomes.reduce((s,g)=>s+g[j],0)/genomes.length;std.push(Math.sqrt(genomes.reduce((s,g)=>s+(g[j]-avg)**2,0)/genomes.length));}return {name,parameterStd:quantiles(std)};});
  const report={format:'male-cns-trained-v3-mutation-response-v1',passed:true,learningSucceeded:false,input:{file,sha256:sha(raw),generation:state.generation,population:state.population},
    eliteReplay:{sourceGenomeIndex:0,progressM:car.bestProgress/(sim.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason,fitness:car.fitness,controls:rows.length,terminalCommands:terminal.commands,terminalSensorVector:car.sensorVector,
      nearBoundWeights:weights.filter(v=>Math.abs(v)>7.99).length,largestAbsoluteWeight:Math.max(...weights.map(Math.abs)),experienceSamples:experience.samples,contextCount:experience.centres.length,dominantContextCount:dominant.count,dominantTerminalRms:rms(dominant.values,terminal.features),firstTerminalRms:rms(first.features,terminal.features)},
    population:{uniquePolicies:new Set(genomes.map(g=>JSON.stringify(g))).size,diversity},measured,firstAnchorInMemorySourceSha256:firstVariant.sha256,
    sourceHashes:before,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(hashes()),inputUnchanged:sha(fs.readFileSync(file))===sha(raw),
    boundary:'One real protected genome replay from a trained checkpoint. Mutation samples are readout-sensitivity probes, not physical episodes, training labels, teacher actions or evidence of improved driving. First-context ordering is an isolated in-memory hypothesis; application sources and live training are not changed.'};
  if(!report.sourceFilesUnchanged||!report.inputUnchanged)throw Error('Audit integrity failed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('TRAINED_MUTATION_AUDIT '+JSON.stringify({...report,population:report.population,report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
