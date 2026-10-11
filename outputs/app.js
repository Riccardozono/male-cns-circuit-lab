'use strict';
// Rendering/controls only; simulation.js owns physics and neural state.
const $=id=>document.getElementById(id),canvas=$('simulation-canvas'),ctx=canvas.getContext('2d');
const historyCanvas=$('history-canvas'),historyCtx=historyCanvas.getContext('2d');
const COLORS=['#ff7658','#68d3c5','#f0bd69','#a6b4ff','#d7a4dd','#8ccf8b','#f5df91','#77b7dc'];
let sim,selectedId=0,showSensors=true,view={scale:1,offsetX:0,offsetY:0},lastTime=0,lastUI=0,savedGeneration=0;
let runtimeData=null,legacyDataPromise=null,activeModelId='v5',switchingModel=false,progressBusy=false;
let modelTestSuite=null,modelTestBusy=false,modelTestRows=[];
let canvasMetrics={width:0,height:0,dpr:1},historyKey='',renderDirty=true,lastRenderTime=0;
let brainAtlas=null;
let trackRenderer=null,trackCamera=null,trackFocus='',trackGesture=null;
let circuit3D=null,circuit3DLoading=null,circuitView='2d',circuitViewRequest=0;
const carRenderer=new MaleCNSCars.Renderer();
const agentSelection=new MaleCNSAgents.Selection();
let carPreviewKey='';
const trackPointers=new Map();
const APP_VERSION='5.2.0',number=n=>n.toLocaleString('it-IT');
const cameraSelect=$('camera-select');
const pad=n=>String(n).padStart(2,'0'),seconds=n=>`${pad(Math.floor(n/60))}:${pad(Math.floor(n%60))}`;
const lapClock=n=>Number.isFinite(n)?`${seconds(n)}.${Math.floor((n%1)*10)}`:'—';
const signedPoints=n=>`${n<0?'−':'+'}${Math.round(Math.abs(n))} pt`;
const signedG=n=>`${n<0?'−':''}${Math.abs(n).toFixed(2)} G`;
const selected=()=>sim.cars.find(car=>car.id===selectedId)||sim.cars[0],best=()=>sim.cars.reduce((a,b)=>FlySim.compareAgents(a,b)<=0?a:b);
const MODEL_OPTIONS=[
  {id:'v5',value:'v5',name:'MaleCNS V5 esteso',label:'MaleCNS V5 esteso · 32.768 slot neurali'},
  {id:'v4',value:'v4',name:'MaleCNS V4 completo',label:'MaleCNS V4 completo · 166.700 neuroni'},
  {id:'v3',value:'v3',name:'MaleCNS V3 storico',label:'MaleCNS V3 storico · 7.721 neuroni'},
  {id:'v2',value:'v2',name:'MaleCNS V2 compatto ricostruito',label:'MaleCNS V2 compatto ricostruito · 1.121 neuroni'}
];
const modelOption=id=>MODEL_OPTIONS.find(model=>model.id===id)||MODEL_OPTIONS[0];
const storageKey=()=>{
  const base=FlySim.checkpointKey(sim.circuitId,sim.circuit.revision);
  return `${base}:${sim.modelId}:app-${APP_VERSION}`;
};
const PREFERENCE_KEY='malecns-circuit-v3-selected-track';
const MODEL_PREFERENCE_KEY='malecns-controller-model';
const SPEED_PREFERENCE_KEY='malecns-simulation-speed';
const normalizeSpeed=value=>Math.max(.5,Math.min(30,Math.round((Number(value)||1)*2)/2));
function readSpeedPreference(){
  let value=normalizeSpeed($('speed-range').value);
  try{const saved=Number(localStorage.getItem(SPEED_PREFERENCE_KEY));if(Number.isFinite(saved))value=normalizeSpeed(saved);}catch{}
  return value;
}
function saveSpeedPreference(value){try{localStorage.setItem(SPEED_PREFERENCE_KEY,String(normalizeSpeed(value)));}catch{}}
function readModelPreference(){
  try{const saved=localStorage.getItem(MODEL_PREFERENCE_KEY);if(MODEL_OPTIONS.some(model=>model.id===saved))return saved;}catch{}
  return 'v5';
}
function saveModelPreference(value){try{localStorage.setItem(MODEL_PREFERENCE_KEY,value);}catch{}}
async function loadModelData(modelId){
  if(modelId==='v5')return MaleCNSProfiles.buildV5(runtimeData);
  if(modelId==='v4')return runtimeData;
  if(!legacyDataPromise){
    legacyDataPromise=fetch('data/connectome.json',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw Error(`Modelli storici MaleCNS non disponibili (${response.status}).`);
      return response.json();
    });
  }
  const source=await legacyDataPromise;
  return modelId==='v2'?MaleCNSLegacy.buildV2(source):MaleCNSLegacy.tagV3(source);
}
function syncSpeedControl(){
  if(!sim)return;
  const input=$('speed-range'),speed=normalizeSpeed(sim.speedMultiplier);
  if(document.activeElement!==input||Math.abs(Number(input.value)-speed)>1e-9)input.value=String(speed);
  $('speed-output').textContent=speed.toFixed(1)+'×';
}
function refreshTrackWidth(car=selected()){
  const station=trackFocus.startsWith('width:')?sim.track.widthStations[Number(trackFocus.slice(6))]:null;
  const info=FlySim.trackWidthAt(sim.track,station?station.alongMeters:car.lastAlong||0);
  $('track-local-width').textContent=`${station?'Tratto inquadrato':`A-${pad(car.id+1)}`} · ${info.label} · ${info.widthMeters.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})} m${info.estimated?' (stimata)':''}`;
}
function resetTrackView(){trackCamera.reset();cameraSelect.value='overview';circuit3D?.setMode('overview');circuit3D?.reset();trackFocus='';$('track-landmark').value='';refreshTrackWidth();renderDirty=true;render();}
function focusTrack(key){
  const point=key==='start'?sim.track.center[0]:key.startsWith('width:')?sim.track.widthStations[Number(key.slice(6))]:sim.circuit.landmarks[Number(key)];if(!point)return;
  cameraSelect.value='overview';trackFocus=key;$('track-landmark').value=key;trackCamera.focus(point,view);refreshTrackWidth();renderDirty=true;render();
  if(circuitView==='3d'){circuit3D?.focusPoint(point);render();}
}
function zoomTrack(factor,point={x:view.width/2,y:view.height/2}){
  if(circuitView==='3d'){circuit3D?.zoom(factor);renderDirty=true;render();return;}
  trackCamera.zoomAt(factor,point,view,cameraSelect.value==='follow');renderDirty=true;render();
}
function releaseTrackFollow(){if(cameraSelect.value==='follow'){trackCamera.releaseFollow(view);cameraSelect.value='overview';}}
function pickTrack(point){
  const world=MaleCNSTracks.unproject(point,view);let distance=18/view.scale,id=null;
  for(const car of sim.cars){const d=Math.hypot(car.x-world.x,car.y-world.y);if(d<distance){distance=d;id=car.id;}}
  if(id!==null){inspectAgent(id);return;}
  const label=trackRenderer.hitLabel(point);if(label)focusTrack(label.key);
}
function initTrackControls(){
  $('track-mode-2d').onclick=()=>setCircuitView('2d');$('track-mode-3d').onclick=()=>setCircuitView('3d');
  $('track-zoom-in').onclick=()=>zoomTrack(1.4);$('track-zoom-out').onclick=()=>zoomTrack(1/1.4);$('track-reset').onclick=resetTrackView;
  $('track-landmark').onchange=e=>e.target.value?focusTrack(e.target.value):resetTrackView();
  $('track-details').onclick=e=>{trackRenderer.setDetails(!trackRenderer.details);e.currentTarget.setAttribute('aria-pressed',String(trackRenderer.details));e.currentTarget.textContent=trackRenderer.details?'Dettagli: sì':'Dettagli: no';renderDirty=true;render();};
  $('track-boundaries').onclick=e=>{trackRenderer.boundaries=!trackRenderer.boundaries;e.currentTarget.setAttribute('aria-pressed',String(trackRenderer.boundaries));e.currentTarget.textContent=trackRenderer.boundaries?'Nascondi bordi fisici':'Mostra bordi fisici';renderDirty=true;render();};
  const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const midpoint=()=>{const p=Array.from(trackPointers.values());return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,distance:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y))};};
  canvas.onpointerdown=e=>{
    if(e.button!==0)return;const p=local(e);trackPointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);
    if(trackPointers.size===1)trackGesture={origin:p,last:p,moved:false};
    else if(trackPointers.size===2){releaseTrackFollow();trackGesture.moved=true;trackGesture.pinch=midpoint();}
  };
  canvas.onpointermove=e=>{
    if(!trackPointers.has(e.pointerId)||!trackGesture)return;
    const p=local(e);trackPointers.set(e.pointerId,p);
    if(trackPointers.size===2){const next=midpoint(),old=trackGesture.pinch||next;trackCamera.pan(next.x-old.x,next.y-old.y,view);zoomTrack(next.distance/old.distance,next);trackGesture.pinch=next;return;}
    if(trackPointers.size!==1)return;
    if(Math.hypot(p.x-trackGesture.origin.x,p.y-trackGesture.origin.y)>5)trackGesture.moved=true;
    if(trackGesture.moved){releaseTrackFollow();trackCamera.pan(p.x-trackGesture.last.x,p.y-trackGesture.last.y,view);renderDirty=true;render();}
    trackGesture.last=p;
  };
  const finish=(e,cancelled=false)=>{
    if(!trackPointers.has(e.pointerId))return;const p=local(e),gesture=trackGesture;trackPointers.delete(e.pointerId);
    if(trackPointers.size){trackGesture={origin:Array.from(trackPointers.values())[0],last:Array.from(trackPointers.values())[0],moved:true};}
    else {trackGesture=null;if(!cancelled&&!gesture.moved)pickTrack(p);}
  };
  canvas.onpointerup=e=>finish(e);canvas.onpointercancel=e=>finish(e,true);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomTrack(Math.exp(-FlySim.clamp(e.deltaY,-150,150)*.004),local(e));},{passive:false});
  canvas.onkeydown=e=>{
    if(e.key==='Home'){e.preventDefault();resetTrackView();return;}
    if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();zoomTrack(e.key==='-'?1/1.4:1.4);return;}
    const directions={ArrowLeft:[50,0],ArrowRight:[-50,0],ArrowUp:[0,50],ArrowDown:[0,-50]};
    if(directions[e.key]){e.preventDefault();releaseTrackFollow();trackCamera.pan(...directions[e.key],view);renderDirty=true;render();}
  };
}
async function setCircuitView(mode){
  const request=++circuitViewRequest;
  if(mode==='3d'){
    $('track-3d-status').textContent='Caricamento vista 3D locale…';$('track-mode-3d').disabled=true;
    try{
      if(!circuit3D){
        circuit3DLoading??=import('./circuit-3d.mjs');const {Circuit3D}=await circuit3DLoading;
        if(request!==circuitViewRequest)return;
        circuit3D=new Circuit3D($('track-3d-canvas'),{onSelect:id=>{inspectAgent(id);renderDirty=true;},onChange:()=>{renderDirty=true;if(circuit3D&&cameraSelect.value!==circuit3D.mode)cameraSelect.value=circuit3D.mode;},onModelStatus:message=>{$('track-3d-status').textContent=message+' · barriere e vie di fuga schematiche, solo visive';},onFallback:message=>{setCircuitView('2d');$('track-3d-status').textContent=message;}});
        circuit3D.setTrack(sim.track,trackRenderer.model,FlySim.onRoad);
        cameraSelect.value='follow';circuit3D.setMode('follow');
      }
      if(circuit3D.lost)throw Error('Contesto grafico non disponibile: riapri l’app per riprovare.');
      circuit3D.setMode(cameraSelect.value);
      $('track-3d-status').textContent=circuit3D.carRevision?'Porsche 992 dello ZIP · barriere e vie di fuga schematiche, solo visive':'3D su GPU · caricamento Porsche 992 locale…';
    }catch(error){mode='2d';$('track-3d-status').textContent='3D non disponibile. La mappa 2D e l’IA restano attive. '+error.message;}
    finally{$('track-mode-3d').disabled=false;}
  }
  if(request!==circuitViewRequest)return;circuitView=mode;
  canvas.hidden=mode==='3d';$('track-3d-canvas').hidden=mode!=='3d';$('track-3d-hud').hidden=mode!=='3d';$('track-2d-legend').hidden=mode==='3d';
  $('track-mode-2d').setAttribute('aria-pressed',String(mode==='2d'));$('track-mode-3d').setAttribute('aria-pressed',String(mode==='3d'));
  $('track-navigation-note').textContent=mode==='3d'?'Trascina per orbitare · Maiusc + trascina per spostare · rotella / pizzico per zoom · frecce per orbitare · clic su un’auto':'Trascina per spostare · rotella o pizzico per zoom · clic su un’auto o una curva';
  if(window.circuitLab){window.circuitLab.circuit3D=circuit3D;window.circuitLab.circuitView=mode;}
  resize();
}
function invalidateBrainMap(){brainAtlas?.invalidate();}
function atlasReadout(info){
  const graph=sim.graph,atlas=brainAtlas;
  $('brain-renderer').textContent=info.backend;
  $('brain-agent').textContent=`A-${pad(info.agentId+1)} · gen. ${info.generation} · ${info.frozen?'campione congelato':info.running?'lettura live':'simulazione in pausa'}${info.alive===false?' · auto inattiva':''}`;
  $('brain-preset').value=info.preset;$('brain-filter').value=info.filter;
  const names={orbit:'Prospettiva 3D',xy:'Piano XY',yz:'Piano YZ',xz:'Piano XZ'};
  $('brain-view-label').textContent=`${names[info.preset]} · ${info.zoom.toFixed(1)}×`;
  $('brain-live').textContent=info.frozen?'Riprendi attività':'Congela attività';$('brain-live').setAttribute('aria-pressed',String(info.frozen));
  $('brain-empty').hidden=info.displayedNodes>0||atlas.contextLost;
  $('brain-map-count').textContent=`${number(info.displayedNodes)} punti mostrati / ${number(info.coordinates)} coordinate reali · ${number(info.missingCoordinates)} senza coordinate, non disegnati`;
  $('brain-map-active').textContent=`${number(info.displayedEdges)} contributi mostrati · ${number(info.nonzero)} attività |a| > 0,002 · ${number(info.slots)} slot solver · agente A-${pad(info.agentId+1)}`;
  $('brain-map-note').textContent=info.selected>=0?'Connessioni: campione dei contributi adiacenti al neurone selezionato. Coordinate somaLocation originali; dinamica artificiale a tassi.':'Connessioni: campione dai 256 sorgenti con attività più forte, entro il filtro. Coordinate somaLocation originali; dinamica artificiale a tassi.';
  $('brain-focus').disabled=info.selected<0;
  if(info.selected>=0){
    const i=info.selected,node=graph.nodes?.[i],meta=graph.outputMeta.find(n=>n.index===i),kind=graph.classNames[graph.classCodes[i]],side=graph.sideCodes[i]===1?'R':graph.sideCodes[i]===-1?'L':'non annotato',xyz=Array.from(graph.positions.subarray(i*3,i*3+3));
    $('brain-selection-title').textContent=`ID ${graph.bodyIds[i]}${node?.type||meta?.type?' · '+(node?.type||meta.type):''}`;
    $('brain-selection-detail').textContent=`${kind||'classe non annotata'} · lato ${side} · attività ${atlas.activity[i].toFixed(4)} · XYZ raw ${xyz.join(' / ')}${atlas.readoutSet.has(i)?' · lettura motoria appresa':atlas.inputSet.has(i)?' · ingresso sensoriale':''}`;
  }else{$('brain-selection-title').textContent='Nessuna selezione';$('brain-selection-detail').textContent='Clicca un punto o cerca un body ID. Escape deseleziona.';}
  const axisCamera={yaw:info.yaw,pitch:info.pitch,zoom:1,pan:[0,0],focus:[0,0,0],fit:1};
  for(const [a,xyz]of [['x',[.8,0,0]],['y',[0,.8,0]],['z',[0,0,.8]]]){const p=MaleCNSAtlas.project(xyz,axisCamera,82,82);$('axis-'+a).setAttribute('x2',p.x);$('axis-'+a).setAttribute('y2',p.y);$('axis-'+a+'-label').setAttribute('x',p.x+3);$('axis-'+a+'-label').setAttribute('y',p.y+4);}
}
function buildBrainMap(){
  if(!brainAtlas)brainAtlas=new MaleCNSAtlas.Viewer($('brain-canvas'),atlasReadout);
  brainAtlas.setGraph(sim.graph,FlySim.ensureLearning(sim.graph));
  $('brain-quality').value=String(brainAtlas.limit);
  window.circuitLab.atlas=brainAtlas;
}
function updateBrainMapActivity(force=false){const car=selected();if(car?.brainSnapshot===false){$('brain-agent').textContent=`A-${pad(car.id+1)} · in attesa del campione completo${sim.running?'':' · riprendi se la rete è in riavvio'}`;return;}brainAtlas?.update(car,sim,force,car?.genome?.policyWeights?FlySim.synapticGains(sim.graph,car.genome):null);}
function showWorkspace(viewName){
  $('visual-stage').dataset.view=viewName;$('circuit-view').hidden=viewName==='brain';$('brain-view').hidden=viewName==='circuit';
  for(const name of ['circuit','brain','split'])$('view-'+name).setAttribute('aria-pressed',String(name===viewName));
  cameraSelect.disabled=viewName==='brain';invalidateBrainMap();requestAnimationFrame(()=>{resize();updateBrainMapActivity(true);});
}
function initBrainMapControls(){
  for(const name of ['circuit','brain','split'])$('view-'+name).onclick=()=>showWorkspace(name);
  $('brain-preset').onchange=e=>brainAtlas.setPreset(e.target.value);
  $('brain-filter').onchange=e=>{brainAtlas.filter=e.target.value;brainAtlas.selected=-1;brainAtlas.rebuild();brainAtlas.fitSelection();};
  $('brain-map-reset').onclick=()=>brainAtlas.fitSelection();
  $('brain-focus').onclick=()=>brainAtlas.focusSelection();
  $('brain-live').onclick=()=>{brainAtlas.frozen=!brainAtlas.frozen;if(!brainAtlas.frozen)updateBrainMapActivity(true);brainAtlas.notify();};
  for(const [id,factor]of [['brain-zoom-in',1.2],['brain-zoom-out',1/1.2]])$(id).onclick=()=>{brainAtlas.camera.zoom=FlySim.clamp(brainAtlas.camera.zoom*factor,.3,5);brainAtlas.dirty=true;brainAtlas.notify();};
  $('brain-color').onchange=e=>{brainAtlas.colorMode=e.target.value;brainAtlas.upload();brainAtlas.dirty=true;$('brain-view').classList.toggle('atlas-activity-color',e.target.value==='activity');$('brain-activity-legend').hidden=e.target.value!=='activity';};
  $('brain-quality').onchange=e=>{brainAtlas.limit=Number(e.target.value);brainAtlas.rebuild();};
  $('brain-density').oninput=e=>{brainAtlas.edgeLimit=Number(e.target.value);$('brain-density-output').textContent=e.target.value;brainAtlas.upload();brainAtlas.dirty=true;brainAtlas.notify();};
  $('brain-search-form').onsubmit=e=>{e.preventDefault();const id=$('brain-search').value.trim();$('brain-search-status').textContent=/^\d+$/.test(id)?brainAtlas.selectBody(id):'Inserisci un body ID numerico presente nel modello.';};
}
function drawCar(car) {
  const chosen=car.id===selectedId,color=COLORS[car.id%COLORS.length];
  if(chosen&&car.trail.length){ctx.beginPath();car.trail.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.globalAlpha=0.4;ctx.lineWidth=1.5/view.scale;ctx.stroke();ctx.globalAlpha=1;}
  if(chosen&&showSensors){
    // Use the world-space ray distances for the overlay. `car.inputs` are
    // normalized neural channels and can use a track-specific scale.
    const distances=FlySim.sensorDistances(sim.track,car);
    car.inputs.forEach((value,i)=>{
      const angle=car.heading+FlySim.ANGLES[i],length=distances[i],ex=car.x+Math.cos(angle)*length,ey=car.y+Math.sin(angle)*length;
      ctx.strokeStyle=i===3?'#f4efdf':color;ctx.lineWidth=1/view.scale;ctx.globalAlpha=0.8;ctx.beginPath();ctx.moveTo(car.x,car.y);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(ex,ey,1.5/view.scale,0,Math.PI*2);ctx.fill();
    });ctx.globalAlpha=1;
  }
  ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.heading);ctx.globalAlpha=car.alive?1:0.3;
  if(chosen){ctx.strokeStyle=color;ctx.lineWidth=1.5/view.scale;ctx.beginPath();ctx.arc(0,0,Math.max(20*car.scale,6/view.scale),0,Math.PI*2);ctx.stroke();}
  ctx.scale(car.scale,car.scale);
  carRenderer.drawLocal(ctx,car,{color,pixelLength:24*car.scale*view.scale});ctx.restore();
  if(chosen){ctx.fillStyle=color;ctx.font=`bold ${12/view.scale}px ui-monospace,monospace`;ctx.fillText(`A-${pad(car.id+1)}${car.alive?'':' · '+car.reason}`,car.x+14/view.scale,car.y-14/view.scale);}
}
function render() {
  if(circuitView==='3d'&&circuit3D&&trackRenderer){
    circuit3D.render(sim,selected(),COLORS,{sensors:showSensors,boundaries:trackRenderer.boundaries,details:trackRenderer.details,sensorDistances:FlySim.sensorDistances,angles:FlySim.ANGLES});
    $('track-view-label').textContent=circuit3D.mode==='follow'?`3D · segui A-${pad(selectedId+1)}`:'3D · panoramica';
    const car=selected();$('track-3d-hud').textContent=`A-${pad(car.id+1)} · ${((car.vehicle?.speedMps||0)*3.6).toFixed(0)} km/h · marcia ${car.vehicle?.gear||'N'} · ${car.laps}/2 giri${car.alive?'':' · '+car.reason}`;
    window.circuitLab.circuit3D=circuit3D;window.circuitLab.circuitView=circuitView;renderDirty=false;lastRenderTime=performance.now();return;
  }
  const {width,height,dpr}=canvasMetrics,follow=cameraSelect.value==='follow';
  if(!width||!height||!trackRenderer)return;
  view=trackCamera.view(width,height,follow?selected():null);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(view.offsetX,view.offsetY);ctx.scale(view.scale,view.scale);trackRenderer.draw(ctx,view,dpr);ctx.restore();
  const inspected=selected(),p=MaleCNSTracks.project(inspected,view);
  ctx.font='bold 12px ui-monospace,monospace';
  trackRenderer.drawLabels(ctx,view,!follow,trackFocus,[{x:p.x+10,y:p.y-29,width:ctx.measureText(`A-${pad(inspected.id+1)}${inspected.alive?'':' · '+inspected.reason}`).width+8,height:23},{x:p.x-10,y:p.y-10,width:20,height:20}]);
  ctx.save();ctx.translate(view.offsetX,view.offsetY);ctx.scale(view.scale,view.scale);
  for(const car of sim.cars)if(car.id!==selectedId)drawCar(car);drawCar(selected());ctx.restore();
  $('track-view-label').textContent=`${follow?'Segui A-'+pad(selectedId+1):'Mappa'} · ${(follow?trackCamera.followZoom:trackCamera.zoom).toFixed(1)}×`;
  window.circuitLab.trackView={...view};
  window.circuitLab.carRenderer=carRenderer;
  renderDirty=false;lastRenderTime=performance.now();
}
function refreshCarPreview(car){
  const preview=$('car-preview'),state=MaleCNSCars.displayState(car),rect=preview.getBoundingClientRect();
  const key=[car.id,car.alive,state.steering.toFixed(4),state.braking,carRenderer.state,rect.width,rect.height,window.devicePixelRatio].join('|');
  if(key!==carPreviewKey){
    carPreviewKey=key;carRenderer.drawPreview(preview,car,COLORS[car.id%COLORS.length],window.devicePixelRatio||1);
    preview.setAttribute('aria-label',`Porsche 911 GT3 R dall’alto, livrea di A-${pad(car.id+1)}. Sterzo ${(state.steering*180/Math.PI).toFixed(1)} gradi. ${state.braking?'Frenata attiva.':'Freno non attivo.'}`);
  }
  $('car-visual-status').textContent=carRenderer.state==='ready'?`Vista dall’alto · A-${pad(car.id+1)}`:carRenderer.state==='fallback'?'Sprite non disponibile · sagoma di riserva':'Caricamento modello visivo…';
}
function closeUpCar(){
  showWorkspace('circuit');cameraSelect.value='follow';trackCamera.followZoom=6;
  if(circuitView==='3d'){circuit3D?.setMode('follow');if(circuit3D)circuit3D.followDistance=9;}
  trackFocus='';$('track-landmark').value='';renderDirty=true;render();
  $('circuit-view').scrollIntoView({block:'start',behavior:'instant'});(circuitView==='3d'?$('track-3d-canvas'):canvas).focus({preventScroll:true});
}
function history() {
  const rect=historyCanvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr),values=sim.history.slice(-32);
  const mode=$('history-mode').value,series=MaleCNSLearningMetrics.series(values,sim.track,mode);
  const key=`${mode}|${width}|${height}|${values.map(v=>`${v.generation}:${v.best}:${v.mean}:${v.bestProgress||0}`).join(';')}`;
  if(historyKey===key)return;historyKey=key;
  if(historyCanvas.width!==width)historyCanvas.width=width;
  if(historyCanvas.height!==height)historyCanvas.height=height;
  historyCtx.setTransform(dpr,0,0,dpr,0,0);historyCtx.clearRect(0,0,rect.width,rect.height);
  const {min,max}=series,span=Math.max(1,max-min),plot={left:8,right:rect.width-8,top:26,bottom:rect.height-24};
  historyCtx.font='12px system-ui';historyCtx.fillStyle='#a9b2b7';historyCtx.fillText(`${Math.round(max).toLocaleString('it-IT')} ${series.unit}`,8,15);
  if(values.length){historyCtx.fillText(`Gen. ${values[0].generation} – ${values.at(-1).generation}`,8,rect.height-5);historyCtx.textAlign='right';historyCtx.fillText(`${Math.round(min)} ${series.unit}`,rect.width-8,rect.height-5);historyCtx.textAlign='left';}
  else historyCtx.fillText('Il grafico appare dopo la prima generazione.',8,rect.height/2);
  historyCtx.strokeStyle='#2b3945';historyCtx.lineWidth=1;historyCtx.beginPath();historyCtx.moveTo(plot.left,plot.bottom);historyCtx.lineTo(plot.right,plot.bottom);historyCtx.stroke();
  for(const [key,color] of [['mean','#74828b'],['best','#68d3c5']]){
    const points=series.points.map((v,i)=>({x:values.length===1?rect.width/2:plot.left+i/(values.length-1)*(plot.right-plot.left),y:plot.bottom-(v[key]-min)/span*(plot.bottom-plot.top)}));
    historyCtx.strokeStyle=color;historyCtx.lineWidth=2;historyCtx.beginPath();points.forEach((p,i)=>i?historyCtx.lineTo(p.x,p.y):historyCtx.moveTo(p.x,p.y));historyCtx.stroke();
    points.forEach(p=>{historyCtx.fillStyle=color;historyCtx.beginPath();historyCtx.arc(p.x,p.y,2.5,0,Math.PI*2);historyCtx.fill();});
  }
  historyCanvas.setAttribute('aria-label',`${mode==='progress'?'Distanza percorsa in metri':'Punteggio netto in punti'} per generazione, migliore e media della popolazione. ${$('history-caption').textContent}`);
}
function signal(id,value,center=false){$(id).style.transform=`scaleX(${FlySim.clamp(center?(value+1)/2:value,0,1)})`;$(id+'-value').textContent=value.toFixed(2);}
function refreshVehicle(car){
  const v=car.vehicle?.simulationSeconds!==undefined?MaleCNSVehicle.telemetry(car.vehicle,true):car.vehicle;
  if(!v)return;
  const gear=g=>g===0?'N':g===-1?'R':String(g);
  $('vehicle-gear').textContent=gear(v.gear)+(v.shiftRemaining>0?' → '+gear(v.targetGear):'');
  $('vehicle-rpm').textContent=number(Math.round(v.rpm))+' rpm';
  $('vehicle-aids').textContent=`ABS ${v.absEnabled?(v.absActive?'interviene':'attivo'):'spento'} · TC ${v.tcEnabled?(v.tcActive?'interviene':'attivo'):'spento'} · ${v.gearboxMode==='auto'?'cambio automatico':'cambio manuale'}${v.limiter?' · limitatore':''}`;
  $('vehicle-power').textContent=v.enginePowerKw.toFixed(0)+' kW';$('vehicle-fuel').textContent=v.fuelL.toFixed(1)+' L';
  $('vehicle-tyres').textContent=v.tyreC.toFixed(0)+' °C / '+(v.tyreWear*100).toFixed(1)+'%';$('vehicle-pressure').textContent=v.pressureBar.toFixed(2)+' bar';
  $('vehicle-brakes').textContent=v.brakeC.toFixed(0)+' °C';$('vehicle-aero').textContent=v.downforceN.toFixed(0)+' N';
  $('vehicle-wheel-loads').textContent=v.wheels?['AS','AD','PS','PD'].map((label,i)=>label+' '+Math.round(v.wheels[i].fz)+' N').join(' · '):'Carichi ruote in attesa del campione.';
  if(document.activeElement!==$('vehicle-gearbox'))$('vehicle-gearbox').value=v.gearboxMode;
  $('vehicle-abs').checked=v.absEnabled;$('vehicle-tc').checked=v.tcEnabled;
  $('gear-down').disabled=v.gearboxMode!=='manual'||v.shiftRemaining>0||v.gear===-1;
  $('gear-up').disabled=v.gearboxMode!=='manual'||v.shiftRemaining>0||v.gear===6;
}
function vehicleControl(change){
  if(modelTestBusy)return;
  const car=selected();
  if(globalThis.desktopCompute)sim.post({type:'vehicleControl',agentId:car.id,workerIndex:sim.workerIndex||0,...change});
  else {
    car.diagnosticVehicle=true;const v=car.vehicle;
    if(change.gearboxMode)v.gearboxMode=change.gearboxMode;
    if(typeof change.absEnabled==='boolean')v.absEnabled=change.absEnabled;
    if(typeof change.tcEnabled==='boolean')v.tcEnabled=change.tcEnabled;
    if(Number.isInteger(change.gear)&&v.gearboxMode==='manual')MaleCNSVehicle.requestGear(v,change.gear);
    refresh(true);
  }
}
function initVehicleControls(){
  $('vehicle-gearbox').onchange=e=>vehicleControl({gearboxMode:e.target.value});
  $('vehicle-abs').onchange=e=>vehicleControl({absEnabled:e.target.checked});$('vehicle-tc').onchange=e=>vehicleControl({tcEnabled:e.target.checked});
  $('gear-down').onclick=()=>vehicleControl({gear:selected().vehicle.gear-1});$('gear-up').onclick=()=>vehicleControl({gear:selected().vehicle.gear+1});
}
function saveChampion(){
  if(modelTestBusy||!sim.champion||sim.mode!=='connectome')return;
  try{
    const previous=JSON.parse(localStorage.getItem(storageKey())||'null');
    if(previous?.appVersion!==APP_VERSION||!FlySim.validCheckpoint(previous,sim,sim.graph.dataset)||!previous.championStats||FlySim.compareAgents(sim.championStats,previous.championStats)<0)localStorage.setItem(storageKey(),JSON.stringify({schema:1,appVersion:APP_VERSION,rewardRevision:FlySim.Rewards.REVISION,vehicleRevision:MaleCNSVehicle.REVISION,graphRevision:sim.graph.revision,circuitId:sim.circuitId,circuitRevision:sim.circuit.revision,dataset:sim.graph.dataset,nodes:sim.graph.n,edges:sim.graph.edgeCount,fitness:sim.bestEver,championStats:sim.championStats,genome:sim.champion}));
  }catch{progressStatus('Autosalvataggio locale non disponibile. Usa “Salva file…” per creare il file.',true);}
}
function refresh(force=false){
  const now=performance.now();if(!force&&now-lastUI<150)return;lastUI=now;
  syncAgentSelection();
  const car=selected(),leader=best();syncSpeedControl();$('run-state').textContent=sim.running?'IN CORSO':'IN PAUSA';$('toggle-run').textContent=sim.running?'Pausa':'Riprendi';
  if(globalThis.desktopCompute){
    const gpu=sim.engine?.gpu||{},adapterLabel=gpu.state==='active'&&gpu.adapter?.label?` · ${gpu.adapter.label}`:'',gpuLabel=!sim.graph.full?'CPU · modello legacy':gpu.state==='active'?`GPU+CPU WebGPU${adapterLabel}`:gpu.state==='fallback'?'CPU fallback':gpu.state==='lost'?'CPU fallback · device GPU perso':'GPU ibrida in avvio';
    $('dataset-status').textContent=`${sim.graph.dataset} · ${sim.modelLabel||modelOption(activeModelId).name} · ${sim.graph.n.toLocaleString('it-IT')} neuroni · ${sim.graph.edgeCount.toLocaleString('it-IT')} connessioni · APP WINDOWS · ${sim.engine?.workerCount||'multi'} worker CPU · ${gpuLabel}`;
  } else {
    $('dataset-status').textContent=`${sim.graph.dataset} · ${sim.modelLabel||modelOption(activeModelId).name} · ${sim.graph.n.toLocaleString('it-IT')} neuroni · ${sim.graph.edgeCount.toLocaleString('it-IT')} connessioni · BROWSER`;
  }
  $('generation-value').textContent=pad(sim.generation);$('fitness-value').textContent=Math.round(leader.fitness)+' pt';$('trial-time').textContent=seconds(sim.elapsed);
  $('generation-note').textContent=sim.mode==='connectome'?'Massimo 2 giri. Selezione per punteggio netto: progresso nuovo, giri validi e ritmo, meno tutte le penalità. 0 giri: da −2.000 a −3.000 pt; giro più lento della generazione precedente: fino a −3.000 pt per giro.':'Prova senza limite temporale: termina quando le auto diventano inattive.';
  const learning=MaleCNSLearningMetrics.summarize(sim.history,sim.track),metres=n=>n===null?'—':`${Math.round(n).toLocaleString('it-IT')} m`;
  $('learning-distance').textContent=metres(learning.distance);$('learning-mean').textContent=metres(learning.meanDistance);$('learning-laps').textContent=`${learning.maxLaps} / 2`;$('learning-lap-time').textContent=lapClock(learning.lapTime);
  const trends={pending:'Servono 10 generazioni per confrontare due gruppi di 5.',improving:'Più strada nelle ultime 5 generazioni.',regressing:'Meno strada nelle ultime 5 generazioni.',stable:'Distanza stabile nelle ultime 5 generazioni.'};
  $('learning-trend').textContent=trends[learning.trend]+(learning.delta===null?'':` Mediana: ${metres(learning.previousMedian)} → ${metres(learning.recentMedian)}.`);$('learning-trend').dataset.trend=learning.trend;
  $('history-caption').textContent=learning.generation===null?'Nessuna generazione conclusa.':`Ultima gen. ${learning.generation} · ${learning.updates} aggiornamenti · ${learning.stagnation} gen. senza nuovo progresso · ${learning.immigrants} esploratori indipendenti`;
  $('alive-count').textContent=`${sim.cars.filter(c=>c.alive).length}/${sim.population} attive`;
  $('selected-agent-id').textContent='A-'+pad(car.id+1);$('selected-color-dot').style.background=COLORS[car.id%COLORS.length];
  $('agent-lap').textContent=car.laps;$('agent-speed').textContent=((car.vehicle?.speedMps||0)*3.6).toFixed(1)+' km/h';$('agent-lateral').textContent=car.alive?(car.diagnosticVehicle?'DIAGNOSTICA':'ATTIVA'):car.reason;
  refreshTrackWidth(car);
  refreshVehicle(car);
  refreshCarPreview(car);
  if(document.activeElement!==$('population-range'))$('population-range').value=String(sim.population);
  $('population-output').textContent=$('population-range').value+' AUTO';
  $('agent-g-force').textContent=(car.totalG??0).toFixed(2)+' G';$('agent-longitudinal-g').textContent=signedG(car.longitudinalG??0);$('agent-lateral-g').textContent=signedG(car.lateralG??0);$('agent-slip-angle').textContent=((car.slipAngle??0)*180/Math.PI).toFixed(1)+'°';
  $('agent-reward').textContent=signedPoints(car.reward);$('agent-penalty').textContent=`−${Math.round(car.penalty)} pt`;$('agent-score').textContent=`${Math.round(car.fitness)} pt`;
  refreshRewards(car);
  $('agent-last-lap').textContent=lapClock(car.lastLapTime);$('agent-best-lap').textContent=lapClock(car.bestLapTime);
  signal('input-left',car.inputs[1]);signal('input-center',car.inputs[3]);signal('input-right',car.inputs[5]);
  const physics=car.physicsInputs?.length===FlySim.PHYSICS_SENSOR_COUNT?car.physicsInputs:FlySim.physicsSense(car,sim.track);
  signal('physics-speed',physics[0]);signal('physics-long-g',physics[1],true);signal('physics-lateral-g',physics[2],true);signal('physics-total-g',physics[3]);signal('physics-slip',physics[4],true);signal('physics-yaw',physics[5],true);signal('physics-load',physics[6],true);signal('road-balance',physics[7],true);signal('road-preview',physics[8],true);signal('road-clearance',physics[9]);signal('road-width',physics[10]);
  for(const [i,id]of ['sensor-rpm','sensor-gear','sensor-rear-slip','sensor-front-slip','sensor-tyre-temp','sensor-brake-temp'].entries())signal(id,physics[11+i]||0,i===1||i===2||i===3);
  let activity=0;if(sim.graph.full){for(let i=0;i<car.brain.activeCount;i++)activity+=Math.abs(car.brain.activity[car.brain.active[i]]);activity/=Math.max(1,car.brain.activeCount);}else activity=car.brain.activity.reduce((s,v)=>s+Math.abs(v),0)/sim.graph.n;
  signal('input-curve',activity);if(car.brainSnapshot===false)$('input-curve-value').textContent='—';signal('output-steer',car.outputs[0],true);signal('output-throttle',car.outputs[1]);signal('output-brake',car.outputs[2]);
  $('neuron-readout').textContent=car.brainSnapshot===false?'In attesa del campione dell’auto selezionata.':sim.graph.outputMeta.map(node=>`${node.type} ${node.side} · ID ${node.bodyId}: ${car.brain.activity[node.index].toFixed(4)}`).join('\n');
  if(brainAtlas?.visible&&!$('brain-view').hidden)updateBrainMapActivity();
  const modelNote=sim.modelLabel||modelOption(activeModelId).label;
  const training=sim.learningStats||sim.optimizer?.metrics();
  $('mode-note').textContent=sim.mode==='connectome'?`Machine learning per ricompense · ${modelNote}. Sensori → sinapsi MaleCNS → attività ricorrente → sterzo/pedali appresi. Nessuna guida preimpostata. ${training?`${training.updates} aggiornamenti · ${training.episodes} episodi · ${training.parameters} parametri appresi. `:''}Le prime auto possono fermarsi o urtare; il miglioramento va misurato tra generazioni.`:sim.mode==='off'?'PROVA: rete spenta, tutti i comandi a zero. L’auto deve restare ferma.':'PROVA: acceleratore 70%, sterzo zero. L’auto deve andare dritta e urtare il bordo.';
  $('next-generation').disabled=sim.mode!=='connectome';$('save-progress').disabled=progressBusy||switchingModel||sim.mode!=='connectome';$('load-progress').disabled=progressBusy||switchingModel;$('agent-select').value=String(car.id);
  if(!modelTestBusy&&sim.generation!==savedGeneration){saveChampion();savedGeneration=sim.generation;}
  syncModelTestControls();history();
}
const rewardLabels={progress:'Strada nuova',checkpoints:'Checkpoint ordinati',lap:'Giri validi',pace:'Bonus ritmo',time:'Tempo trascorso',slowLap:'Giri lenti',reverse:'Retromarcia',risk:'Approccio rischioso',slip:'Perdita di controllo',collision:'Urto',offTrack:'Fuori pista',stall:'Senza progresso',slowProgress:'Ritmo inefficace',noLap:'Nessun giro',regression:'Più lento della generazione precedente',invalid:'Progresso non valido'};
let rewardRows=null;
function refreshRewards(car){
  if(!rewardRows){rewardRows=[];const list=$('reward-breakdown');for(const [group,keys]of [['rewards',FlySim.Rewards.rewardKeys],['penalties',FlySim.Rewards.penaltyKeys]])for(const key of keys){const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');label.textContent=rewardLabels[key];row.append(label,value);list.append(row);rewardRows.push({group,key,value});}}
  const known=Boolean(car.rewardBreakdown),gates=car.checkpoints??(car.rewardState?car.rewardState.nextCheckpoint-1:null);
  $('reward-context').textContent=known?`Checkpoint ${gates??'—'}/64 · punteggio stabile ${Math.round(car.baseFitness)} pt. Netto = ricompense − penalità.`:'Dettaglio in attesa del campione dell’auto selezionata.';
  const previous=car.previousGenerationLapTime;
  $('reward-reference').textContent=`Ritmo di riferimento ${lapClock(FlySim.Rewards.referenceLapTime(sim.track))} (taratura, non record reale). Generazione precedente: ${Number.isFinite(previous)?lapClock(previous):'nessun giro valido'}.`;
  for(const {group,key,value}of rewardRows)value.textContent=known?`${group==='rewards'?'+':'−'}${Math.round(car.rewardBreakdown[group][key]).toLocaleString('it-IT')} pt`:'—';
}
function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);canvasMetrics={width:rect.width,height:rect.height,dpr};canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));brainAtlas?.resize();circuit3D?.resize();historyKey='';renderDirty=true;render();history();}
function populateAgents(selection=null){
  $('agent-select').replaceChildren(...sim.cars.map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent='Auto A-'+pad(c.id+1);return option;}));agentSelection.reset();
  if(selection){agentSelection.automatic=selection.automatic;agentSelection.selectedId=selection.selectedId;}
  syncAgentSelection(true);
}
function syncAgentSelection(force=false){
  const car=agentSelection.update(sim.cars);if(!car)return;
  if(force||selectedId!==car.id){selectedId=car.id;sim.setInspectedAgent?.(selectedId);invalidateBrainMap();renderDirty=true;}
  const automatic=agentSelection.automatic,button=$('follow-best');button.setAttribute('aria-pressed',String(automatic));button.textContent=automatic?'Auto: migliore':'Auto: disattivata';
  $('agent-selection-note').textContent=automatic?(sim.cars.some(c=>c.alive)?'Selezione automatica della migliore auto attiva. Scegli un’auto per passare alla selezione manuale.':'Nessuna auto attiva: mostro la migliore finale della generazione. Scegli un’auto per passare alla selezione manuale.'):`Selezione manuale: A-${pad(selectedId+1)}. Premi “Auto: disattivata” per tornare alla migliore.`;
}
function inspectAgent(id){agentSelection.select(id);syncAgentSelection();refresh(true);}
function reset(){sim.reset();savedGeneration=0;selectedId=0;populateAgents();historyKey='';invalidateBrainMap();renderDirty=true;refresh(true);render();}
function circuitInfo(){
  const c=sim.circuit;$('circuit-select').value=c.id;$('simulation-title').textContent=c.id==='lab'?'Laboratorio di guida':c.name+' · simulazione';
  const changed=trackRenderer?.model?.id!==c.id;
  if(!trackRenderer)trackRenderer=new MaleCNSTracks.Renderer();
  trackRenderer.setTrack(sim.track,c);
  circuit3D?.setTrack(sim.track,trackRenderer.model,FlySim.onRoad);
  if(!trackCamera)trackCamera=new MaleCNSTracks.Camera(sim.track.bounds);else if(changed)trackCamera.setBounds(sim.track.bounds);
  if(changed){trackFocus='';trackPointers.clear();trackGesture=null;if(circuitView==='3d')circuit3D?.setMode(cameraSelect.value);else cameraSelect.value='overview';}
  $('track-landmark').replaceChildren(...[{value:'',label:'Intero circuito'},{value:'start',label:'Partenza / arrivo'},...c.landmarks.map((p,i)=>({value:String(i),label:p.label})),...sim.track.widthStations.map((p,i)=>({value:'width:'+i,label:`${p.label} · ${p.widthMeters.toLocaleString('it-IT')} m stimati`}))].map(p=>{const option=document.createElement('option');option.value=p.value;option.textContent=p.label;return option;}));
  $('track-landmark').value=trackFocus;$('track-model-note').textContent=trackRenderer.model.notice;
  const curbReference=trackRenderer.model.curbReference;$('track-curb-reference').hidden=!curbReference;
  if(curbReference){$('track-curb-source').href=curbReference.url;$('track-curb-source').textContent=curbReference.sourceLabel+' · riferimento cordoli ↗';}
  window.circuitLab.tracks=trackRenderer;window.circuitLab.trackCamera=trackCamera;
  $('circuit-description').textContent=c.description;
  const dimensions=sim.track.dimensions;
  $('track-dimensions').textContent=dimensions?`${number(dimensions.lengthMeters)} m / giro · carreggiata ${dimensions.widthRangeMeters.map(number).join('–')} m · ${sim.track.widthStations.length} tratti raccordati · larghezze stimate`:'Circuito sintetico · unità in metri';
  $('track-dimension-source').hidden=!dimensions;
  if(dimensions){$('track-dimension-source').href=dimensions.lengthSource;$('track-dimension-source').textContent='Fonte della lunghezza del giro ↗';}
  $('circuit-notice').textContent=(c.notice||'Tracciato originale del laboratorio, non basato su un autodromo reale.')+' '+sim.track.metricNotice;
  $('circuit-source').hidden=!c.url;
  if(c.url){$('circuit-source').href=c.url;$('circuit-source').textContent=c.sourceLabel+' ↗';}
  canvas.setAttribute('aria-label',`Circuito ${c.name}, mappa dall’alto in scala metrica${dimensions?', larghezze locali stimate':''}. Frecce per spostare, più e meno per zoom, Home per centrare. Usa il selettore Auto per ispezionare un agente.`);
}
function updateModelSummary(){
  MaleCNSModelComparison.update($('model-comparison-details'),activeModelId);
  window.circuitLab.tests={run:runModelTest,stop:()=>modelTestSuite?.stop(),get suite(){return modelTestSuite;},get busy(){return modelTestBusy;}};
  const graph=sim.graph,solver=graph.solver,solverNote=solver?.activeNeuronBudget?`Solver sparso: fino a ${solver.activeNeuronBudget.toLocaleString('it-IT')} slot per agente e passo, ${solver.iterationsPerControlTick} passaggi ricorrenti. Gli slot non sono neuroni aggiunti, né tutti necessariamente attivi.`:'Solver legacy: sottoinsieme ridotto aggiornato sul lato CPU.';
  $('model-capacity-note').textContent=graph.modelId==='v5'?'V5: stesso grafo reale da 166.700 neuroni del V4, fino a 32.768 slot per agente (4×). Decoder da 128 neuroni discendenti e 32 gruppi sinaptici appresi. Più capacità e più calcolo; non garantisce un apprendimento più rapido.':graph.full?'V4: grafo reale da 166.700 neuroni, fino a 8.192 slot per agente. Decoder da 64 neuroni discendenti e 16 gruppi sinaptici appresi.':`${sim.modelLabel}: sottoinsieme anatomico ridotto. Decoder da 64 neuroni discendenti e 16 gruppi sinaptici appresi.`;
  $('model-badge').textContent=`${activeModelId.toUpperCase()} · ${number(graph.n)} neuroni`;$('build-version').textContent=APP_VERSION;
  const learning=FlySim.ensureLearning(graph);$('data-counts').textContent=`${sim.modelLabel||modelOption(activeModelId).name}: ${graph.n.toLocaleString('it-IT')} neuroni e ${graph.edgeCount.toLocaleString('it-IT')} connessioni. Il decoder appreso legge ${learning.nodes.length} neuroni discendenti reali; ${learning.length} parametri e 28 sensori, nessuna traiettoria preimpostata. Rete a ${learning.controlRateHz} Hz, tick a 60 Hz e dinamica ruote a 240 Hz. Cambio automatico basato solo sui giri, non sulla pista. ${solverNote}`;
}
async function switchModel(modelId){
  if(switchingModel)return;
  if(modelId===activeModelId){sim.mode='connectome';sim.running=true;reset();return;}
  const previous=sim,previousModelId=activeModelId,previousValue=$('controller-select').value,wasRunning=previous.running;
  let next=null;
  switchingModel=true;$('controller-select').disabled=true;$('mode-note').textContent=`Caricamento ${modelOption(modelId).label}…`;
  previous.running=false;
  try{
    const data=await loadModelData(modelId);
    const options={circuits:MALE_CNS_CIRCUITS,circuitId:previous.circuitId,population:previous.population,mutation:previous.mutation,speedMultiplier:previous.speedMultiplier,modelId,modelLabel:modelOption(modelId).name};
    next=globalThis.desktopCompute?new FlySim.DesktopSimulation(data,options):new FlySim.Simulation(data,options);
    if(globalThis.desktopCompute)await next.ready();
    previous?.dispose?.(false);
    sim=next;activeModelId=modelId;saveModelPreference(modelId);selectedId=0;savedGeneration=0;lastTime=0;historyKey='';invalidateBrainMap();renderDirty=true;
    window.circuitLab={sim,version:APP_VERSION,data,modelId};
    $('controller-select').value=modelId;populateAgents();buildBrainMap();updateModelSummary();circuitInfo();refresh(true);render();
  }catch(error){
    next?.dispose?.();
    sim=previous;activeModelId=previousModelId;$('controller-select').value=previousValue;previous.running=wasRunning;$('mode-note').textContent=`Cambio modello non riuscito: ${error.message}`;refresh(true);
  }finally{
    $('controller-select').disabled=false;switchingModel=false;refresh(true);
  }
}
function progressStatus(message,error=false){const status=$('progress-status');status.textContent=message;status.dataset.error=String(error);}
async function progressOperation(task){
  if(progressBusy||switchingModel||modelTestBusy)return;
  const main=document.querySelector('main'),focus=document.activeElement;
  progressBusy=true;main.inert=true;main.setAttribute('aria-busy','true');refresh(true);
  try{await task();}catch(error){progressStatus(error.message,true);}
  finally{progressBusy=false;main.inert=false;main.setAttribute('aria-busy','false');refresh(true);focus?.focus?.({preventScroll:true});}
}
async function saveProgress(){
  await progressOperation(async()=>{
    progressStatus('Preparazione del file progressi…');
    if(globalThis.desktopProgress){
      const result=await desktopProgress.save();
      if(result.canceled){progressStatus('Salvataggio annullato. La prova continua senza modifiche.');return;}
      progressStatus(`Salvato ${result.name} · ${result.workers} worker · app ${APP_VERSION}. Puoi condividere questo file.`);
    }else{
      const payload=MaleCNSProgress.fromSimulation(sim),text=await MaleCNSProgress.encode(payload,APP_VERSION),name=MaleCNSProgress.filename(payload,APP_VERSION);
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      progressStatus(`Download preparato: ${name}. La scrittura sul disco dipende dal browser.`);
    }
  });
}
async function importProgress(file,name){
  const p=file.payload,modelId=p.modelId,s=p.workers[0].state,data=await loadModelData(modelId);
  const graph=FlySim.compileGraph(data);
  MaleCNSProgress.validatePayload(p,{graph,circuits:sim.circuits,maxWorkers:globalThis.desktopCompute?MaleCNSProgress.MAX_WORKERS:1});
  const previous=sim;let next=null;
  try{
    const options={circuits:MALE_CNS_CIRCUITS,circuitId:p.circuitId,population:s.population,mutation:s.mutation,speedMultiplier:s.speedMultiplier,modelId,modelLabel:modelOption(modelId).name,progress:file};
    next=globalThis.desktopCompute?new FlySim.DesktopSimulation(data,options):new FlySim.Simulation(data,options);
    if(globalThis.desktopCompute)await next.ready();else MaleCNSProgress.restore(next,s);
    previous?.dispose?.(false);sim=next;activeModelId=modelId;
    saveModelPreference(modelId);saveSpeedPreference(s.speedMultiplier);try{localStorage.setItem(PREFERENCE_KEY,p.circuitId);}catch{}
    selectedId=0;savedGeneration=sim.generation;lastTime=0;historyKey='';invalidateBrainMap();renderDirty=true;
    window.circuitLab={sim,version:APP_VERSION,data,modelId};
    $('controller-select').value=modelId;$('population-range').value=String(s.population);$('mutation-range').value=String(s.mutation*100);$('mutation-output').textContent=(s.mutation*100)+'%';
    $('speed-range').value=String(s.speedMultiplier);populateAgents();buildBrainMap();updateModelSummary();circuitInfo();refresh(true);render();
    progressStatus(`Caricato ${name} · ${modelId.toUpperCase()} · ${sim.circuit.name} · gen. ${sim.generation} · ${p.workers.length} worker · app ${APP_VERSION}. In pausa: premi Riprendi.`);
  }catch(error){next?.dispose?.(false);await previous.reconnect?.();sim=previous;throw error;}
}
function initProgressControls(){
  $('save-progress').onclick=saveProgress;
  $('load-progress').onclick=()=>{
    if(!globalThis.desktopProgress){if(progressBusy||switchingModel)return;$('progress-file-input').value='';$('progress-file-input').click();return;}
    progressOperation(async()=>{progressStatus('Scelta e verifica del salvataggio…');const result=await desktopProgress.open();if(result.canceled){progressStatus('Caricamento annullato. La prova corrente è rimasta intatta.');return;}await importProgress(result.file,result.name);});
  };
  $('progress-file-input').onchange=event=>{
    const selectedFile=event.target.files?.[0];if(!selectedFile)return;
    progressOperation(async()=>{
      if(selectedFile.size>MaleCNSProgress.MAX_BYTES)throw Error('File troppo grande: massimo 16 MiB.');
      const file=await MaleCNSProgress.decode(await selectedFile.text(),APP_VERSION);
      if(file.payload?.workers?.length!==1)throw Error('Questo file contiene più worker. Caricalo nell’app Windows per conservarli tutti.');
      if(!confirm('Sostituire la prova corrente con '+selectedFile.name+'? Ripartirà in pausa dalla partenza della generazione salvata.')){progressStatus('Caricamento annullato. La prova corrente è rimasta intatta.');return;}
      await importProgress(file,selectedFile.name);
    });
  };
}
const testLabels={pending:'In attesa',loading:'Caricamento',running:'In prova',completed:'2 giri + generazione',limit:'Limite reale raggiunto',stopped:'Interrotto',error:'Errore', 'not-run':'Non eseguito'};
function syncModelTestControls(){
  const locked=modelTestBusy||progressBusy||switchingModel;
  for(const id of ['controller-select','population-range','mutation-range','speed-range','circuit-select','reset-sim','toggle-run','vehicle-gearbox','vehicle-abs','vehicle-tc'])$(id).disabled=locked;
  $('open-model-test').disabled=progressBusy||switchingModel;
  $('next-generation').disabled=locked||sim.mode!=='connectome';
  $('save-progress').disabled=locked||sim.mode!=='connectome';$('load-progress').disabled=locked;
  if(locked){$('gear-up').disabled=true;$('gear-down').disabled=true;}
  $('model-test-start').disabled=locked;$('model-test-limit').disabled=locked;
  $('model-test-stop').disabled=!modelTestBusy||Boolean(modelTestSuite?.stopRequested);
  $('model-test-export').disabled=modelTestBusy||!modelTestSuite?.finishedAt;
  const s=modelTestBusy?modelTestSuite?.settings:null;
  $('model-test-settings').textContent=`V2 → V3 → V4 → V5 · ${s?sim.circuits.find(c=>c.id===s.circuitId)?.name:sim.circuit.name} · ${s?.population??sim.population} agenti · mutazione ${Math.round((s?.mutation??sim.mutation)*100)}% · ${s?.speedMultiplier??sim.speedMultiplier}× richiesti · seed 7717 · un worker. Partenza da zero, nessun campione importato.`;
}
function updateModelTestResults(suite){
  for(let i=0;i<modelTestRows.length;i++){
    const item=suite?.cases[i]||{modelId:MaleCNSModelTest.MODELS[i],status:'pending'},cells=modelTestRows[i].cells;
    modelTestRows[i].dataset.status=item.status;
    cells[1].textContent=testLabels[item.status]||item.status;
    if(item.hit)cells[1].textContent+=` · gen. ${item.hit.generation}, A-${pad(item.hit.agentId+1)}`;
    cells[1].title=item.error||'';
    if(item.error){const error=document.createElement('small');error.textContent=item.error;cells[1].append(error);}
    cells[2].textContent=lapClock(item.wallSeconds);cells[3].textContent=lapClock(item.simSeconds);
    cells[4].textContent=item.generations??'—';cells[5].textContent=item.maxLaps??'—';cells[6].textContent=lapClock(item.hit?.twoLapSimSeconds);
    if(item.hit){const note=document.createElement('small');note.textContent=`${lapClock(item.hit.lapTimes[0])} + ${lapClock(item.hit.lapTimes[1])}`;cells[6].append(note);}
  }
  if(suite){
    const config=suite.settings,name=sim.circuits.find(c=>c.id===config.circuitId)?.name||config.circuitId;
    const limitLabel=config.limitSeconds===0?'senza limite':config.limitSeconds<60?`${config.limitSeconds.toLocaleString('it-IT')} s reali per modello`:`${(config.limitSeconds/60).toLocaleString('it-IT',{maximumFractionDigits:2})} min reali per modello`;
    $('model-test-caption').textContent=`Risultati: ${name} · ${config.population} agenti · mutazione ${Math.round(config.mutation*100)}% · ${config.speedMultiplier}× richiesti · ${limitLabel}.`;
    const current=suite.cases.find(c=>c.status==='running'||c.status==='loading'),done=suite.cases.filter(c=>c.status==='completed').length;
    const text=suite.active?(suite.stopRequested?'Interruzione del test e ripristino della prova corrente…':`${current?.modelId.toUpperCase()||'Test'}: ${current?.status==='loading'?'caricamento escluso dal cronometro':`generazione ${current?.currentGeneration||1}, ${current?.maxLaps||0}/2 giri massimi`}. Addestramento normale in pausa.`):modelTestBusy?'Test terminato. Ripristino della prova precedente…':`Test ${suite.stopRequested?'interrotto':'concluso'}: ${done}/4 modelli hanno completato due giri e la generazione. Gli altri esiti non sono successi. Prova precedente ripristinata.`;
    if($('model-test-status').textContent!==text)$('model-test-status').textContent=text;
  }
  syncModelTestControls();
}
async function testUntil(predicate,timeout=12000){
  const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw Error('Il motore del test non ha confermato il comando.');await new Promise(resolve=>setTimeout(resolve,25));}
}
function showTestSimulation(next,modelId,data,selection=null){
  sim=next;activeModelId=modelId;selectedId=selection?.selectedId??0;lastTime=0;historyKey='';invalidateBrainMap();renderDirty=true;
  window.circuitLab={sim,version:APP_VERSION,data,modelId};$('controller-select').value=modelId;
  populateAgents(selection);buildBrainMap();updateModelSummary();circuitInfo();refresh(true);render();
}
async function runModelTest(overrides=null){
  if(modelTestBusy||progressBusy||switchingModel)return;
  if(!overrides&&!$('model-test-limit').reportValidity())return;
  const normal=sim,normalModel=activeModelId,normalData=window.circuitLab.data,normalRunning=sim.running,normalMode=$('controller-select').value;
  const normalSelection={automatic:agentSelection.automatic,selectedId:agentSelection.selectedId};
  const options=MaleCNSModelTest.settings({circuitId:normal.circuitId,population:normal.population,mutation:normal.mutation,speedMultiplier:normal.speedMultiplier,limitSeconds:Number($('model-test-limit').value)*60,...overrides});
  modelTestBusy=true;$('model-test-panel').open=true;$('model-test-status').dataset.error='false';
  modelTestSuite=new MaleCNSModelTest.Suite({options,version:APP_VERSION,onChange:updateModelTestResults,create:async(modelId,shared)=>{
    const data=await loadModelData(modelId),next=globalThis.desktopTest?new FlySim.DesktopSimulation(data,{...shared,circuits:MALE_CNS_CIRCUITS,modelId,modelLabel:modelOption(modelId).name,desktopClient:desktopTest,running:false}):new FlySim.Simulation(data,{...shared,circuits:MALE_CNS_CIRCUITS,modelId,modelLabel:modelOption(modelId).name});
    let trial=null;
    try{if(globalThis.desktopTest)await next.ready();else next.running=false;}
    catch(error){if(globalThis.desktopTest)await desktopTest.stop();next.dispose?.(false);throw error;}
    showTestSimulation(next,modelId,data);
    return {
      async begin(){
        if(globalThis.desktopTest){await desktopTest.command({type:'beginModelTest',options:shared});await testUntil(()=>next.modelTest||next.computeError);if(next.computeError)throw Error(next.computeError);}
        else{trial=new MaleCNSModelTest.Trial(shared,performance.now());trial.backend='CPU (browser)';next.onTrialTick=s=>{trial.observe(s,performance.now(),FlySim.DT);if(trial.done)next.running=false;};next.running=true;}
      },
      read(){if(next.computeError)throw Error(next.computeError);if(globalThis.desktopTest)return next.modelTest||{status:'running'};if(trial.checkLimit(performance.now()))next.running=false;return trial.snapshot(performance.now());},
      async cancel(){
        if(globalThis.desktopTest){await desktopTest.command({type:'cancelModelTest'});if(next.modelTest){await testUntil(()=>next.modelTest.status!=='running');return next.modelTest;}}
        else{trial?.finish('stopped',performance.now());next.running=false;if(trial)return trial.snapshot(performance.now());}
        return {status:'stopped',wallSeconds:0,simSeconds:0};
      },
      async dispose(){
        if(globalThis.desktopTest)await desktopTest.stop();
        await next.gpu?.requestTail?.catch(()=>{});next.running=false;next.dispose?.(false);
      }
    };
  }});
  updateModelTestResults(modelTestSuite);
  try{
    normal.running=false;
    if(globalThis.desktopCompute){await desktopCompute.command({type:'pause',value:false});await testUntil(()=>normal._pendingRunning===null&&!normal.running);}
    await modelTestSuite.run();
  }catch(error){$('model-test-status').textContent=`Test non riuscito: ${error.message}. La prova precedente viene ripristinata.`;$('model-test-status').dataset.error='true';}
  finally{
    if(globalThis.desktopTest)await desktopTest.stop();
    await normal.reconnect?.();showTestSimulation(normal,normalModel,normalData,normalSelection);$('controller-select').value=normalMode;
    normal.running=normalRunning;modelTestBusy=false;lastTime=0;refresh(true);render();
    updateModelTestResults(modelTestSuite);
  }
  return modelTestSuite.report();
}
function revealModelTest(){
  const panel=$('model-test-panel');
  panel.open=true;$('open-model-test').setAttribute('aria-expanded','true');
  panel.scrollIntoView({block:'start',behavior:'auto'});
  const action=$(modelTestBusy?'model-test-stop':'model-test-start');
  (action.disabled?panel.querySelector('summary'):action).focus({preventScroll:true});
}
function initModelTestControls(){
  $('open-model-test').onclick=revealModelTest;
  $('model-test-panel').ontoggle=()=>$('open-model-test').setAttribute('aria-expanded',String($('model-test-panel').open));
  const body=$('model-test-results');
  modelTestRows=MaleCNSModelTest.MODELS.map(modelId=>{const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.textContent=modelId.toUpperCase();row.append(heading);for(let i=0;i<6;i++)row.append(document.createElement('td'));body.append(row);return row;});
  $('model-test-start').onclick=()=>runModelTest().catch(error=>{$('model-test-status').textContent=error.message;$('model-test-status').dataset.error='true';});
  $('model-test-stop').onclick=()=>{modelTestSuite?.stop();syncModelTestControls();};
  $('model-test-export').onclick=async()=>{
    try{const report=modelTestSuite.report();if(globalThis.desktopTest){const result=await desktopTest.saveReport(report);$('model-test-status').textContent=result.canceled?'Esportazione annullata. Risultati conservati.':`Rapporto salvato: ${result.name}. Risultati conservati.`;}
      else{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`malecns-test-2-giri-${report.settings.circuitId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
    }catch(error){$('model-test-status').textContent=`Esportazione non riuscita: ${error.message}. Puoi riprovare.`;$('model-test-status').dataset.error='true';}
  };
  updateModelTestResults(null);
}
function frame(time){
  const wasRunning=sim.running;if(lastTime)sim.advance(Math.min(0.1,(time-lastTime)/1000));lastTime=time;
  if(wasRunning&&!sim.running)renderDirty=true;
  const renderInterval=circuitView==='3d'||sim.running&&sim.speedMultiplier>=8?1000/30:0;
  if(!$('circuit-view').hidden&&(sim.running?(renderDirty||renderInterval===0||time-lastRenderTime>=renderInterval):(renderDirty||circuit3D?.dirty&&circuitView==='3d')))render();
  if(brainAtlas?.visible&&brainAtlas.dirty&&!$('brain-view').hidden)brainAtlas.render(time);
  refresh();requestAnimationFrame(frame);
}
async function start(){try{
  if(!globalThis.MALE_CNS_CIRCUITS?.circuits?.length)throw Error('Catalogo circuiti mancante.');
  $('dataset-status').textContent='Caricamento 166.700 neuroni MaleCNS…';
  carRenderer.load('assets/porsche-992-gt3r-top-v1.png',COLORS).then(()=>{carPreviewKey='';renderDirty=true;if(sim?.cars?.length&&window.circuitLab&&trackRenderer){render();refresh(true);}});
  runtimeData=await MaleCNSFull.load();
  let circuitId='lab';try{const saved=localStorage.getItem(PREFERENCE_KEY);if(MALE_CNS_CIRCUITS.circuits.some(c=>c.id===saved))circuitId=saved;}catch{}
  const savedSpeed=readSpeedPreference();$('speed-range').value=String(savedSpeed);$('speed-output').textContent=savedSpeed.toFixed(1)+'×';
  activeModelId=readModelPreference();$('controller-select').value=activeModelId;
  const initialData=await loadModelData(activeModelId);
  const simulationOptions={circuits:MALE_CNS_CIRCUITS,circuitId,population:Number($('population-range').value),speedMultiplier:savedSpeed,modelId:activeModelId,modelLabel:modelOption(activeModelId).name};
  sim=globalThis.desktopCompute?new FlySim.DesktopSimulation(initialData,simulationOptions):new FlySim.Simulation(initialData,simulationOptions);
  if(globalThis.desktopCompute)await sim.ready();
  window.circuitLab={sim,version:APP_VERSION,data:initialData,modelId:activeModelId};
  buildBrainMap();initBrainMapControls();initTrackControls();initVehicleControls();initProgressControls();initModelTestControls();
  $('car-closeup').onclick=closeUpCar;
  $('circuit-select').replaceChildren(...sim.circuits.map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.name;return option;}));
  circuitInfo();
  $('circuit-select').onchange=e=>{
    saveChampion();sim.setCircuit(e.target.value);savedGeneration=0;lastTime=0;historyKey='';invalidateBrainMap();renderDirty=true;populateAgents();circuitInfo();refresh(true);render();
    try{localStorage.setItem(PREFERENCE_KEY,sim.circuitId);}catch{}
  };
  $('camera-select').onchange=()=>{trackFocus='';$('track-landmark').value='';circuit3D?.setMode(cameraSelect.value);refreshTrackWidth();renderDirty=true;render();};
  $('history-mode').onchange=()=>{historyKey='';history();};
  updateModelSummary();refresh(true);
  $('toggle-run').onclick=()=>{sim.running=!sim.running;lastTime=0;invalidateBrainMap();renderDirty=true;refresh(true);render();};$('reset-sim').onclick=reset;$('next-generation').onclick=()=>{sim.evolve();invalidateBrainMap();renderDirty=true;refresh(true);render();};
  $('toggle-sensors').onclick=e=>{showSensors=!showSensors;e.currentTarget.textContent=showSensors?'Nascondi sensori':'Mostra sensori';e.currentTarget.setAttribute('aria-pressed',String(showSensors));renderDirty=true;render();};
  $('population-range').oninput=e=>{$('population-output').textContent=e.target.value+' AUTO';};$('population-range').onchange=e=>{sim.population=Number(e.target.value);reset();};
  $('mutation-range').oninput=e=>{sim.mutation=Number(e.target.value)/100;$('mutation-output').textContent=e.target.value+'%';};
  $('speed-range').oninput=e=>{const speed=normalizeSpeed(e.target.value);e.target.value=String(speed);sim.speedMultiplier=speed;saveSpeedPreference(speed);syncSpeedControl();};
  $('controller-select').onchange=async e=>{
    const value=e.target.value;
    if(value==='off'||value==='straight'){sim.mode=value;sim.running=true;reset();return;}
    if(value===activeModelId){sim.mode='connectome';sim.running=true;reset();return;}
    await switchModel(value);
  };
  $('agent-select').onchange=e=>inspectAgent(Number(e.target.value));$('follow-best').onclick=()=>{agentSelection.toggle();syncAgentSelection();refresh(true);render();};
  if(globalThis.desktopCompute)window.addEventListener('desktop-compute-error',event=>{$('run-state').textContent='ERRORE WORKER';$('mode-note').textContent=event.detail||'Errore del motore desktop.';});
  document.addEventListener('visibilitychange',()=>{lastTime=0;});window.addEventListener('resize',resize);populateAgents();refresh(true);showWorkspace('circuit');await setCircuitView('3d');resize();document.querySelector('main').inert=false;document.querySelector('main').setAttribute('aria-busy','false');requestAnimationFrame(frame);
}catch(error){
  $('run-state').textContent='ERRORE DATI';$('dataset-status').textContent='Dataset non caricato';$('mode-note').textContent=error.message+' Riapri l’app con tutti i file della cartella outputs.';
  document.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);console.error(error);
  document.querySelector('main').inert=false;document.querySelector('main').setAttribute('aria-busy','false');
}}
start();
