'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const F=require('../outputs/simulation.js');
const Progress=require('../outputs/progress-save.js');
const Legacy=require('../outputs/legacy-models.js');

const SOURCE_VERSION='5.6.0';
const TARGET_VERSION='5.7.0';
const TARGET_POPULATION=16;
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const copy=value=>JSON.parse(JSON.stringify(value));

function graphFor(modelData,circuits){
  return new F.Simulation(modelData,{circuits:{circuits},modelId:'v3',circuitId:'monza',population:4,running:false}).graph;
}

function mapPolicy(values,sourcePolicy,targetPolicy,fill){
  if(!Array.isArray(values)||values.length!==sourcePolicy.length)throw Error('Vettore V3 originale con dimensione inattesa.');
  if(sourcePolicy.version===targetPolicy.version&&sourcePolicy.length===targetPolicy.length&&sourcePolicy.nodes.length===targetPolicy.nodes.length&&sourcePolicy.nodes.every((node,index)=>targetPolicy.nodes[index]===node))return values.slice();
  if(sourcePolicy.nodes.length!==64||targetPolicy.nodes.length!==128||targetPolicy.length!==330||sourcePolicy.readoutOffset!==targetPolicy.readoutOffset)throw Error('Architettura decoder incompatibile con la migrazione approvata.');
  if(!sourcePolicy.nodes.every((node,index)=>targetPolicy.nodes[index]===node))throw Error('Le 64 uscite V3 originali non sono rimaste nello stesso ordine.');
  const result=fill.slice();
  result.splice(0,sourcePolicy.readoutOffset,...values.slice(0,sourcePolicy.readoutOffset));
  for(let feature=0;feature<sourcePolicy.nodes.length;feature++)for(let action=0;action<2;action++){
    result[targetPolicy.readoutOffset+feature*2+action]=values[sourcePolicy.readoutOffset+feature*2+action];
  }
  result[targetPolicy.length-2]=values[sourcePolicy.length-2];
  result[targetPolicy.length-1]=values[sourcePolicy.length-1];
  return result;
}

function mapGenome(genome,sourcePolicy,targetPolicy){
  const result=copy(genome);
  result.policyWeights=mapPolicy(genome.policyWeights,sourcePolicy,targetPolicy,targetPolicy.mean);
  result.adapterVersion=targetPolicy.version;
  return result;
}

function genomeSignature(genome){return JSON.stringify([genome.encoder,genome.readout,genome.gain,genome.sensorMappingVersion,genome.policyWeights]);}

async function migrate(sourcePath,outputPath,{wide=true,sensorMode='legacy'}={}){
  if(!['legacy','current'].includes(sensorMode)||wide&&sensorMode==='current')throw Error('Il decoder a 128 uscite è confrontato solo con il profilo sensori legacy appaiato.');
  const sourceBytes=await fs.readFile(sourcePath);
  const sourceSha256=sha256(sourceBytes);
  const sourceFile=await Progress.decode(sourceBytes.toString('utf8'),SOURCE_VERSION);
  const sourcePayload=sourceFile.payload;
  if(sourcePayload.modelId!=='v3'||sourcePayload.circuitId!=='monza'||sourcePayload.workers?.length!==5)throw Error('Il file sorgente non corrisponde al save V3/Monza a cinque worker atteso.');

  const sourceModel=Legacy.tagV3(JSON.parse(await fs.readFile(path.join(__dirname,'..','outputs','data','connectome.json'),'utf8')));
  const targetModel=wide?Legacy.tagV3WideReadout(sourceModel):sensorMode==='current'?Legacy.tagV3TrainingCurrent(sourceModel):Legacy.tagV3TrainingBaseline(sourceModel);
  const circuits=JSON.parse(await fs.readFile(path.join(__dirname,'..','outputs','data','circuits.json'),'utf8')).circuits;
  const sourceGraph=graphFor(sourceModel,circuits),targetGraph=graphFor(targetModel,circuits);
  const sourcePolicy=F.ensureLearning(sourceGraph),targetPolicy=F.ensureLearning(targetGraph);
  Progress.validatePayload(sourcePayload,{graph:sourceGraph,circuits:[{id:'lab',revision:1},...circuits]});
  if(sourcePolicy.version!==3||sourcePolicy.length!==202||wide&&(targetPolicy.version!==6||targetPolicy.length!==330||targetPolicy.normalizationCount!==64||targetPolicy.signalCount!==64)||!wide&&(targetPolicy.version!==3||targetPolicy.length!==202))throw Error('Decoder V3 o decoder sperimentale non corrispondente alle dimensioni verificate.');

  const savedChampion=sourcePayload.globalChampion;
  if(!savedChampion||savedChampion.workerIndex!==1||savedChampion.stats?.laps!==0)throw Error('Il campione globale salvato non coincide con il V3/Monza atteso.');
  const sourceState=sourcePayload.workers[savedChampion.workerIndex].state;
  if(sourceState.generation!==67||sourceState.population!==40||sourceState.genomes.length!==40)throw Error('Worker del campione non corrispondente alla generazione 67 attesa.');

  const targetChampion=mapGenome(savedChampion.genome,sourcePolicy,targetPolicy);
  const safeArchive=sourceState.hallOfFame.slice().sort((a,b)=>(b.laps||0)-(a.laps||0)||(b.bestProgress||0)-(a.bestProgress||0)||
    (Number.isFinite(a.bestLapTime)?a.bestLapTime:Infinity)-(Number.isFinite(b.bestLapTime)?b.bestLapTime:Infinity)||b.fitness-a.fitness);
  const archiveSeeds=safeArchive.map(entry=>mapGenome(entry.genome,sourcePolicy,targetPolicy));
  const candidates=[targetChampion,...archiveSeeds,...sourceState.genomes.map(genome=>mapGenome(genome,sourcePolicy,targetPolicy))];
  const population=[],seen=new Set();
  for(const genome of candidates){const signature=genomeSignature(genome);if(seen.has(signature))continue;seen.add(signature);population.push(genome);if(population.length===TARGET_POPULATION)break;}
  if(population.length!==TARGET_POPULATION)throw Error('Il worker salvato non contiene 16 genomi distinti per la copia.');

  const state=copy(sourceState);
  state.population=TARGET_POPULATION;
  state.genomes=population;
  state.champion=targetChampion;
  state.championStats=copy(savedChampion.stats);
  state.bestEver=savedChampion.stats.fitness;
  state.externalChampion=state.externalChampion?mapGenome(state.externalChampion,sourcePolicy,targetPolicy):null;
  state.hallOfFame=state.hallOfFame.map(entry=>({...entry,genome:mapGenome(entry.genome,sourcePolicy,targetPolicy)}));
  state.optimizer={...state.optimizer,
    mean:mapPolicy(sourceState.optimizer.mean,sourcePolicy,targetPolicy,targetPolicy.mean),
    sigma:mapPolicy(sourceState.optimizer.sigma,sourcePolicy,targetPolicy,targetPolicy.scales)};
  state.history=[];

  const payload={modelId:'v3',circuitId:'monza',graph:Progress.compatibleGraph(targetGraph),vehicleRevision:F.Vehicle.REVISION,
    workers:[{index:0,state}],globalChampion:{genome:targetChampion,stats:copy(savedChampion.stats),workerIndex:0}};
  Progress.validatePayload(payload,{graph:targetGraph,circuits:[{id:'lab',revision:1},...circuits],maxWorkers:1});
  const converted=await Progress.encode(payload,TARGET_VERSION);
  const decoded=await Progress.decode(converted,TARGET_VERSION);
  Progress.validatePayload(decoded.payload,{graph:targetGraph,circuits:[{id:'lab',revision:1},...circuits],maxWorkers:1});

  await fs.mkdir(path.dirname(outputPath),{recursive:true});
  await fs.writeFile(outputPath,converted,{encoding:'utf8',flag:'wx'});
  const outputBytes=await fs.readFile(outputPath);
  const sourceAfter=sha256(await fs.readFile(sourcePath));
  if(sourceAfter!==sourceSha256)throw Error('Il file sorgente è cambiato durante la migrazione.');
  const report={format:wide?'male-cns-v3-wide-readout-save-migration-v1':sensorMode==='current'?'male-cns-v3-control-current-sensors-save-migration-v1':'male-cns-v3-control-save-repackage-v1',sourceSha256,targetSha256:sha256(outputBytes),sensorProfile:targetGraph.sensorProfile,footprintSensorsEnabled:sensorMode==='current',
    sourceVersion:SOURCE_VERSION,targetVersion:TARGET_VERSION,modelId:'v3',circuitId:'monza',
    sourceWorker:savedChampion.workerIndex,sourceGeneration:sourceState.generation,sourcePopulation:sourceState.population,
    targetGeneration:state.generation,targetPopulation:state.population,historyEntriesAfterMigration:state.history.length,
    retainedSafeArchiveLineages:archiveSeeds.filter(seed=>population.some(candidate=>genomeSignature(candidate)===genomeSignature(seed))).length,
    sourceReadoutNeurons:sourcePolicy.nodes.length,targetReadoutNeurons:targetPolicy.nodes.length,
    sourcePolicyParameters:sourcePolicy.length,targetPolicyParameters:targetPolicy.length,
    copiedWeights:'56 sensor weights/biases, 16 synaptic gains, 64 existing readout pairs and both motor biases',
    addedWeights:wide?'64 descendant-neuron readout pairs initialized to zero; their exploration scales use target policy defaults':'none; the original 64-readout V3 policy is unchanged',
    sensorSemantics:wide||sensorMode==='legacy'?'Centerline ray clearance matches the original 5.6.0 V3 sensor behavior.':'Body-footprint sensing uses the standard V3 5.7.0 behavior; this is an isolated migration of the 5.6.0 weights, not an exact behavioral replay.',
    sourceUnchanged:sourceAfter===sourceSha256,checksumVerified:true,targetPayloadValidated:true};
  await fs.writeFile(outputPath+'.migration.json',JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  return report;
}

if(require.main===module){
  const [sourcePath,outputPath]=process.argv.slice(2);
  const args=new Set(process.argv.slice(4)),wide=!args.has('--baseline'),sensorMode=args.has('--current-sensors')?'current':'legacy';
  if(!sourcePath||!outputPath){console.error('Uso: node work/migrate-v560-v3-save-to-wide-decoder.cjs <save-5.6.0> <nuova-copia-save-5.7.0> [--baseline] [--current-sensors]');process.exitCode=2;}
  else migrate(path.resolve(sourcePath),path.resolve(outputPath),{wide,sensorMode}).then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error(error.stack||error);process.exitCode=1;});
}

module.exports={migrate,mapPolicy,mapGenome};
