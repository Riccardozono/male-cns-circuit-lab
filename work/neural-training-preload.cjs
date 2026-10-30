'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopCompute',{
  start:options=>ipcRenderer.invoke('compute:start',options||{}),
  command:command=>ipcRenderer.invoke('compute:command',command||{}),info:()=>ipcRenderer.invoke('compute:info'),
  restoreProgress:()=>Promise.reject(Error('Il formato sperimentale è separato: usa l’app normale per .malecns-save.')),
  onSnapshot(cb){const fn=(_e,p)=>cb(p);ipcRenderer.on('compute:snapshot',fn);return ()=>ipcRenderer.removeListener('compute:snapshot',fn);},
  onError(cb){const fn=(_e,p)=>cb(p);ipcRenderer.on('compute:error',fn);return ()=>ipcRenderer.removeListener('compute:error',fn);},
  onGpuRequest(){return ()=>{};},gpuResponse:()=>Promise.resolve()
});
contextBridge.exposeInMainWorld('desktopProgress',{
  save:()=>Promise.reject(Error('Usa Salva apprendimento nel prototipo; il formato normale non è compatibile.')),
  open:()=>Promise.reject(Error('Apri i salvataggi standard nell’app normale.'))
});
contextBridge.exposeInMainWorld('nativeLearningProgress',{save:()=>ipcRenderer.invoke('native-learning:save'),open:()=>ipcRenderer.invoke('native-learning:open')});
