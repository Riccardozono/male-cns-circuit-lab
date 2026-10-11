'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const Progress=require('../outputs/progress-save.js');
class ProgressFiles{
  constructor({engine,dialog,window,version}){this.engine=engine;this.dialog=dialog;this.window=window;this.version=version;this.busy=false;}
  async save(){
    if(this.busy)throw Error('Un’altra operazione sui progressi è in corso.');this.busy=true;
    try{
      const payload=await this.engine.exportProgress(),text=await Progress.encode(payload,this.version);
      const selection=await this.dialog.showSaveDialog(this.window,{title:'Salva progressi · Circuit Lab '+this.version,defaultPath:Progress.filename(payload,this.version),filters:[{name:'Progressi Circuit Lab '+this.version,extensions:[Progress.EXTENSION]}],properties:['createDirectory','showOverwriteConfirmation']});
      if(selection.canceled||!selection.filePath)return {canceled:true};
      let target=path.resolve(selection.filePath);if(path.extname(target).toLowerCase()!=='.'+Progress.EXTENSION)target+='.'+Progress.EXTENSION;
      if(target!==path.resolve(selection.filePath)&&await fs.stat(target).then(()=>true,()=>false)){
        const overwrite=await this.dialog.showMessageBox(this.window,{type:'question',title:'Sostituire il file?',message:path.basename(target),detail:'Il file con estensione .malecns-save esiste già. Vuoi sostituirlo?',buttons:['Sostituisci','Annulla'],defaultId:1,cancelId:1,noLink:true});
        if(overwrite.response!==0)return {canceled:true};
      }
      const temporary=path.join(path.dirname(target),'.'+path.basename(target)+'.'+randomUUID()+'.tmp');
      try{await fs.writeFile(temporary,text,{encoding:'utf8',flag:'wx',mode:0o600});await fs.rename(temporary,target);}
      catch(error){await fs.unlink(temporary).catch(()=>{});throw Error('Salvataggio non scritto: '+error.message);}
      return {canceled:false,name:path.basename(target),appVersion:this.version,modelId:payload.modelId,circuitId:payload.circuitId,generation:payload.workers[0].state.generation,workers:payload.workers.length};
    }finally{this.busy=false;}
  }
  async open(){
    if(this.busy)throw Error('Un’altra operazione sui progressi è in corso.');this.busy=true;
    try{
      const selection=await this.dialog.showOpenDialog(this.window,{title:'Carica progressi · solo versione '+this.version,filters:[{name:'Progressi Circuit Lab',extensions:[Progress.EXTENSION]}],properties:['openFile']});
      if(selection.canceled||!selection.filePaths?.length)return {canceled:true};
      const target=path.resolve(selection.filePaths[0]);
      // Bounded read from one opened handle, even if a selected file grows
      // after stat. Never read an arbitrary-size JSON into the main process.
      const handle=await fs.open(target,'r');let text;
      try{
        const stat=await handle.stat();if(!stat.isFile()||stat.size>Progress.MAX_BYTES)throw Error('File non valido o troppo grande: massimo 16 MiB.');
        const buffer=Buffer.alloc(Math.min(stat.size+1,Progress.MAX_BYTES+1));let length=0;
        while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,null);if(!bytesRead)break;length+=bytesRead;}
        if(length>stat.size||length>Progress.MAX_BYTES)throw Error('Il file è cambiato durante la lettura o è troppo grande. Riprova.');
        text=buffer.subarray(0,length).toString('utf8');
      }finally{await handle.close();}
      const file=await Progress.decode(text,this.version);await this.engine.validateProgress(file.payload);
      const p=file.payload,choice=await this.dialog.showMessageBox(this.window,{type:'question',title:'Caricare questa prova?',message:path.basename(target),detail:'Versione '+this.version+' · '+p.modelId.toUpperCase()+' · '+p.circuitId+' · generazione '+p.workers[0].state.generation+' · '+p.workers.length+' worker.\nSostituisce la prova corrente. Le auto ripartono dalla partenza della generazione salvata, in pausa; apprendimento e storico restano salvati.',buttons:['Carica e sostituisci la prova','Annulla'],defaultId:1,cancelId:1,noLink:true});
      return choice.response!==0?{canceled:true}:{canceled:false,name:path.basename(target),file};
    }finally{this.busy=false;}
  }
}
module.exports={ProgressFiles};
