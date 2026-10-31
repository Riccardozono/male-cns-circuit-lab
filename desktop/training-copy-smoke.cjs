'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run(mainWindow,{output,version,expectMigrated=false,wide=true,sensorMode='legacy'}){
  await fs.mkdir(output,{recursive:true});
  const snapshot=await mainWindow.webContents.executeJavaScript(`(async()=>{
    const deadline=Date.now()+90000;
    while(!window.circuitLab&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!window.circuitLab)throw Error('Circuit Lab startup timed out');
    const {sim,version,modelId,trainingCopy,trainingCopyProgressLoaded,trainingCopyProgressGeneration}=window.circuitLab;
    return {version,modelId,trainingCopy,trainingCopyProgressLoaded,trainingCopyProgressGeneration,circuitId:sim.circuitId,population:sim.population,agents:sim.cars.length,running:sim.running,
      generation:sim.generation,historyLength:sim.history.length,sensorProfile:sim.graph.sensorProfile,footprintSensorsEnabled:sim.cars[0]?.footprintSensorsEnabled,decoderVersion:sim.graph.learning.version,decoderProfile:sim.graph.learning.decoderProfile,
      parameters:sim.graph.learning.length,readouts:sim.graph.learning.nodes.length,
      selectedModel:document.getElementById('controller-select').value,populationControl:document.getElementById('population-range').value,
      modeNote:document.getElementById('mode-note').textContent,title:document.title};
  })()`,true);
  const expectedDecoder=wide?6:3,expectedParameters=wide?330:202,expectedReadouts=wide?128:64;
  const checks=[
    ['App version is 5.7.0',snapshot.version===version&&version==='5.7.0'],
    ['Isolated training profile selects V3',snapshot.trainingCopy===true&&snapshot.modelId==='v3'&&snapshot.selectedModel==='v3'],
    ['Training copy defaults to Monza',snapshot.circuitId==='monza'],
    ['Training copy starts with 16 agents',snapshot.population===16&&snapshot.agents===16&&snapshot.populationControl==='16'],
    ['Training copy uses the selected V3 readout',snapshot.decoderVersion===expectedDecoder&&(wide?snapshot.decoderProfile==='v3-wide-readout-128-v1':snapshot.decoderProfile==null)&&snapshot.parameters===expectedParameters&&snapshot.readouts===expectedReadouts],
    ['Sensor mode matches the selected isolated profile',sensorMode==='legacy'?snapshot.sensorProfile==='v3-centerline-legacy-v1'&&snapshot.footprintSensorsEnabled===false:snapshot.sensorProfile==='v3-footprint-current-v57-v1'&&snapshot.footprintSensorsEnabled===true],
    ['UI labels the active sensor profile',snapshot.modeNote.includes(sensorMode==='legacy'?'Sensori centrolinea legacy':'Sensori collision-aware del profilo V3 5.7.0')],
    ['Training copy opens paused',snapshot.running===false],
    ...(expectMigrated?[
      ['Migrated save is loaded at its saved generation',snapshot.trainingCopyProgressLoaded===true&&snapshot.trainingCopyProgressGeneration===67&&snapshot.generation===67],
      ['Migration keeps 16 cars and resets only history',snapshot.population===16&&snapshot.historyLength===0],
      ['UI identifies the imported experimental save',snapshot.modeNote.includes('salvataggio importato')]
    ]:[['UI identifies the fresh isolated session',snapshot.trainingCopyProgressLoaded===false&&snapshot.modeNote.includes('nessun salvataggio importato')]])
  ];
  const report={passed:checks.every(([,passed])=>passed),format:'male-cns-training-copy-startup-smoke-v3',version,snapshot,
    checks:checks.map(([name,passed])=>({name,passed})),boundary:expectMigrated?'Windows app startup and restore of the separately converted V3/Monza copy; source save remains outside this build and unchanged.':'Fresh isolated profile startup only; does not load or alter the users original V3 generation-64 save.'};
  await fs.writeFile(path.join(output,'training-copy-smoke.json'),JSON.stringify(report,null,2));
  if(!report.passed)throw Error(JSON.stringify(report));
  console.log(JSON.stringify(report));return report;
}
module.exports={run};
