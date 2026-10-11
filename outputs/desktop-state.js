(function(root){
  'use strict';
  // GPU agents need an activity mirror for motor decoding, not a duplicate
  // CPU solver with sums, marks and a second full connectome activity array.
  // Uninspected renderer cars need no neural buffers at all.
  function mirrorBrain(graph,includeActivity=true){
    const brain={activity:graph.full?new Float32Array(includeActivity?graph.n:0):new Float64Array(includeActivity?graph.n:0),external:true};
    if(graph.full)Object.assign(brain,{active:new Uint32Array(includeActivity?(graph.solver?.activeNeuronBudget||graph.n):0),activeCount:0,peakActiveCount:0,lastTouchedCount:0});
    return brain;
  }
  function restoreBrain(F,graph,brain){
    const next=F.makeBrain(graph),indices=brain.active.subarray(0,brain.activeCount);
    F.applyNeuralState(graph,next,indices,Float32Array.from(indices,index=>brain.activity[index]));
    return next;
  }
  function packetLayout(capacity,readoutCount,activeBudget){
    const slots=capacity*readoutCount+activeBudget;
    return {capacity,readoutCount,activeBudget,slots,indicesBase:capacity,valuesBase:capacity+slots,bytes:(capacity+slots*2)*4};
  }
  function inspectedPosition(request,population){
    const id=Number(request.inspectedAgentId??0),ids=request.agentIds||[];
    for(let index=0;index<population;index++)if(Number(ids[index]??index)===id)return index;
    return 0;
  }
  function decodePacket(words,layout,request,population){
    if(words.byteLength<layout.bytes)throw Error('Pacchetto GPU incompleto.');
    const values=new Float32Array(words.buffer,words.byteOffset+layout.valuesBase*4,layout.slots),selected=inspectedPosition(request,population),agents=[];
    for(let index=0;index<population;index++){
      const inspected=index===selected,count=Math.min(inspected?layout.activeBudget:layout.readoutCount,words[index]);
      const offset=inspected?layout.capacity*layout.readoutCount:index*layout.readoutCount;
      agents.push({id:Number(request.agentIds?.[index]??index),active:words.slice(layout.indicesBase+offset,layout.indicesBase+offset+count),values:values.slice(offset,offset+count)});
    }
    return agents;
  }
  function nextDelay(running,accumulator,speed,dt){
    if(!running)return 50;
    if(accumulator>=dt-1e-10)return 0;
    return Math.min(25,Math.max(1,Math.ceil((dt-accumulator)*1000/speed)));
  }
  const api={mirrorBrain,restoreBrain,packetLayout,inspectedPosition,decodePacket,nextDelay};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MaleCNSDesktopState=api;
})(typeof globalThis!=='undefined'?globalThis:this);
