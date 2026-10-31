'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function run(mainWindow,{output,engine,version,expectedGenerations=3,wide=false}){
  await fs.mkdir(output,{recursive:true});
  const wc=mainWindow.webContents,errors=[];
  wc.on('console-message',details=>{if(details.level===3||details.level==='error')errors.push(String(details.message));});
  const startup=await wc.executeJavaScript(`(async()=>{
    const deadline=Date.now()+90000;
    while(!window.circuitLab&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!window.circuitLab)throw Error('Circuit Lab startup timed out');
    const {sim,version,modelId,trainingCopy,trainingCopyProgressLoaded,trainingCopyProgressGeneration}=window.circuitLab;
    return {version,modelId,trainingCopy,trainingCopyProgressLoaded,trainingCopyProgressGeneration,generation:sim.generation,
      circuitId:sim.circuitId,population:sim.population,agents:sim.cars.length,running:sim.running,historyLength:sim.history.length,
      policyVersion:sim.graph.learning.version,decoderProfile:sim.graph.learning.decoderProfile,sensorProfile:sim.graph.sensorProfile,footprintSensorsEnabled:sim.cars[0]?.footprintSensorsEnabled,parameters:sim.graph.learning.length,
      readouts:sim.graph.learning.nodes.length,pixelsPerMeter:sim.track.pixelsPerMeter};
  })()`,true);
  const expectedDecoder=wide?6:3;
  if(startup.version!==version||version!=='5.7.0'||startup.modelId!=='v3'||startup.trainingCopy!==true||!startup.trainingCopyProgressLoaded||
      startup.circuitId!=='monza'||startup.population!==16||startup.agents!==16||startup.running!==false||startup.historyLength!==0||
      startup.generation!==startup.trainingCopyProgressGeneration||startup.policyVersion!==expectedDecoder||startup.sensorProfile!=='v3-centerline-legacy-v1'||startup.footprintSensorsEnabled!==false)throw Error('Training copy startup state did not match the paired checkpoint and legacy sensor profile: '+JSON.stringify(startup));

  const initial=await engine.exportProgress(),initialState=initial.workers[0].state,startGeneration=initialState.generation;
  if(initialState.population!==16||initialState.history.length!==0||initial.modelId!=='v3'||initial.circuitId!=='monza')throw Error('Imported checkpoint is not the expected 16-agent V3/Monza state.');
  const started=Date.now(),deadline=started+300000;
  await wc.executeJavaScript('circuitLab.sim.speedMultiplier=30;circuitLab.sim.running=true;',true);
  while(Date.now()<deadline){
    const current=engine.states?.[0]?.generation??startup.generation;
    if(current>=startGeneration+expectedGenerations)break;
    await wait(100);
  }
  await wc.executeJavaScript('circuitLab.sim.running=false;',true);
  await engine.command({type:'pause',value:false});
  await wait(300);
  const elapsedSeconds=(Date.now()-started)/1000;
  const payload=await engine.exportProgress(),state=payload.workers[0].state,history=state.history.filter(item=>item.generation>=startGeneration).slice(-expectedGenerations);
  const ppm=startup.pixelsPerMeter||1;
  const caseReport={version,modelId:'v3',circuitId:'monza',sensorProfile:startup.sensorProfile,footprintSensorsEnabled:startup.footprintSensorsEnabled,decoderProfile:wide?'v3-wide-readout-128-v1':'v3-standard-64',
    policyVersion:state.optimizer.mean.length===330?6:3,parameters:state.optimizer.mean.length,readouts:wide?128:64,
    seed:state.seed,population:state.population,startGeneration,endGeneration:state.generation,requestedGenerations:expectedGenerations,
    completedGenerations:Math.max(0,state.generation-startGeneration),historyRecordedGenerations:history.length,
    unrecordedGenerationTransitions:Math.max(0,state.generation-startGeneration-history.length),censored:state.generation-startGeneration<expectedGenerations,elapsedSeconds,
    backend:engine.gpu?.state||'not-reported',history:history.map(item=>({generation:item.generation,laps:item.laps,maxLaps:item.maxLaps,
      bestProgressMeters:(item.bestProgress||0)/ppm,bestSafeProgressMeters:(item.bestSafeProgress??item.bestProgress??0)/ppm,
      meanProgressMeters:(item.meanProgress||0)/ppm,bestLapTime:item.bestLapTime,learningUpdates:item.learning?.updates??null})),
    maxSafeProgressMeters:Math.max(0,...history.map(item=>(item.bestSafeProgress??item.bestProgress??0)/ppm)),
    maxLaps:Math.max(0,...history.map(item=>item.maxLaps??item.laps??0)),
    optimizerUpdates:state.optimizer.updates,optimizerEpisodes:state.optimizer.episodes,errors};
  caseReport.passed=caseReport.completedGenerations===expectedGenerations&&caseReport.endGeneration>=startGeneration+expectedGenerations&&!errors.length;
  await fs.writeFile(path.join(output,'learning-case.json'),JSON.stringify(caseReport,null,2));
  console.log('TRAINING_COPY_LEARNING '+JSON.stringify(caseReport));
  return caseReport;
}

module.exports={run};
