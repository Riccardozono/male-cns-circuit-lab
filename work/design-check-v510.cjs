'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','verification-v510'),launcher='C:\\Users\\utente\\.agents\\skills\\impeccable\\scripts\\impeccable.cmd';
const result=spawnSync('powershell.exe',['-NoProfile','-Command',`& '${launcher}' detect --json outputs/index.html outputs/styles.css`],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'design-detector.json'),result.stdout);fs.writeFileSync(path.join(out,'design-detector-stderr.log'),result.stderr);
console.log('Detector exit '+result.status);if(result.stdout){const data=JSON.parse(result.stdout);console.log(JSON.stringify(data,null,2));}if(result.error)throw result.error;
