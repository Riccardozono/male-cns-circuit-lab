'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const copyRoot=path.resolve(process.argv[2]||'');
const reportRoot=path.resolve(process.argv[3]||path.join(root,'.impeccable','review','learning-ml','progress143-v3-wide-readout-gen67-hof-legacy-sensors-ab-20261031'));
const app=path.join(copyRoot,'app','win-unpacked','MAL-E CNS Circuit Lab.exe');
const cases=[
  {id:'baseline',flag:'--male-cns-training-copy-v3-baseline',save:'Circuit-Lab-5.7.0-v3-monza-control-gen67-hof-legacy-sensors.malecns-save'},
  {id:'wide',flag:'--male-cns-training-copy-v3',save:'Circuit-Lab-5.7.0-v3-monza-wide-readout-gen67-hof-legacy-sensors.malecns-save'}
];

async function launch(item){
  const output=path.join(reportRoot,item.id),profile=path.join(reportRoot,'profile-'+item.id),save=path.join(copyRoot,item.save);
  await fs.mkdir(output,{recursive:true});
  if(!await fs.stat(save).catch(()=>null))throw Error('Missing paired training save: '+save);
  return new Promise((resolve,reject)=>{
  const child=spawn(app,[item.flag,'--training-copy-progress='+save,'--training-copy-learning-smoke','--training-copy-learning-output-dir='+output,'--user-data-dir='+profile],
    {cwd:copyRoot,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const stdout=[],stderr=[];child.stdout.on('data',chunk=>stdout.push(chunk));child.stderr.on('data',chunk=>stderr.push(chunk));
  const timeout=setTimeout(()=>child.kill(),330000);
  child.once('error',error=>{clearTimeout(timeout);reject(error);});
  child.once('close',async code=>{
    clearTimeout(timeout);
    await fs.writeFile(path.join(output,'stdout.log'),Buffer.concat(stdout));
    await fs.writeFile(path.join(output,'stderr.log'),Buffer.concat(stderr));
    let result=null;try{result=JSON.parse(await fs.readFile(path.join(output,'learning-case.json'),'utf8'));}catch{}
    if(code!==0||!result?.passed)reject(Error(item.id+' case failed (exit '+code+'): '+Buffer.concat(stderr).toString('utf8').slice(-2000)));
    else resolve(result);
  });
});}

async function main(){
  if(!copyRoot||!await fs.stat(app).catch(()=>null))throw Error('Windows training copy missing: '+app);
  await fs.mkdir(reportRoot,{recursive:true});
  const migration=[];
  for(const item of cases){
    const save=path.join(copyRoot,item.save),receipt=JSON.parse(await fs.readFile(save+'.migration.json','utf8'));
    migration.push({id:item.id,sourceSha256:receipt.sourceSha256,sourceGeneration:receipt.sourceGeneration,targetGeneration:receipt.targetGeneration,targetPopulation:receipt.targetPopulation,sensorProfile:receipt.sensorProfile,footprintSensorsEnabled:receipt.footprintSensorsEnabled});
  }
  if(migration[0].sourceSha256!==migration[1].sourceSha256||migration.some(item=>item.sourceGeneration!==67||item.targetGeneration!==67||item.targetPopulation!==16||item.sensorProfile!=='v3-centerline-legacy-v1'||item.footprintSensorsEnabled!==false))throw Error('Control and treatment do not share the approved checkpoint and legacy sensor profile.');
  const results=[];
  for(const item of cases){console.log('Starting '+item.id+' replay');results.push(await launch(item));}
  const byId=Object.fromEntries(results.map(result=>[result.decoderProfile==='v3-wide-readout-128-v1'?'wide':'baseline',result]));
  const report={format:'male-cns-v3-wide-readout-three-generation-ab-legacy-sensors-v1',sourceSha256:migration[0].sourceSha256,sourceGeneration:67,sensorProfile:migration[0].sensorProfile,footprintSensorsEnabled:false,
    settings:{version:'5.7.0',circuit:'monza',seed:results[0].seed,population:16,speedMultiplier:30,generations:3,sequential:true},
    cases:results,comparison:{baselineMaxSafeProgressMeters:byId.baseline.maxSafeProgressMeters,wideMaxSafeProgressMeters:byId.wide.maxSafeProgressMeters,
      baselineLaps:byId.baseline.maxLaps,wideLaps:byId.wide.maxLaps,
      wideProgressDeltaMeters:byId.wide.maxSafeProgressMeters-byId.baseline.maxSafeProgressMeters,
      wideBeatBaseline:byId.wide.maxSafeProgressMeters>byId.baseline.maxSafeProgressMeters&&byId.wide.maxLaps>=byId.baseline.maxLaps},
    boundary:'Three natural generations from the same saved V3/Monza worker checkpoint and seed, with both arms using legacy centerline sensors from 5.6.0; this short A/B is preliminary and does not establish durable learning or circuit-wide convergence. V3 reduced graph runs on CPU; this case does not exercise CUDA.',
    passed:results.every(result=>result.passed)};
  await fs.writeFile(path.join(reportRoot,'ab-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({report:reportRoot,comparison:report.comparison,passed:report.passed},null,2));
  if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
