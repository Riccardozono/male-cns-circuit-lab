'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),script=path.join(__dirname,'context-numeric-probe.cjs');
function run(exe,host,env){return new Promise((resolve,reject)=>{const child=spawn(exe,[script,'--host='+host],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let error='';child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>{error+=b;});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(error||'Exit '+code)));});}
(async()=>{
  await run(process.execPath,'node24',process.env);await run(path.join(root,'node_modules/electron/dist/electron.exe'),'electron-node',{...process.env,ELECTRON_RUN_AS_NODE:'1'});
  const dir=path.join(root,'.impeccable/review/neural-sacl/runtime-numeric-audit'),a=JSON.parse(fs.readFileSync(path.join(dir,'node24.json'))),b=JSON.parse(fs.readFileSync(path.join(dir,'electron-node.json')));
  const first=a.rows.findIndex((r,i)=>JSON.stringify(r)!==JSON.stringify(b.rows[i]));
  const report={nodeVersion:a.nodeVersion,electronNodeVersion:b.nodeVersion,electronVersion:b.electronVersion,firstDivergentRow:first,
    firstDifference:first<0?null:{node:a.rows[first],electron:b.rows[first]},nodeResult:a.result,electronResult:b.result,
    boundary:'Same exported neural model and same physical functions, no UI or telemetry calls. Differences here locate runtime numerical divergence rather than renderer effects.'};
  fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(report,null,2));console.log('RUNTIME_NUMERIC_AUDIT '+JSON.stringify(report));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
