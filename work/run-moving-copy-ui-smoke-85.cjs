'use strict';
// Source Electron app, isolated temporary profile and injected test picker.
// The real saved file is read only; the harness checks it is byte-identical.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/saved-v3-moving-pace-ui-smoke-compatibility-20261027-85');
const fixture=path.join(root,'.impeccable/review/learning-ml/saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
if(fs.existsSync(out)||!fs.existsSync(fixture))throw Error('New output and verified experimental fixture required');
fs.mkdirSync(out);
const profile=path.join(root,'.impeccable/review/learning-ml/moving-pace-test-tmp-20261026-83','ui-'+crypto.randomUUID());
const exe=path.join(root,'node_modules/electron/dist/electron.exe'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(exe,[root,'--male-cns-training-copy-v3','--progress-smoke',
  '--progress-output-dir='+out,'--moving-copy-fixture='+fixture,'--user-data-dir='+profile],
  {cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(fs.createWriteStream(path.join(out,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'stderr.log')));
child.stdout.on('data',data=>process.stdout.write(data));
const timer=setTimeout(()=>{console.error('Only this isolated UI smoke exceeded 300 seconds');child.kill();},300000);
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
child.on('exit',code=>{clearTimeout(timer);console.log(JSON.stringify({exitCode:code,output:out}));process.exitCode=code===0?0:1;});
