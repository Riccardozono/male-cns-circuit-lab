'use strict';
const {Worker,isMainThread,parentPort}=require('node:worker_threads'),G=require('./guard-memory-runtime.cjs');
if(!isMainThread){
  const sim=G.create();parentPort.on('message',m=>{try{parentPort.postMessage({id:m.id,result:G.replay(sim,m.genome,m.centres,m.weights,{state:m.state,startTicks:m.startTicks,decay:m.decay})});}catch(error){parentPort.postMessage({id:m.id,error:error.stack});}});
}
class TrialPool{
  constructor(count=2){if(!Number.isInteger(count)||count<1||count>3)throw Error('Invalid physical trial worker count');this.nextId=0;this.slots=[];
    for(let k=0;k<count;k++){const thread=new Worker(__filename),pending=new Map();thread.on('message',m=>{const job=pending.get(m.id);if(!job)return;pending.delete(m.id);m.error?job.reject(Error(m.error)):job.resolve(m.result);});thread.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});thread.on('exit',code=>{if(pending.size){for(const job of pending.values())job.reject(Error('Physical worker terminated: '+code));pending.clear();}});this.slots.push({thread,pending});}
  }
  one(slot,options){return new Promise((resolve,reject)=>{const id=++this.nextId;slot.pending.set(id,{resolve,reject});slot.thread.postMessage({id,...options});});}
  async batch(candidates,{genome,centres,prefix,decay}){
    let next=0;await Promise.all(this.slots.map(async slot=>{while(next<candidates.length){const candidate=candidates[next++];candidate.episode=await this.one(slot,{genome,centres,weights:candidate.weights,decay,state:prefix.state,startTicks:prefix.ticks});}}));return candidates;
  }
  async close(){await Promise.all(this.slots.map(slot=>slot.thread.terminate()));}
}
module.exports={TrialPool};
