'use strict';

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('desktopCompute', {
  start: options => ipcRenderer.invoke('compute:start', options || {}),
  restoreProgress: (file,rendererToken) => ipcRenderer.invoke('compute:restore-progress', file,rendererToken),
  loadTrainingDefault: () => ipcRenderer.invoke('training-copy:load-default'),
  command: command => ipcRenderer.invoke('compute:command', command || {}),
  info: () => ipcRenderer.invoke('compute:info'),
  onSnapshot(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('compute:snapshot', listener);
    return () => ipcRenderer.removeListener('compute:snapshot', listener);
  },
  onError(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('compute:error', listener);
    return () => ipcRenderer.removeListener('compute:error', listener);
  },
  onGpuRequest(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('compute:gpu-request', listener);
    return () => ipcRenderer.removeListener('compute:gpu-request', listener);
  },
  gpuResponse(payload) {
    return ipcRenderer.invoke('compute:gpu-response', payload || {});
  }
});

async function progressFileCall(channel){const result=await ipcRenderer.invoke(channel);if(result.error)throw Error(result.error);return result;}
contextBridge.exposeInMainWorld('desktopTest', {
  start:options=>ipcRenderer.invoke('test:start',options),
  command:command=>ipcRenderer.invoke('test:command',command),
  info:()=>ipcRenderer.invoke('test:info'),
  stop:()=>ipcRenderer.invoke('test:stop'),
  saveReport:report=>ipcRenderer.invoke('test:save-report',report),
  gpuResponse:payload=>ipcRenderer.invoke('test:gpu-response',payload),
  onSnapshot(callback){const listener=(_event,payload)=>callback(payload);ipcRenderer.on('test:snapshot',listener);return()=>ipcRenderer.removeListener('test:snapshot',listener);},
  onError(callback){const listener=(_event,payload)=>callback(payload);ipcRenderer.on('test:error',listener);return()=>ipcRenderer.removeListener('test:error',listener);},
  onGpuRequest(callback){const listener=(_event,payload)=>callback(payload);ipcRenderer.on('test:gpu-request',listener);return()=>ipcRenderer.removeListener('test:gpu-request',listener);}
});
contextBridge.exposeInMainWorld('desktopProgress', {
  save: () => progressFileCall('progress:save'),
  open: () => progressFileCall('progress:open')
});
