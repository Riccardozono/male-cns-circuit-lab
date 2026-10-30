'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const body=name=>app.slice(app.indexOf('function '+name+'('),app.indexOf('\nfunction ',app.indexOf('function '+name+'(')+1));
function navigation(busy=false,disabled=false){
  const calls=[],node=id=>({disabled,focus:options=>calls.push(['focus',id,options])});
  const summary=node('summary'),panel={open:false,scrollIntoView:options=>calls.push(['scroll',options]),querySelector:selector=>(assert.equal(selector,'summary'),summary)};
  const elements={'model-test-panel':panel,'open-model-test':{setAttribute:(...args)=>calls.push(['aria',...args])},'model-test-start':node('start'),'model-test-stop':node('stop')};
  const sessionUI={syncTest:()=>{panel.hidden=!panel.open;}};
  vm.runInNewContext(body('revealModelTest')+'\nrevealModelTest();',{$:id=>elements[id],modelTestBusy:busy,sessionUI});return{calls,panel};
}
test('The model-test entry is visible in the top bar, labeled, controlled and disabled until ready',()=>{
  const topbar=html.slice(html.indexOf('<header'),html.indexOf('</header>'));
  assert.match(topbar,/<button[^>]+id="open-model-test"[^>]+aria-controls="model-test-panel"[^>]+aria-expanded="false"[^>]+disabled>Apri test modelli<\/button>/);
  assert.equal((html.match(/id="open-model-test"/g)||[]).length,1);assert.match(html,/<details class="model-test" id="model-test-panel">/);
  assert.doesNotMatch(css,/#open-model-test[^}]*display:\s*none/);
});
test('Opening the test reveals and scrolls to Start without advancing or resetting any simulation',()=>{
  const {calls,panel}=navigation();assert.equal(panel.open,true);assert.equal(calls[0].join('|'),'aria|aria-expanded|true');
  assert.equal(panel.hidden,false);
  assert.equal(calls[1][1].block,'start');assert.equal(calls[1][1].behavior,'auto');assert.equal(calls[2][1],'start');assert.equal(calls[2][2].preventScroll,true);
  assert.doesNotMatch(body('revealModelTest'),/runModelTest|desktopCompute|desktopTest|\bsim\b|reset\(|evolve\(/);
});
test('Opening an active test focuses Stop, or the native summary when the action is disabled',()=>{
  assert.equal(navigation(true).calls.at(-1)[1],'stop');assert.equal(navigation(true,true).calls.at(-1)[1],'summary');assert.equal(navigation(false,true).calls.at(-1)[1],'summary');
  assert.match(body('initModelTestControls'),/\.ontoggle=.*setAttribute\('aria-expanded',String\(\$\('model-test-panel'\)\.open\)\)/);
  assert.match(body('syncModelTestControls'),/\$\('open-model-test'\)\.disabled=progressBusy\|\|switchingModel/);
});
test('The requested champion/rules box and orphaned UI bindings/styles are removed, file saves remain',()=>{
  for(const source of [app,html,css])assert.doesNotMatch(source,/load-champion|storage-status|training-details|scoring-note|Campione automatico e regole/);
  assert.match(html,/id="save-progress"/);assert.match(html,/id="load-progress"/);assert.match(html,/id="progress-status"/);
});
test('Automatic versioned champion persistence still works without the removed status element',()=>{
  const store=new Map(),sim={champion:{readout:[1]},mode:'connectome',graph:{dataset:'actual',revision:5,n:3,edgeCount:2},championStats:{fitness:4},circuitId:'monza',circuit:{revision:7},bestEver:4},messages=[];
  const context={sim,modelTestBusy:false,APP_VERSION:'5.0.0',FlySim:{Rewards:{REVISION:8},validCheckpoint:()=>true,compareAgents:()=>0},MaleCNSVehicle:{REVISION:2},storageKey:()=>'model-circuit-version',localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},progressStatus:(...args)=>messages.push(args)};
  vm.runInNewContext(body('saveChampion')+'\nsaveChampion();',context);const saved=JSON.parse(store.get('model-circuit-version'));
  assert.equal(saved.appVersion,'5.0.0');assert.deepEqual(saved.genome,sim.champion);assert.equal(saved.circuitId,'monza');assert.equal(messages.length,0);
  store.clear();context.modelTestBusy=true;vm.runInNewContext(body('saveChampion')+'\nsaveChampion();',context);assert.equal(store.size,0);
  context.modelTestBusy=false;context.localStorage.setItem=()=>{throw Error('Storage unavailable');};vm.runInNewContext(body('saveChampion')+'\nsaveChampion();',context);assert.equal(messages.length,1);assert.equal(messages[0][1],true);assert.match(messages[0][0],/Salva file/);
});
