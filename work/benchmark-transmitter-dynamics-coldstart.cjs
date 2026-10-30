'use strict';
// Isolated graph-dynamics hypotheses; no application source or user save edits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const args=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');if(i<3||!v.startsWith('--'))throw Error('Use --name=value');return [v.slice(2,i),v.slice(i+1)];}));
const model=args.model||'v2',seed=Number(args.seed||7717),population=Number(args.population||32),generations=Number(args.generations||12),circuit=args.circuit||'monza';
const out=path.resolve(root,args.out||`.impeccable/review/transmitter-dynamics-${model}-${circuit}-seed${seed}-20261022-01`);
const overlayPath=path.join(root,'.impeccable/review/neurotransmitter-source-20261022-01/v3-transmitter-overlay.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/data/connectome.json','outputs/data/circuits.json','outputs/vehicle-992.js'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
const originalHashes=hashes(),runnerHash=sha(fs.readFileSync(__filename));
if(!['v2','v3'].includes(model)||!Number.isInteger(seed)||!Number.isInteger(population)||population<4||population>100||!Number.isInteger(generations)||generations<1||generations>30)throw Error('Invalid study settings');
if(fs.existsSync(out))throw Error('Refusing to overwrite a dynamics study');
const overlay=JSON.parse(fs.readFileSync(overlayPath,'utf8')),nt=new Map(overlay.nodes.map(n=>[n.bodyId,n.consensus]));
const sourceFile=path.join(path.dirname(overlayPath),'body-neurotransmitters-male-cns-v1.0.feather');
if(sha(fs.readFileSync(sourceFile))!==overlay.source.sha256||overlay.nodeCount!==data.nodes.length)throw Error('Transmitter source identity mismatch');
fs.mkdirSync(out,{recursive:false});
const status={state:'running',model,circuit,seed,population,generations,started:new Date().toISOString(),completedArms:[],current:null};
const writeStatus=()=>fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(status,null,2));
writeStatus();

function installSigns(graph,mode){
  const inhibitory=new Set(mode==='gaba-only'?['gaba']:mode==='gaba-and-glutamate'?['gaba','glutamate']:[]);
  const signs=Array.from(graph.bodyIds,id=>inhibitory.has(String(nt.get(Number(id))||'').toLowerCase())?-1:1);
  const before={from:sha(Buffer.from(graph.from.buffer)),to:sha(Buffer.from(graph.to.buffer)),weights:Float64Array.from(graph.weights),csr:Float64Array.from(graph.csrWeights)};
  let inhibitoryEdges=0;
  for(let e=0;e<graph.weights.length;e++){const sign=signs[graph.from[e]];graph.weights[e]*=sign;if(sign<0)inhibitoryEdges++;}
  for(let source=0;source<graph.n;source++)for(let e=graph.rowOffsets[source];e<graph.rowOffsets[source+1];e++)graph.csrWeights[e]*=signs[source];
  if(before.from!==sha(Buffer.from(graph.from.buffer))||before.to!==sha(Buffer.from(graph.to.buffer))||graph.weights.some((w,i)=>Math.abs(w)!==Math.abs(before.weights[i]))||graph.csrWeights.some((w,i)=>Math.abs(w)!==Math.abs(before.csr[i])))throw Error('Overlay changed graph topology or connection magnitudes');
  const counts={};for(const id of graph.bodyIds){const name=nt.get(Number(id))||'missing';counts[name]=(counts[name]||0)+1;}
  return {mode,inhibitoryNeurons:signs.filter(x=>x<0).length,inhibitoryEdges,counts,topologyAndAbsoluteWeightsPreserved:true};
}

function run(mode){
  const sim=new F.Simulation(model==='v2'?Legacy.buildV2(data):Legacy.tagV3(data),{modelId:model,seed,population,mutation:.16,circuitId:circuit,circuits});
  const initialPopulationSha=sha(JSON.stringify(sim.cars.map(c=>c.genome))),graph=installSigns(sim.graph,mode);
  const rows=[],started=performance.now();let ticks=0,terminal=new Map();
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))for(const c of s.cars)if(!terminal.has(c.id))terminal.set(c.id,{id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,fitness:c.fitness,reason:c.reason,safe:F.isSafeLearningOutcome(c)});};
  status.current={mode,generation:sim.generation};writeStatus();
  while(rows.length<generations){
    if(ticks>=60000)throw Error(`${mode}: generation watchdog at ${sim.generation}`);
    const g=sim.generation;sim.tick();ticks++;
    if(sim.generation!==g){
      if(terminal.size!==population)throw Error('Incomplete actual terminal census');
      const outcomes=Array.from(terminal.values()),safe=outcomes.filter(c=>c.safe),row={generation:g,ticks,safeAgentCount:safe.length,
        maxProgressM:Math.max(...outcomes.map(c=>c.progressM)),bestSafeProgressM:safe.length?Math.max(...safe.map(c=>c.progressM)):null,
        maxSafeLaps:safe.length?Math.max(...safe.map(c=>c.laps)):0,maxSafeFitness:safe.length?Math.max(...safe.map(c=>c.fitness)):null,outcomes};
      rows.push(row);console.log('TRANSMITTER_GENERATION '+JSON.stringify({mode,...Object.fromEntries(Object.entries(row).filter(([k])=>k!=='outcomes'))}));
      status.current={mode,generation:sim.generation,rows};writeStatus();terminal=new Map();ticks=0;
    }
  }
  sim.running=false;
  return {mode,initialPopulationSha,graph,rows,wallSeconds:(performance.now()-started)/1000,optimizer:sim.optimizer.metrics()};
}

try{
  const arms=[];
  for(const mode of ['unsigned-control','gaba-only','gaba-and-glutamate']){const arm=run(mode);arms.push(arm);status.completedArms.push(mode);writeStatus();fs.writeFileSync(path.join(out,`${mode}.json`),JSON.stringify(arm,null,2));}
  const unchanged=JSON.stringify(originalHashes)===JSON.stringify(hashes()),sameInitial=arms.every(a=>a.initialPopulationSha===arms[0].initialPopulationSha);
  const report={format:'male-cns-transmitter-dynamics-coldstart-v1',appVersion:'5.6.0',passed:unchanged&&sameInitial,learningSucceeded:arms.some(a=>a.rows.some(r=>r.maxSafeLaps>=2)),
    settings:{model,circuit,seed,population,generations,mutation:.16,rewardRevision:F.Rewards.REVISION},source:overlay.source,sourceHashes:originalHashes,sourceFilesUnchanged:unchanged,
    runnerSha256:runnerHash,matchedInitialPopulation:sameInitial,arms,
    method:'Each arm starts from the same fresh genomes and RNG with no training checkpoint. Only signs on existing recurrent edges are overlaid in memory using official consensus transmitter predictions. GABA-only and GABA+glutamate negative signs are computational hypotheses; all other labels retain the unsigned baseline. Absolute weights, topology, readout neuron identities, physics, rewards, population, optimizer and seed remain paired. No route, teacher actions, raw-sensor motor bypass or save migration.',
    boundary:'One model, circuit and seed. Predicted transmitter labels do not validate receptor effects or biological physiology. Passing establishes experimental integrity only; two safe laps and independent replication are required for learning success.'};
  if(!report.passed)throw Error('Study integrity failed');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));status.state='complete';status.current=null;writeStatus();
  console.log('TRANSMITTER_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,arms:arms.map(a=>({mode:a.mode,progress:a.rows.map(r=>r.bestSafeProgressM),laps:a.rows.map(r=>r.maxSafeLaps)})),report:path.join(out,'report.json')}));
}catch(error){status.state='failed';status.error=error.stack||String(error);writeStatus();throw error;}
