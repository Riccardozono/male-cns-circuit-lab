'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const {app,BrowserWindow,ipcMain,protocol}=require('electron');
const root=path.resolve(__dirname,'..'),outputs=path.join(root,'outputs'),arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
const stage=Number(arg('--stage=')||3);if(!Number.isInteger(stage)||stage<1||stage>64)throw Error('Stage sperimentale non valido');
const diversity=process.argv.includes('--diversity'),frontier=process.argv.includes('--frontier')||diversity;
const modelFile=diversity?path.join(root,'.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json'):frontier?path.join(root,'.impeccable/review/neural-sacl/frontier-native-model/model.malecns-neural-frontier.json'):path.join(root,'.impeccable/review/neural-sacl/context-stack-'+stage,'model.malecns-neural-context.json');
const profile=arg('--user-data-dir=')||path.join(root,'.impeccable/'+(diversity?'development-context-diversity-profile':frontier?'development-context-frontier-profile':'development-context-preview-profile'));
app.setName('male-cns-context-preview-dev');app.setVersion('5.6.0');app.setPath('userData',profile);
app.commandLine.appendSwitch('force_high_performance_gpu');
protocol.registerSchemesAsPrivileged([{scheme:'male-cns',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let window,worker,lastSnapshot,sessionId,rendererToken,readyInfo,runningPromise;
const override={
  'index.html':path.join(__dirname,'context-preview-index.html'),'app.js':path.join(__dirname,'context-preview-app.js'),
  'context-preview-ui.js':path.join(__dirname,'context-preview-ui.js'),
  'simulation.js':path.join(root,'.impeccable/experimental-penalty5/outputs/simulation.js'),
  'neural-learning.js':path.join(root,'.impeccable/experimental-penalty5/outputs/neural-learning.js'),
  'rewards.js':path.join(root,'.impeccable/experimental-penalty5/outputs/rewards.js')
};
function info(){return {availableWorkers:1,estimatedPhysicalCores:6,recommendedWorkerCount:1,workerCount:worker?1:0,activeWorkers:worker?1:0,dataset:'male-cns:v1.0',modelId:'v3',modelLabel:'V3 · readout neurale sperimentale',nodeCount:readyInfo?.graph.nodes||7721,edgeCount:readyInfo?.graph.edges||242486,gpu:{state:'not-used',backend:null},sessionId,rendererToken,experiment:{mode:'inference-only',stageCount:stage,modelSha256:readyInfo?.modelSha256,nodeVersion:readyInfo?.nodeVersion,frontier,verifiedResult:readyInfo?.verifiedResult}};}
function sendSnapshot(){if(lastSnapshot&&window&&!window.isDestroyed())window.webContents.send('compute:snapshot',{...lastSnapshot,engine:info()});}
async function start(options){
  if(options.modelId!=='v3'||options.circuitId!=='monza')throw Error('Questa copia verifica soltanto V3 su Monza.');
  if(worker){worker.postMessage({type:'stop'});await worker.terminate();}
  rendererToken=options.rendererToken||null;sessionId=crypto.randomUUID();lastSnapshot=null;
  runningPromise=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Il modello sperimentale non risponde. Riapri la copia di prova.')),10000);
    worker=fork(path.join(__dirname,'context-preview-worker.cjs'),[JSON.stringify({modelFile,frontier,speedMultiplier:options.speedMultiplier})],{execPath:path.join(root,'.impeccable/runtime-node24/node.exe'),cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
    worker.postMessage=m=>worker.send(m);
    worker.terminate=()=>new Promise(resolve=>{worker.once('exit',resolve);worker.kill();});
    worker.on('message',m=>{
      if(m.type==='ready'){if(m.nodeVersion!=='24.19.0'){clearTimeout(timeout);reject(Error('Runtime numerico incompatibile con il modello: serve Node 24.19.0.'));return;}readyInfo=m;clearTimeout(timeout);resolve(info());}
      else if(m.type==='snapshot'){lastSnapshot=m.snapshot;sendSnapshot();}
      else if(m.type==='error')window?.webContents.send('compute:error',{message:m.message});
    });
    worker.on('error',error=>{clearTimeout(timeout);reject(error);window?.webContents.send('compute:error',{message:error.message});});
  });
  return runningPromise;
}
app.whenReady().then(async()=>{
  protocol.handle('male-cns',async request=>{
    const name=decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/,''),file=override[name]||path.resolve(outputs,name),relative=path.relative(outputs,file);
    if(!override[name]&&(relative.startsWith('..')||path.isAbsolute(relative)))return new Response('Not found',{status:404});
    try{
      const bytes=await fs.readFile(file),ext=path.extname(file),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.woff2':'font/woff2'}[ext]||'application/octet-stream';
      return new Response(bytes,{headers:{'content-type':mime}});
    }catch{return new Response('Not found',{status:404});}
  });
  ipcMain.handle('compute:start',(_e,options)=>start(options));ipcMain.handle('compute:info',()=>info());
  ipcMain.handle('compute:command',(_e,command)=>{if(!worker)throw Error('Motore non pronto');worker.postMessage(command);return info();});
  window=new BrowserWindow({title:'Circuit Lab 5.6.0 · verifica neurale DEV',width:1500,height:1000,minWidth:740,minHeight:650,show:process.argv.includes('--show'),autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'context-preview-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  window.loadURL('male-cns://app/index.html');
  if(process.argv.includes('--smoke'))window.webContents.once('did-finish-load',()=>require('./context-preview-smoke.cjs').run(window,{root,stage,modelFile,getState:()=>lastSnapshot,info}).then(report=>app.exit(report.passed?0:1)).catch(error=>{console.error(error.stack);app.exit(1);}));
  if(process.argv.includes('--probe-atlas'))window.webContents.once('did-finish-load',()=>require('./context-atlas-probe.cjs').run(window,{root,getState:()=>lastSnapshot}).then(report=>app.exit(report.passed?0:1)).catch(error=>{console.error(error.stack);app.exit(1);}));
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>worker?.postMessage({type:'stop'}));
