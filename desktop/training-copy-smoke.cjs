'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run(mainWindow,{output,version}){
  await fs.mkdir(output,{recursive:true});
  const snapshot=await mainWindow.webContents.executeJavaScript(`(async()=>{
    const deadline=Date.now()+90000;
    while(!window.circuitLab&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!window.circuitLab)throw Error('Circuit Lab startup timed out');
    const {sim,version,modelId,trainingCopy}=window.circuitLab;
    return {version,modelId,trainingCopy,circuitId:sim.circuitId,population:sim.population,agents:sim.cars.length,running:sim.running,
      selectedModel:document.getElementById('controller-select').value,populationControl:document.getElementById('population-range').value,
      modeNote:document.getElementById('mode-note').textContent,title:document.title};
  })()`,true);
  const checks=[
    ['App version is 5.7.0',snapshot.version===version&&version==='5.7.0'],
    ['Isolated training profile selects V3',snapshot.trainingCopy===true&&snapshot.modelId==='v3'&&snapshot.selectedModel==='v3'],
    ['Training copy defaults to Monza',snapshot.circuitId==='monza'],
    ['Training copy starts with 16 agents',snapshot.population===16&&snapshot.agents===16&&snapshot.populationControl==='16'],
    ['Training copy opens paused',snapshot.running===false],
    ['UI identifies the fresh isolated session',snapshot.modeNote.includes('nessun salvataggio importato')]
  ];
  const report={passed:checks.every(([,passed])=>passed),format:'male-cns-training-copy-startup-smoke-v1',version,snapshot,
    checks:checks.map(([name,passed])=>({name,passed})),boundary:'Fresh isolated profile startup only; does not load or alter the users original V3 generation-64 save.'};
  await fs.writeFile(path.join(output,'training-copy-smoke.json'),JSON.stringify(report,null,2));
  if(!report.passed)throw Error(JSON.stringify(report));
  console.log(JSON.stringify(report));return report;
}
module.exports={run};
