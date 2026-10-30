/* Portable training state, not a mid-lap physics/GPU snapshot. No code from a
 * save is executed. Exact application version, checksum and bounded schema. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./simulation.js'),require('./neural-learning.js'),require('node:crypto'));
  else root.MaleCNSProgress=factory(root.FlySim,root.MaleCNSLearning,null);
})(typeof globalThis!=='undefined'?globalThis:this,function(F,Learning,nodeCrypto){
  'use strict';
  const FORMAT='male-cns-training-save',SCHEMA=1,EXTENSION='malecns-save',MAX_BYTES=16*1024*1024,MAX_WORKERS=32;
  const fail=message=>{throw Error(message);},copy=value=>JSON.parse(JSON.stringify(value));
  const bytes=text=>new TextEncoder().encode(text).byteLength;
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
  function keys(v,allowed,label){if(!record(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail(label+' non valido.');}
  function finite(v,label,min=-1e15,max=1e15){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(label+' non valido.');}
  function integer(v,label,min=0,max=1e12){finite(v,label,min,max);if(!Number.isInteger(v))fail(label+' non intero.');}
  function vector(v,length,label,min=-12,max=12){if(!Array.isArray(v)||v.length!==length)fail(label+': dimensioni incompatibili.');v.forEach(n=>finite(n,label,min,max));}
  function compatibleGraph(graph){const p=F.ensureLearning(graph);return {dataset:graph.dataset,revision:graph.revision,nodes:graph.n,edges:graph.edgeCount,policyVersion:p.version,parameters:p.length,outputs:graph.outputs.length,...(graph.modelId==='v5'?{solver:{...graph.solver},gainGroups:p.gainGroups,readoutNodes:Array.from(p.nodes)}:{})};}
  function genome(g,graph){
    keys(g,['encoder','readout','gain','adapterVersion','policyWeights'],'Genoma');
    vector(g.encoder,F.SENSOR_COUNT*2,'Encoder');vector(g.readout,graph.outputs.length*3,'Readout',-100,100);finite(g.gain,'Guadagno',.01,100);
    if(g.adapterVersion!==F.ensureLearning(graph).version||!Learning.valid(graph,g.policyWeights))fail('Policy neurale incompatibile.');
  }
  function stats(v,label,withGenome,graph){
    keys(v,withGenome?['genome','fitness','progress','bestProgress','laps','bestLapTime']:['fitness','bestProgress','laps','bestLapTime'],label);
    finite(v.fitness,label+' punteggio');finite(v.bestProgress,label+' progresso',0);integer(v.laps,label+' giri',0,2);
    if(v.bestLapTime!==null)finite(v.bestLapTime,label+' tempo',.001);
    if(withGenome){finite(v.progress,label+' progresso archivio',0);genome(v.genome,graph);}
  }
  function deriveSafeLearningFrontier(state){
    // 5.6.0 saves predate a dedicated frontier field. The champion and hall
    // of fame contain only collision-free records, unlike learningFrontier,
    // which may include a faster but crashed rollout.
    const records=[...(state.hallOfFame||[]),...(state.championStats?[state.championStats]:[])];
    const lapTimes=records.map(record=>record.bestLapTime).filter(value=>Number.isFinite(value)&&value>0);
    return {progress:records.reduce((best,record)=>Math.max(best,record.bestProgress||0),0),
      laps:records.reduce((best,record)=>Math.max(best,record.laps||0),0),lapTime:lapTimes.length?Math.min(...lapTimes):null};
  }
  const HISTORY_KEYS=['generation','best','mean','reward','penalty','laps','maxLaps','bestProgress','meanProgress','bestSafeProgress','meanSafeProgress','bestLapTime','noLapCount','slowerLapCount','stagnation','mutationAmount','immigrantCount','hallOfFame','learning','rewardRevision','baseBest','previousBestLapTime','rewardBreakdown'];
  function breakdown(v){
    keys(v,['rewards','penalties'],'Dettaglio punteggio');
    for(const [name,list]of [['rewards',F.Rewards.rewardKeys],['penalties',F.Rewards.penaltyKeys]]){
      keys(v[name],list,'Voci del punteggio');for(const k of list)finite(v[name][k],'Punteggio '+k,0);
    }
  }
  function validateTraining(s,graph,circuits){
    keys(s,['circuitId','circuitRevision','population','mutation','speedMultiplier','generation','elapsedAtSave','seed','rngState','stagnation','learningFrontier','history','bestEver','champion','championStats','hallOfFame','externalChampion','optimizer','genomes','rewardRevision'],'Stato di apprendimento');
    if(!F.Rewards.SUPPORTED_REVISIONS.includes(s.rewardRevision))fail('Sistema di ricompense incompatibile.');
    const circuit=circuits.find(c=>c.id===s.circuitId);if(!circuit||s.circuitRevision!==(circuit.revision||1))fail('Circuito o revisione del circuito incompatibile.');
    integer(s.population,'Popolazione',4,F.MAX_POPULATION);finite(s.mutation,'Mutazione',0,.35);finite(s.speedMultiplier,'Velocità',.5,30);
    integer(s.generation,'Generazione',1);finite(s.elapsedAtSave,'Tempo della prova',0);integer(s.seed,'Seed',0,0xffffffff);
    // Preserve the existing JS RNG counter exactly, including its high bits.
    finite(s.rngState,'Stato casuale',0,1e30);if(!Number.isInteger(s.rngState))fail('Stato casuale non intero.');
    integer(s.stagnation,'Stagnazione');if(!Array.isArray(s.genomes)||s.genomes.length!==s.population)fail('Popolazione salvata incompleta.');s.genomes.forEach(g=>genome(g,graph));
    keys(s.learningFrontier,['progress','laps','lapTime'],'Progresso di apprendimento');finite(s.learningFrontier.progress,'Distanza appresa',0);integer(s.learningFrontier.laps,'Giri appresi',0,2);if(s.learningFrontier.lapTime!==null)finite(s.learningFrontier.lapTime,'Tempo appreso',.001);
    if(s.bestEver!==null)finite(s.bestEver,'Record');
    if(s.champion!==null){genome(s.champion,graph);stats(s.championStats,'Campione',false,graph);if(s.bestEver!==s.championStats.fitness)fail('Record e campione non coerenti.');}
    else if(s.championStats!==null||s.bestEver!==null)fail('Campione salvato incompleto.');
    if(s.externalChampion!==null)genome(s.externalChampion,graph);
    if(!Array.isArray(s.hallOfFame)||s.hallOfFame.length>4)fail('Archivio di apprendimento non valido.');s.hallOfFame.forEach(v=>stats(v,'Archivio',true,graph));
    const p=F.ensureLearning(graph);keys(s.optimizer,['mean','sigma','updates','episodes'],'Ottimizzatore');
    vector(s.optimizer.mean,p.length,'Media appresa',-8,8);vector(s.optimizer.sigma,p.length,'Esplorazione',.000001,10);integer(s.optimizer.updates,'Aggiornamenti');integer(s.optimizer.episodes,'Episodi');
    if(!Array.isArray(s.history)||s.history.length>100)fail('Storico troppo lungo o non valido.');
    let previous=0;
    for(const h of s.history){
      keys(h,HISTORY_KEYS,'Voce storico');integer(h.generation,'Generazione storico',1,s.generation-1);if(h.generation<=previous)fail('Ordine dello storico non valido.');previous=h.generation;
      for(const k of ['best','mean'])finite(h[k],'Storico '+k);
      for(const k of ['reward','penalty','bestProgress','meanProgress'])finite(h[k],'Storico '+k,0);
      const hasBestSafe=Object.hasOwn(h,'bestSafeProgress'),hasMeanSafe=Object.hasOwn(h,'meanSafeProgress');
      if(hasBestSafe!==hasMeanSafe)fail('Progresso sicuro dello storico incompleto.');
      if(hasBestSafe){finite(h.bestSafeProgress,'Miglior progresso sicuro',0);finite(h.meanSafeProgress,'Progresso medio sicuro',0);if(h.bestSafeProgress>h.bestProgress+1e-8)fail('Progresso sicuro superiore al massimo fisico.');}
      if(h.rewardRevision!==s.rewardRevision)fail('Ricompense dello storico incompatibili.');finite(h.baseBest,'Record stabile storico');
      if(h.previousBestLapTime!==null)finite(h.previousBestLapTime,'Riferimento generazione precedente',.001);
      breakdown(h.rewardBreakdown);
      const sum=v=>Object.values(v).reduce((a,b)=>a+b,0),close=(a,b)=>Math.abs(a-b)<1e-7*Math.max(1,Math.abs(a),Math.abs(b));
      if(!close(sum(h.rewardBreakdown.rewards),h.reward)||!close(sum(h.rewardBreakdown.penalties),h.penalty)||!close(h.reward-h.penalty,h.best))fail('Totali del punteggio non coerenti.');
      integer(h.laps,'Giri storico',0,2);if(h.bestLapTime!==null)finite(h.bestLapTime,'Tempo storico',.001);
      integer(h.maxLaps,'Massimo giri storico',h.laps,2);
      for(const k of ['noLapCount','slowerLapCount','immigrantCount'])integer(h[k],'Storico '+k,0,s.population);
      integer(h.stagnation,'Stagnazione storico');finite(h.mutationAmount,'Mutazione storico',0,.35);integer(h.hallOfFame,'Archivio storico',0,4);
      keys(h.learning,['algorithm','version','updates','episodes','parameters','meanExploration','warmStart'],'Metriche storico');
      if(h.learning.algorithm!=='diagonal evolution strategy'||h.learning.version!==p.version||h.learning.parameters!==p.length||h.learning.warmStart!==false)fail('Metriche di apprendimento incompatibili.');
      integer(h.learning.updates,'Aggiornamenti storico');integer(h.learning.episodes,'Episodi storico');finite(h.learning.meanExploration,'Esplorazione storico',0,10);
    }
    return s;
  }
  function capture(sim){
    if(sim.mode!=='connectome'||!sim.optimizer)fail('Salva i progressi nella modalità di apprendimento, non durante un test motore.');
    const state={rewardRevision:sim.rewardRevision,circuitId:sim.circuitId,circuitRevision:sim.circuit.revision||1,population:sim.population,mutation:sim.mutation,speedMultiplier:sim.speedMultiplier,
      generation:sim.generation,elapsedAtSave:sim.elapsed,seed:sim.seed,rngState:sim.random.getState(),stagnation:sim.stagnation,learningFrontier:copy(sim.learningFrontier),history:copy(sim.history),
      bestEver:Number.isFinite(sim.bestEver)?sim.bestEver:null,champion:sim.champion?F.cloneGenome(sim.champion):null,championStats:sim.championStats?copy(sim.championStats):null,
      hallOfFame:copy(sim.hallOfFame),externalChampion:sim.externalChampion?F.cloneGenome(sim.externalChampion):null,
      optimizer:{mean:sim.optimizer.mean.slice(),sigma:sim.optimizer.sigma.slice(),updates:sim.optimizer.updates,episodes:sim.optimizer.episodes},genomes:sim.cars.map(c=>F.cloneGenome(c.genome))};
    validateTraining(state,sim.graph,sim.circuits);return state;
  }
  function restore(sim,state){
    validateTraining(state,sim.graph,sim.circuits);const s=copy(state);
    sim.configureCircuit(s.circuitId);sim.rewardRevision=s.rewardRevision;sim.population=s.population;sim.mutation=s.mutation;sim.speedMultiplier=s.speedMultiplier;sim.mode='connectome';sim.running=false;
    sim.seed=s.seed;sim.random=F.rng(s.rngState);sim.generation=s.generation;sim.stagnation=s.stagnation;sim.history=s.history;
    sim.learningFrontier=s.learningFrontier;
    // Keep the exact current-version file schema. Older/newer-version files rebuild
    // the safe frontier from safe-only archive statistics, never raw progress.
    sim.safeLearningFrontier=deriveSafeLearningFrontier(s);
    sim.bestEver=s.bestEver===null?-Infinity:s.bestEver;sim.champion=s.champion;sim.championStats=s.championStats;
    if(sim.championStats&&sim.championStats.bestLapTime===null)sim.championStats.bestLapTime=Infinity;
    sim.hallOfFame=s.hallOfFame;for(const entry of sim.hallOfFame)if(entry.bestLapTime===null)entry.bestLapTime=Infinity;
    // Any pending shared champion is reconstructed from the desktop-level
    // global champion when the restored session resumes, not serialized here.
    sim.externalChampion=s.externalChampion;sim.pendingExternalChampion=null;sim.optimizer=new Learning.EvolutionStrategy(sim.graph);
    // A save omits transient ES sample IDs. An empty lineage uses the safe
    // compatibility ranking for this resumed generation; offspring then get
    // fresh sample IDs on the next natural spawn.
    Object.assign(sim.optimizer,s.optimizer);sim.spawn(s.genomes,false,[]);sim.accumulator=0;return sim;
  }
  function validatePayload(p,{graph,circuits,maxWorkers=MAX_WORKERS}){
    keys(p,['modelId','circuitId','graph','vehicleRevision','workers','globalChampion'],'Contenuto del file');
    if(!['v2','v3','v4','v5'].includes(p.modelId)||p.modelId!==graph.modelId)fail('Modello neurale incompatibile.');
    if(p.vehicleRevision!==F.Vehicle.REVISION||JSON.stringify(p.graph)!==JSON.stringify(compatibleGraph(graph)))fail('Dati neurali o fisica incompatibili.');
    if(!Array.isArray(p.workers)||!p.workers.length||p.workers.length>maxWorkers)fail('Numero di worker non supportato.');
    for(const [index,w]of p.workers.entries()){
      keys(w,['index','state'],'Worker');if(w.index!==index)fail('Ordine dei worker non valido.');validateTraining(w.state,graph,circuits);
      const first=p.workers[0].state;if(w.state.circuitId!==p.circuitId||['population','mutation','speedMultiplier'].some(k=>w.state[k]!==first[k]))fail('Impostazioni dei worker non coerenti.');
    }
    if(p.globalChampion!==null){
      keys(p.globalChampion,['genome','stats','workerIndex'],'Campione globale');genome(p.globalChampion.genome,graph);stats(p.globalChampion.stats,'Record globale',false,graph);integer(p.globalChampion.workerIndex,'Worker del record',0,p.workers.length-1);
    }
    return p;
  }
  async function digest(value){
    const text=JSON.stringify(value);
    if(nodeCrypto)return nodeCrypto.createHash('sha256').update(text,'utf8').digest('hex');
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  }
  async function encode(payload,version){
    const body={format:FORMAT,schema:SCHEMA,appVersion:version,savedAt:new Date().toISOString(),payload};
    const file={...body,checksum:{algorithm:'SHA-256',value:await digest(body)}},text=JSON.stringify(file,null,2);
    if(bytes(text)>MAX_BYTES)fail('Salvataggio oltre il limite di 16 MiB.');return text;
  }
  async function decode(text,version){
    if(typeof text!=='string'||bytes(text)>MAX_BYTES)fail('File troppo grande: massimo 16 MiB.');
    let file;try{file=JSON.parse(text);}catch{fail('File di salvataggio non leggibile.');}
    keys(file,['format','schema','appVersion','savedAt','payload','checksum'],'File');
    if(file.format!==FORMAT||file.schema!==SCHEMA)fail('Formato di salvataggio non riconosciuto.');
    if(file.appVersion!==version)fail('Salvataggio della versione '+String(file.appVersion).slice(0,40)+': richiede esattamente quella versione. Questa app è '+version+'.');
    if(typeof file.savedAt!=='string'||file.savedAt.length>40||!Number.isFinite(Date.parse(file.savedAt)))fail('Data del salvataggio non valida.');
    keys(file.checksum,['algorithm','value'],'Checksum');if(file.checksum.algorithm!=='SHA-256'||typeof file.checksum.value!=='string'||!/^[0-9a-f]{64}$/.test(file.checksum.value))fail('Controllo di integrità non valido.');
    const {format,schema,appVersion,savedAt,payload}=file;let actual;
    try{actual=await digest({format,schema,appVersion,savedAt,payload});}catch{fail('Struttura del file non valida.');}
    if(actual!==file.checksum.value)fail('File danneggiato o modificato: checksum SHA-256 non corrispondente.');return file;
  }
  function fromSimulation(sim){
    const state=capture(sim);return {modelId:sim.modelId,circuitId:sim.circuitId,graph:compatibleGraph(sim.graph),vehicleRevision:F.Vehicle.REVISION,workers:[{index:0,state}],globalChampion:null};
  }
  function filename(p,version){return 'Circuit-Lab-'+version+'-'+p.modelId+'-'+p.circuitId+'-gen'+p.workers[0].state.generation+'.'+EXTENSION;}
  return Object.freeze({FORMAT,SCHEMA,EXTENSION,MAX_BYTES,MAX_WORKERS,compatibleGraph,validateTraining,capture,restore,validatePayload,encode,decode,fromSimulation,filename});
});
