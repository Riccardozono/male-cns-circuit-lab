'use strict';
// Exercise the same source app and isolated V3/Monza bootstrap as the launcher,
// with a separate disposable profile and a hidden diagnostic window.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.impeccable/review/learning-ml/moving-pace-training-startup-smoke-20261026-83');
if(fs.existsSync(out))throw Error('Refuse to overwrite an existing diagnostic');fs.mkdirSync(out);
const profile=path.join(root,'.impeccable/review/learning-ml/moving-pace-test-tmp-20261026-83','startup-'+crypto.randomUUID());
const exe=path.join(root,'node_modules/electron/dist/electron.exe'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(exe,[root,'--male-cns-training-copy-v3','--training-copy-smoke','--training-copy-output-dir='+out,
  '--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(fs.createWriteStream(path.join(out,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'stderr.log')));
child.stdout.on('data',data=>process.stdout.write(data));
const timer=setTimeout(()=>{console.error('Only this disposable startup smoke exceeded 120 seconds');child.kill();},120000);
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
child.on('exit',code=>{clearTimeout(timer);console.log(JSON.stringify({exitCode:code,output:out}));process.exitCode=code===0?0:1;});
