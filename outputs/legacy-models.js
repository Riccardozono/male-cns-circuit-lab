(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSLegacy=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  // V3 is the audited reduced graph that was already shipped before the full
  // V4 bundle. V2 is regenerated deterministically from that graph because
  // the original V2 JSON is not present in the current workspace anymore.
  const V2_NODE_COUNT=1121;
  const V2_INPUT_COUNT=790;

  function tagV3(source){
    if(!source?.nodes?.length||!source?.edges?.length)throw Error('Modello MaleCNS V3 non disponibile.');
    return {...source,
      modelId:'v3',
      modelLabel:'MaleCNS V3 storico',
      modelBoundary:'Nucleo V3 ridotto verificato del progetto: 7.721 neuroni e 242.486 connessioni. Non è il grafo completo V4.'
    };
  }

  function buildV2(source){
    const base=tagV3(source),nodeCount=base.nodes.length;
    if(nodeCount<V2_NODE_COUNT)throw Error('Il nucleo V3 non contiene abbastanza neuroni per ricostruire il profilo V2.');
    const inputSet=new Set(base.inputIndices),outputSet=new Set(base.outputIndices);
    const indegree=new Uint32Array(nodeCount),outdegree=new Uint32Array(nodeCount);
    for(const edge of base.edges){indegree[edge[1]]++;outdegree[edge[0]]++;}
    const importance=index=>Math.log1p(indegree[index])+Math.log1p(outdegree[index]);
    const rank=indices=>indices.slice().sort((a,b)=>importance(b)-importance(a)||a-b);
    const selectedInputs=rank(base.inputIndices).slice(0,V2_INPUT_COUNT);
    const selectedNonInputs=rank(Array.from({length:nodeCount},(_,index)=>index).filter(index=>!inputSet.has(index)&&!outputSet.has(index))).slice(0,V2_NODE_COUNT-V2_INPUT_COUNT-base.outputIndices.length);
    const selected=new Set([...selectedInputs,...selectedNonInputs,...base.outputIndices]);
    const originalIndices=Array.from(selected).sort((a,b)=>a-b),remap=new Map(originalIndices.map((index,next)=>[index,next]));
    const nodes=originalIndices.map(index=>({...base.nodes[index]}));
    const edges=base.edges.filter(edge=>selected.has(edge[0])&&selected.has(edge[1])).map(([from,to,weight])=>[remap.get(from),remap.get(to),weight]);
    const inputIndices=base.inputIndices.filter(index=>selected.has(index)).map(index=>remap.get(index));
    const outputIndices=base.outputIndices.map(index=>remap.get(index));
    return {...base,
      modelId:'v2',
      modelLabel:'MaleCNS V2 compatto ricostruito',
      modelRevision:2,
      nodes,
      edges,
      inputIndices,
      outputIndices,
      selection:'Riduzione deterministica del nucleo V3: 1.121 nodi, 790 relay sensoriali/fisici, nodi ordinati per connettività e uscite DNa conservate.',
      modelBoundary:'Profilo V2 compatto ricostruito dal nucleo V3 presente nel progetto. Il file storico V2 originale non è disponibile: questo modello serve per confrontare il carico ridotto, non per dichiarare una replica byte-per-byte.'
    };
  }

  return {tagV3,buildV2};
});
