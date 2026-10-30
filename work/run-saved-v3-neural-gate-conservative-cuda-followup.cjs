'use strict';
// Fresh, separately tagged CUDA verification of the user-approved saved-V3
// radial brake-onset diagnostic. Preserves the earlier report and all saves.
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const tag='saved-v3-neural-gate-conservative-cuda-user-approved-20261023-02';
const reportDir=path.join(root,'.impeccable/review/learning-ml',tag);
if(fs.existsSync(reportDir))throw new Error(`Refusing to overwrite ${reportDir}`);
process.env.MALECNS_V3_GATE_TAG=tag;
process.env.MALECNS_V3_GATE_DELTAS='.05,.10';
process.env.MALECNS_V3_GATE_STEERING_DELTAS='-.04,0,.04';

const Dense=require(path.join(root,'outputs/dense-neural.js'));
const Cuda=require('./cuda-exact-v3-runtime.cjs');
const originalStep=Dense.step;
Dense.step=(...args)=>Cuda.pass(...args);
process.once('beforeExit',()=>{
  const stats=Cuda.stats();
  Dense.step=originalStep;
  Cuda.close();
  console.log('V3_NEURAL_GATE_CONSERVATIVE_CUDA_STATS '+JSON.stringify(stats));
  const reportPath=path.join(reportDir,'report.json');
  if(fs.existsSync(reportPath)){
    const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
    report.cudaVerification={...stats,verifiedGpuOnly:stats.gpuCalls>0&&stats.cpuFallbacks===0,
      runner:'CUDA exact V3 neural pass; CPU simulation physics'};
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8'});
  }
  if(stats.gpuCalls===0||stats.cpuFallbacks!==0)process.exitCode=1;
});

const benchmarkPath=path.join(__dirname,'benchmark-saved-v3-brake-onset-rbf.cjs');
let source=fs.readFileSync(benchmarkPath,'utf8');
function replaceExactlyOnce(oldText,newText,label){
  if(!source.includes(oldText)||source.indexOf(oldText)!==source.lastIndexOf(oldText))
    throw new Error(`Expected exactly one ${label} in the protected benchmark`);
  source=source.replace(oldText,newText);
}
replaceExactlyOnce(
  "'.impeccable/review/learning-ml/saved-v3-current-telemetry-40x3-20261022-01/report.json'",
  "'.impeccable/review/learning-ml/saved-v3-pop100-savedrng-10gen-20261023-01/report.json'",
  'current-source reference path');
replaceExactlyOnce(
  'control.settings?.traceOnly!==true',
  'control.sourceHashes?.unchanged!==true',
  'reference integrity guard');
replaceExactlyOnce(
  "const record=control.treatment.records.find(row=>row.generation===64),leader=record?.safeProgressLeader,id=Number(leader?.id),\n      source=descriptor.cars.find(car=>car.id===id);\n    if(!source||!source.footprintSensorsEnabled||!leader.trace?.length)throw Error('Exact saved leader telemetry is missing');",
  "const row=control.control.perGeneration.find(entry=>entry.generation===64),leader=row?.leader,id=Number(leader?.id),\n      source=descriptor.cars.find(car=>car.id===id);\n    if(!source||!leader?.safe)throw Error('Exact saved leader summary is missing');",
  'current-source saved leader selection');
replaceExactlyOnce(
  'if(sourceHashes.simulation!==control.sourceHashes.simulation||sourceHashes.learning!==control.sourceHashes.learning)',
  "if(sourceHashes.simulation!==control.sourceHashes.before?.['simulation.js']||sourceHashes.learning!==control.sourceHashes.before?.['neural-learning.js'])",
  'current-source hash guard');

const compiled=new Module(benchmarkPath,module);
compiled.filename=benchmarkPath;
compiled.paths=Module._nodeModulePaths(path.dirname(benchmarkPath));
compiled._compile(source,benchmarkPath);
