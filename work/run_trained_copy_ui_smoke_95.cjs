'use strict';
// Actual source Electron UI and picker/restore flow, using an existing
// disposable smoke profile. Does not access a user's ordinary app profile.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const outputName=process.env.MALECNS_UI_SMOKE_OUTPUT_NAME||'progress7-trained-copy-ui-smoke-20261027-95';
if(!/^[a-z0-9-]+$/.test(outputName))throw Error('A simple smoke output name is required');
const out=path.join(base,outputName);
const fixture=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const profile=path.join(base,'moving-pace-test-tmp-20261026-83/ui-0a17fc7d-70fe-4f9f-89a7-8719c60cab89');
const expected='616f3040487aed072e09cb1961e3b9c135925156ad199d9b44609ec89eba5fbb';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(fs.existsSync(out)||sha(fixture)!==expected||!fs.statSync(profile).isDirectory()||fs.lstatSync(profile).isSymbolicLink())
  throw Error('Fresh output, exact save and existing disposable non-symlink profile required');
const actual=fs.realpathSync(profile),expectedRoot=fs.realpathSync(path.join(base,'moving-pace-test-tmp-20261026-83'));
if(!actual.startsWith(expectedRoot+path.sep))throw Error('Smoke profile escaped the known test folder');
fs.mkdirSync(out,{recursive:false});
const exe=path.join(root,'node_modules/electron/dist/electron.exe'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(exe,[root,'--male-cns-training-copy-v3','--progress-smoke','--progress-output-dir='+out,
  '--moving-copy-fixture='+fixture,'--user-data-dir='+actual],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(fs.createWriteStream(path.join(out,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'stderr.log')));
child.stdout.on('data',data=>process.stdout.write(data));
const timer=setTimeout(()=>{console.error('Only the isolated UI smoke exceeded 300 seconds');child.kill();},300000);
child.on('error',e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});
child.on('exit',code=>{
  clearTimeout(timer);
  try{
    if(code!==0||sha(fixture)!==expected)throw Error('Smoke exit or save integrity failed');
    const report=path.join(out,'progress-smoke.json'),result=JSON.parse(fs.readFileSync(report,'utf8'));
    if(!result.passed||result.movingCopy?.sha256!==expected||!result.checks.every(c=>c.passed))throw Error('UI checks failed');
    console.log('TRAINED_COPY_UI_SMOKE '+JSON.stringify({passed:true,checks:result.checks.length,report,reportSha256:sha(report),
      saveSha256:expected,reusedDisposableProfile:true,boundary:'Native UI import and round-trip; does not prove lap convergence or packaged-release compatibility.'}));
  }catch(e){console.error('TRAINED_COPY_UI_SMOKE_FAILED '+(e.stack||e));process.exitCode=1;}
});
