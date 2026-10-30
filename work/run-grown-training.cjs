'use strict';
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const profile=path.join(root,'.impeccable/grown-training-smoke-'+Date.now());fs.mkdirSync(profile,{recursive:true});
const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[path.join(__dirname,'neural-grown-main.cjs'),'--smoke','--show','--user-data-dir='+profile,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{console.log('NATIVE_TRAINING_EXIT '+code);process.exitCode=code===0?0:1;});
