'use strict';
// Verify the actual development Electron UI with the gen92 experimental copy.
// Reuse a designated disposable smoke profile; never use the normal profile.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const out=path.join(base,'progress7-continuation-copy-ui-smoke-20261027-103');
const fixture=path.join(base,'progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const profile=path.join(base,'moving-pace-test-tmp-20261026-83/ui-0a17fc7d-70fe-4f9f-89a7-8719c60cab89');
const expected='47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d';
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
    console.log('CONTINUATION_COPY_UI_SMOKE '+JSON.stringify({passed:true,checks:result.checks.length,report,reportSha256:sha(report),
      saveSha256:expected,reusedDisposableProfile:true,boundary:'Native development UI import and round-trip, not lap convergence or packaged-release compatibility.'}));
  }catch(e){console.error('CONTINUATION_COPY_UI_SMOKE_FAILED '+(e.stack||e));process.exitCode=1;}
});
