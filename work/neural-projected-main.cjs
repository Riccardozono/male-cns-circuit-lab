'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {app,BrowserWindow,ipcMain,protocol,dialog}=require('electron'),{Coordinator}=require('./neural-projected-coordinator.cjs'),Save=require('./neural-projected-save.cjs');
const root=path.resolve(__dirname,'..'),outputs=path.join(root,'outputs'),arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
const modelFile=path.join(root,'.impeccable/review/neural-sacl/projected-block-3680/model.malecns-projected-frontier.json');
app.setName('male-cns-projected-learning-dev');app.setVersion('5.6.0');app.setPath('userData',path.resolve(arg('--user-data-dir=')||path.join(root,'.impeccable/development-projected-training-profile')));
app.commandLine.appendSwitch('force_high_performance_gpu');
protocol.registerSchemesAsPrivileged([{scheme:'male-cns',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let window,coordinator,lastSnapshot,sessionId,rendererToken,errorMessage=null,ipcTail=Promise.resolve(),closing=false,activeModelFile=modelFile;
const override={'index.html':path.join(__dirname,'neural-grown-index.html'),'app.js':path.join(__dirname,'neural-grown-app.js'),'neural-grown-ui.js':path.join(__dirname,'neural-grown-ui.js'),
  'simulation.js':path.join(root,'.impeccable/experimental-penalty5/outputs/simulation.js'),'neural-learning.js':path.join(root,'.impeccable/experimental-penalty5/outputs/neural-learning.js'),'rewards.js':path.join(root,'.impeccable/experimental-penalty5/outputs/rewards.js')};
function info(){return {availableWorkers:4,estimatedPhysicalCores:6,recommendedWorkerCount:4,workerCount:coordinator?.workers.length||0,activeWorkers:coordinator?.workers.filter(w=>w.child.exitCode===null).length||0,
  dataset:'male-cns:v1.0',modelId:'v3',modelLabel:'V3 · proiezioni18 DEV',nodeCount:7721,edgeCount:242486,gpu:{state:'not-used',backend:null},sessionId,rendererToken,
  experiment:{...lastSnapshot?.experiment,mode:'projected-training-from-line',phase:errorMessage?'error':coordinator?.phase||'loading',error:errorMessage,modelSha256:coordinator?.loaded.sha256,nodeVersion:'24.19.0',warmStart:true}};}
function sendSnapshot(){if(lastSnapshot&&window&&!window.isDestroyed())window.webContents.send('compute:snapshot',{...lastSnapshot,engine:info()});}
function serial(task){const next=ipcTail.then(task);ipcTail=next.catch(()=>{});return next;}
async function start(options,restored=null,nextModelFile=activeModelFile){
  if(options.modelId!=='v3'||options.circuitId!=='monza')throw Error('Questa copia sperimentale allena soltanto V3 su Monza.');
  const candidate=new Coordinator({modelFile:nextModelFile,population:options.population||16,mutation:options.mutation??.16,speedMultiplier:options.speedMultiplier||1,workers:4,restored});
  if(coordinator)await coordinator.close();activeModelFile=nextModelFile;rendererToken=options.rendererToken||rendererToken;sessionId=crypto.randomUUID();lastSnapshot=null;errorMessage=null;coordinator=candidate;
  const owned=coordinator;
  coordinator.on('snapshot',snapshot=>{if(coordinator!==owned)return;lastSnapshot=snapshot;sendSnapshot();});coordinator.on('error',error=>{if(coordinator!==owned)return;errorMessage=error.message;coordinator.running=false;coordinator.phase='error';for(const w of coordinator.workers)if(w.child.connected)w.child.send({type:'pause',value:false});window?.webContents.send('compute:error',{message:'Motore sperimentale fermato: '+error.message+'. Chiudi e riapri questa copia; il file originale resta intatto.'});sendSnapshot();});
  try{await coordinator.start();return info();}catch(error){await coordinator.close();throw error;}
}
async function command(c){
  if(!coordinator||errorMessage)throw Error(errorMessage||'Motore ancora in caricamento.');
  if(c.type==='pause')await coordinator.pause(c.value);else if(c.type==='setSpeed')await coordinator.setSpeed(c.value);else if(c.type==='setMutation')await coordinator.setMutation(c.value);
  else if(c.type==='setPopulation')await coordinator.reset(c.value);else if(c.type==='inspectAgent'){
    // A queued read-only selection from the old 100-car view can arrive after
    // a population shrink. Ignore it, never invent an agent or stop training.
    if(!Number.isInteger(c.value)||c.value<0||c.value>=100)throw Error('Selezione auto non valida');
    if(c.value<coordinator.population)coordinator.inspect(c.value);
  }
  else if(c.type==='reset')await coordinator.reset();else if(c.type==='stop')await coordinator.close();else if(c.type==='setMode'&&c.value==='connectome'){}
  else throw Error('Comando non disponibile nel prototipo. Le generazioni cambiano soltanto quando tutte le auto hanno concluso la prova.');return info();
}
async function saveProgress(){
  if(!coordinator||errorMessage)throw Error('Motore non pronto per salvare.');
  const wasRunning=coordinator.running;await coordinator.pause(false);
  try{
    const result=await dialog.showSaveDialog(window,{title:'Salva proiezioni18 sperimentali',defaultPath:`Circuit-Lab-5.6.0-v3-monza-pca18-gen${coordinator.generation}.malecns-grown-dev`,filters:[{name:'Proiezioni18 private (non standard o grown precedente)',extensions:['malecns-grown-dev']}],properties:['showOverwriteConfirmation']});
    if(result.canceled||!result.filePath)return {canceled:true};const file=path.resolve(result.filePath);
    if(path.extname(file)!=='.malecns-grown-dev')throw Error('Usa l’estensione .malecns-grown-dev. I salvataggi normali e native-v1 non vengono sovrascritti.');
    const text=Save.encode(await fs.readFile(coordinator.modelFile,'utf8'),await coordinator.exportState());await fs.writeFile(file,text,{encoding:'utf8'});
    return {canceled:false,name:path.basename(file),generation:coordinator.generation,workers:coordinator.workerCount,restartAtLine:true};
  }finally{if(wasRunning&&!errorMessage)await coordinator.pause(true);}
}
async function loadProgress(){
  const result=await dialog.showOpenDialog(window,{title:'Apri proiezioni18 sperimentali',filters:[{name:'Proiezioni18 private',extensions:['malecns-grown-dev']}],properties:['openFile']});
  if(result.canceled||!result.filePaths.length)return {canceled:true};const file=path.resolve(result.filePaths[0]);
  if(path.extname(file)!=='.malecns-grown-dev'||(await fs.stat(file)).size>40*1024*1024)throw Error('Seleziona un .malecns-grown-dev valido. I formati normale e native-v1 sono separati.');
  const parsed=Save.parse(await fs.readFile(file,'utf8')),cachedModel=await Save.materialize(parsed,path.join(app.getPath('userData'),'models'));
  const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Carica in pausa','Annulla'],defaultId:1,cancelId:1,title:'Ripartire dalla generazione salvata?',message:'Questa prova corrente verrà interrotta senza essere valutata.',detail:'Si mantengono pesi, archivio e storico del file. Le auto ripartono fisicamente dal traguardo: non si ripristina la posizione a metà giro. Il salvataggio originale non viene modificato.'});
  if(answer.response!==0)return {canceled:true};await start({modelId:'v3',circuitId:'monza',rendererToken,population:parsed.state.population,mutation:parsed.state.mutation,speedMultiplier:parsed.state.speedMultiplier},parsed.state,cachedModel);
  return {canceled:false,name:path.basename(file),generation:coordinator.generation,restartAtLine:true};
}
app.whenReady().then(async()=>{
  protocol.handle('male-cns',async request=>{
    const name=decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/,''),file=override[name]||path.resolve(outputs,name),relative=path.relative(outputs,file);
    if(!override[name]&&(relative.startsWith('..')||path.isAbsolute(relative)))return new Response('Not found',{status:404});
    try{const bytes=await fs.readFile(file),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';return new Response(bytes,{headers:{'content-type':mime}});}catch{return new Response('Not found',{status:404});}
  });
  const handle=(name,fn)=>ipcMain.handle(name,(event,...args)=>{if(event.sender!==window?.webContents)throw Error('Finestra non autorizzata');return serial(()=>fn(...args));});
  handle('compute:start',options=>start(options));handle('compute:info',info);handle('compute:command',command);handle('native-learning:save',saveProgress);handle('native-learning:open',loadProgress);
  window=new BrowserWindow({title:'Circuit Lab 5.6.0 · proiezioni18 DEV · V3 / Monza',width:1500,height:1000,minWidth:740,minHeight:650,show:process.argv.includes('--show'),autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'neural-grown-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  window.on('page-title-updated',event=>event.preventDefault());
  window.loadURL('male-cns://app/index.html');
  if(process.argv.includes('--smoke'))window.webContents.once('did-finish-load',()=>require('./neural-projected-smoke.cjs').run(window,{root,modelFile,info,getCoordinator:()=>coordinator,saveProgress,loadProgress}).then(report=>app.exit(report.passed?0:1)).catch(error=>{console.error(error.stack);app.exit(1);}));
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{if(coordinator&&!closing){event.preventDefault();closing=true;coordinator.close().finally(()=>app.quit());}});
