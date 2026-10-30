'use strict';
// Child wrapper for a diagnostic CMA run with post-lap actuator lag.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const config=JSON.parse(process.argv[2]);
if(!Number.isFinite(config.actuatorTau)||![.15,.3].includes(config.actuatorTau))throw Error('Approved diagnostic actuator tau required');
const liveFile=path.join(__dirname,'neural-command-live-cuda.cjs'),source=fs.readFileSync(liveFile,'utf8');
function replaceOne(text,needle,value,label){if(text.split(needle).length!==2)throw Error('Refusing unexpected live adapter at '+label);return text.replace(needle,value);}
let patched=source;
patched=replaceOne(patched,"const runtime=D.wrap(F,require('./cuda-exact-v3-runtime.cjs').pass),Legacy=require('../outputs/legacy-models.js');",
  "const runtime=D.wrap(F,require('./cuda-exact-v3-runtime.cjs').pass),Legacy=require('../outputs/legacy-models.js');const POSTLAP_ACTUATOR_TAU="+config.actuatorTau+";",'runtime declaration');
patched=replaceOne(patched,'let car,ticks,history,baseline,authority;','let car,ticks,history,baseline,authority,actuator=[0,0,0],actuatorReady=false;','per-agent state');
patched=replaceOne(patched,'ticks=0;history=[];baseline=[0,0,0];authority=0;if(onReset)',
  'ticks=0;history=[];baseline=[0,0,0];authority=0;actuator=[0,0,0];actuatorReady=false;if(onReset)','episode reset');
patched=replaceOne(patched,'car.outputs=commands;for(let i=0;i<L.CONTROL_INTERVAL&&car.alive;i++){runtime.drive(track,car,commands,runtime.DT);ticks++;}',
  "if(POSTLAP_ACTUATOR_TAU>0&&car.laps>=1){if(!actuatorReady){actuator=car.outputs.slice();actuatorReady=true;}const alpha=1-Math.exp(-(L.CONTROL_INTERVAL*runtime.DT)/POSTLAP_ACTUATOR_TAU),raw=commands.map((v,j)=>actuator[j]+alpha*(v-actuator[j]));let throttle=Math.max(0,Math.min(1,raw[1])),brake=Math.max(0,Math.min(1,raw[2]));if(brake>=throttle){brake-=throttle;throttle=0;}else{throttle-=brake;brake=0;}commands=[Math.max(-1,Math.min(1,raw[0])),throttle,brake];actuator=commands.slice();}car.outputs=commands;for(let i=0;i<L.CONTROL_INTERVAL&&car.alive;i++){runtime.drive(track,car,commands,runtime.DT);ticks++;}",'post-lap actuator');
const compiled=new Module(liveFile,module);compiled.filename=liveFile;compiled.paths=Module._nodeModulePaths(path.dirname(liveFile));compiled._compile(patched,liveFile);require.cache[liveFile]=compiled;
require('./neural-statehead-cuda-worker.cjs');
