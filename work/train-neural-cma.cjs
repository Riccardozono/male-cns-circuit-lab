'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort}=require('node:worker_threads');
const Env=require('./ppo-environment.cjs'),PPO=require('./ppo-neural.cjs'),{CMA}=require('./neural-cma.cjs'),Check=require('./experimental-checkpoint.cjs'),{X,F,L}=Env,root=path.resolve(__dirname,'..');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),checksum=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
if(!isMainThread){
  const sim=new F.Simulation(X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  parentPort.on('message',m=>{try{parentPort.postMessage({id:m.id,result:Env.evaluate(sim.track,sim.graph,m.genome)});}catch(error){parentPort.postMessage({id:m.id,error:error.stack});}});
}else{
  const arg=(name,otherwise)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)||otherwise;
  const tag=arg('tag','initial'),generations=Number(arg('generations','12')),population=Number(arg('population','18')),workers=Number(arg('workers','2')),resume=arg('resume',''),initialSigma=Number(arg('sigma','.12'));
  if(!/^[a-z0-9-]+$/.test(tag)||!Number.isInteger(generations)||generations<1||generations>1000||!Number.isInteger(population)||population<6||population>100||!Number.isInteger(workers)||workers<1||workers>3||!Number.isFinite(initialSigma)||initialSigma<=0||initialSigma>2)throw Error('Invalid experiment settings');
  const output=path.join(root,'.impeccable/review/neural-cma',tag),source=path.join(root,'.impeccable/review/context8/prefix-safe/context7-local-proposal.malecns-save'),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',sourceHash=hash(source),originalHash=hash(original),pool=[];
  if(fs.existsSync(path.join(output,'checkpoint.json')))throw Error('Choose a fresh output tag; an existing checkpoint will not be replaced');
  fs.mkdirSync(output,{recursive:true});let request=0;
  async function main(){
    const file=await X.P.decode(fs.readFileSync(source,'utf8'),'5.6.0'),sim=new F.Simulation(X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
    X.P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});const incumbent=file.payload.workers[0].state.genomes[1];sim.spawn([incumbent]);
    const car=sim.cars[0],rows=[];while(car.alive&&sim.ticks<12000){sim.tick();if(car.alive&&sim.ticks%6===1)rows.push({progress:car.bestProgress,features:PPO.neuralFeatures(sim.graph,car.brain,car.genome.policyWeights,L).features});}
    if(car.alive)throw Error('Incumbent evaluation did not terminate naturally');
    const prefix=rows.filter((row,index)=>index%8===0&&row.progress<car.bestProgress*.65).map(row=>row.features),protectedBasis=PPO.prefixBasis(prefix),basis=[];
    const late=rows.filter(row=>row.progress>=car.bestProgress*.65).map(row=>PPO.orthogonal(row.features,protectedBasis));
    for(let k=0;k<8;k++){
      let best=null,largest=0;for(const features of late){const vector=PPO.orthogonal(features,basis),length=Math.hypot(...vector);if(length>largest){largest=length;best=vector;}}
      if(largest<1e-5)break;basis.push(best.map(v=>v/largest));
    }
    if(basis.length<2)throw Error('Insufficient independent real neural contexts');
    let reference=new PPO.Actor(sim.graph.learning,incumbent.policyWeights),genes=incumbent.policyWeights.slice(),optimizer=new CMA(Array(basis.length*2).fill(0),initialSigma,population),random=F.rng(887717),history=[],best=Env.evaluate(sim.track,sim.graph,incumbent),bestGenes=genes.slice(),bestCoordinates=Array(basis.length*2).fill(0),evaluations=1;
    const baseline={...best},sourceHashes=Object.fromEntries(['work/neural-cma.cjs','work/train-neural-cma.cjs','work/ppo-environment.cjs','work/ppo-neural.cjs','work/experimental-checkpoint.cjs','.impeccable/experimental-context8/outputs/simulation.js','.impeccable/experimental-context8/outputs/neural-learning.js','.impeccable/experimental-context8/outputs/rewards.js','.impeccable/experimental-context8/outputs/vehicle-992.js'].map(f=>[f,hash(path.join(root,f))]));
    if(resume){
      const saved=Check.verify(JSON.parse(fs.readFileSync(path.resolve(root,resume),'utf8')),{format:'male-cns-cma-experiment',sourceSha256:sourceHash,legacySourceSha256:originalHash,graph:X.P.compatibleGraph(sim.graph),sourceHashes});
      if(saved.algorithm!=='protected-neural-elite-cma-v2'||JSON.stringify(saved.basis)!==JSON.stringify(basis)||!L.valid(sim.graph,saved.bestGenes)||!L.valid(sim.graph,saved.referenceGenes)||saved.optimizer.population!==population||saved.bestCoordinates?.length!==basis.length*2||saved.bestCoordinates.some(v=>!Number.isFinite(v)))throw Error('Incompatible CMA checkpoint');
      optimizer=CMA.restore(saved.optimizer);random=F.rng(saved.randomState);history=saved.history;best=saved.bestEvaluation;bestGenes=saved.bestGenes;bestCoordinates=saved.bestCoordinates;genes=saved.referenceGenes;reference=new PPO.Actor(sim.graph.learning,genes);evaluations=saved.evaluations;
    }
    const makeGenome=x=>{
      const actor=new PPO.Actor(sim.graph.learning,genes);for(let j=0;j<actor.dimension;j++)for(let action=0;action<2;action++)actor.weights[j*2+action]+=basis.reduce((sum,d,k)=>sum+d[j]*x[k*2+action]*(action===0?2:4),0);
      PPO.projectActor(actor,reference,protectedBasis);const values=actor.install(genes);if(!L.valid(sim.graph,values))throw Error('Invalid bounded candidate');return {...F.cloneGenome(incumbent),policyWeights:values};
    };
    for(let k=0;k<workers;k++){
      const thread=new Worker(__filename),pending=new Map();thread.on('message',m=>{const job=pending.get(m.id);if(!job)return;pending.delete(m.id);m.error?job.reject(Error(m.error)):job.resolve(m.result);});thread.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});pool.push({thread,pending});
    }
    const run=(slot,genome)=>new Promise((resolve,reject)=>{const id=++request;slot.pending.set(id,{resolve,reject});slot.thread.postMessage({id,genome});});
    const started=performance.now();
    for(let count=0;count<generations;count++){
      const candidates=optimizer.ask(random);candidates[0]={x:bestCoordinates.slice()};let index=0;
      // Elitist variant: physically reevaluate the best coordinates, never
      // inject a historical score as if it were a new driving episode.
      await Promise.all(pool.map(async slot=>{while(index<candidates.length){const at=index++,candidate=candidates[at],genome=makeGenome(candidate.x),result=await run(slot,genome);candidate.result=result;candidate.fitness=result.complete?result.fitness:-1e9;evaluations++;if(result.complete&&result.bestProgress>=baseline.bestProgress&&result.fitness>best.fitness){best=result;bestGenes=genome.policyWeights.slice();bestCoordinates=candidate.x.slice();}}}));
      const metrics=optimizer.tell(candidates),entry={generation:optimizer.generation,evaluations,metrics,bestEvaluation:best,batchMeanProgress:candidates.reduce((s,c)=>s+c.result.bestProgress,0)/population,batchMaxProgress:Math.max(...candidates.map(c=>c.result.bestProgress)),wallSeconds:(performance.now()-started)/1000};history.push(entry);
      const saved=Check.seal({format:'male-cns-cma-experiment',schema:1,algorithm:'protected-neural-elite-cma-v2',appVersion:'5.6.0',graph:X.P.compatibleGraph(sim.graph),sourceSha256:sourceHash,legacySourceSha256:originalHash,referenceGenes:genes,basis,protectedBasis,bestGenes,bestCoordinates,bestEvaluation:best,optimizer,randomState:random.getState(),history,evaluations,sourceHashes});Check.atomicWrite(path.join(output,'checkpoint.json'),saved);fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({baseline,history},null,2));
      console.log('NEURAL_CMA_GENERATION '+JSON.stringify(entry));if(best.laps===2)break;
    }
    const verification=Env.evaluate(sim.track,sim.graph,{...F.cloneGenome(incumbent),policyWeights:bestGenes});
    if(JSON.stringify(verification)!==JSON.stringify(best))throw Error('Deterministic champion replay mismatch');
    const report={passed:true,originalUnchanged:hash(original)===originalHash,sourceUnchanged:hash(source)===sourceHash,sourceHashes,baseline,best,verification,history,configuration:{model:'v3',circuit:'monza',workers,population,generationsRequested:generations,initialSigma,algorithm:'protected-neural-elite-cma-v2',coordinates:basis.length*2,anatomicalNodes:sim.graph.n,anatomicalEdges:sim.graph.edgeCount,neuralPrefixRank:protectedBasis.length},boundary:'Elitist positive-weight CMA-ES variant over a bounded learned neural readout, with real reevaluation of the best candidate. Search directions are derived from actual incumbent neural features, not coordinates or desired steering/speed. Every fitness is a complete real start-line episode with unchanged reward, physics and anatomy. No curriculum replay, shortened generation, teacher or route driver. Strictly resumable explicit optimizer checkpoint; no publication or user-save modification.'};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('NEURAL_CMA_DONE '+JSON.stringify({...report,history:undefined,sourceHashes:undefined}));
  }
  main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await Promise.all(pool.map(slot=>slot.thread.terminate()));});
}
