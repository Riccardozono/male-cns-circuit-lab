'use strict';
// Build two isolated, native-format V3 copies from one trained population.
// Both copies retain identical genomes/RNG but start a fresh reward history
// and optimizer; only the supported rewardRevision differs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-resume-gen109-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen114.malecns-save');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/reward-revision-migration-ab-gen114-20261022-01');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/progress-save.js','outputs/rewards.js','outputs/dense-neural.js','outputs/vehicle-992.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));

async function main(){
  if(fs.existsSync(out))throw Error('Preserve prior migration output');
  const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0');
  const payload=decoded.payload,state=payload.workers[0].state;
  if(payload.modelId!=='v3'||payload.circuitId!=='monza'||state.rewardRevision!==F.Rewards.LEGACY_REVISION)throw Error('Expected a legacy-reward V3 Monza checkpoint');
  const genomes=state.genomes.map(F.cloneGenome),genomeHash=sha(JSON.stringify(genomes)),revisions=[F.Rewards.LEGACY_REVISION,F.Rewards.REVISION],outputs=[];
  fs.mkdirSync(out,{recursive:false});
  for(const revision of revisions){
    const sim=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:state.population,circuitId:'monza',circuits:require('../outputs/data/circuits.json'),seed:state.seed,mutation:state.mutation,speedMultiplier:state.speedMultiplier});
    sim.rewardRevision=revision;sim.random=F.rng(state.rngState);sim.generation=state.generation;sim.history=[];sim.elapsed=0;sim.stagnation=0;
    sim.bestEver=-Infinity;sim.champion=null;sim.championStats=null;sim.externalChampion=null;sim.hallOfFame=[];
    sim.learningFrontier={progress:0,laps:0,lapTime:null};sim.safeLearningFrontier={progress:0,laps:0,lapTime:null};
    sim.optimizer=new L.EvolutionStrategy(sim.graph);sim.spawn(genomes.map(F.cloneGenome),true);sim.running=false;sim.accumulator=0;
    const migrated=P.fromSimulation(sim);migrated.globalChampion=null;
    const text=await P.encode(migrated,'5.6.0'),verified=await P.decode(text,'5.6.0');
    P.validatePayload(verified.payload,{graph:sim.graph,circuits:sim.circuits});
    const migratedState=verified.payload.workers[0].state;
    assert.equal(migratedState.rewardRevision,revision);assert.equal(migratedState.generation,state.generation);assert.equal(migratedState.history.length,0);
    assert.equal(migratedState.optimizer.updates,0);assert.equal(migratedState.optimizer.episodes,0);assert.equal(migratedState.rngState,state.rngState);
    assert.equal(sha(JSON.stringify(migratedState.genomes)),genomeHash);
    const directory=path.join(out,revision);fs.mkdirSync(directory,{recursive:false});
    const filename=P.filename(verified.payload,'5.6.0'),file=path.join(directory,filename);fs.writeFileSync(file,text,{flag:'wx'});
    outputs.push({revision,file,sha256:sha(text),generation:migratedState.generation,population:migratedState.population,historyEntries:migratedState.history.length,optimizerUpdates:migratedState.optimizer.updates,optimizerEpisodes:migratedState.optimizer.episodes,genomeSha256:genomeHash,rngState:migratedState.rngState});
  }
  const after=hashes(),report={format:'male-cns-reward-revision-migration-ab-v1',appVersion:'5.6.0',passed:JSON.stringify(before)===JSON.stringify(after)&&sha(fs.readFileSync(input))===inputSha&&outputs.length===2&&outputs.every(x=>x.genomeSha256===genomeHash&&x.historyEntries===0&&x.optimizerUpdates===0),learningSucceeded:false,
    input:{file:input,sha256:inputSha,originalRewardRevision:state.rewardRevision,generation:state.generation,population:state.population},
    copies:outputs,sourceHashes:before,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),inputUnchanged:sha(fs.readFileSync(input))===inputSha,
    boundary:'Two fresh-history native 5.6.0 research copies. Their population genomes, RNG, circuit, seed and generation are identical; historical reward records, optimizer state, archives and champion claims are reset. Only rewardRevision differs. Original source save, app sources, app version and releases are unchanged. This migration does not prove better learning.'};
  assert.ok(report.passed);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('MIGRATION_AB_RESULT '+JSON.stringify({passed:report.passed,copies:outputs,report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
