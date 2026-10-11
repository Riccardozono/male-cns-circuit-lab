/* Compact loader for the complete annotated MaleCNS v1.0 graph. */
(function(root){
  'use strict';
  const constructors={'float64':Float64Array,'float32':Float32Array,'int32':Int32Array,'uint32':Uint32Array,'uint8':Uint8Array,'int8':Int8Array};
  async function load(metadataUrl='data/connectome-full.json'){
    const metadataResponse=await fetch(metadataUrl,{cache:'no-store'});
    if(!metadataResponse.ok)throw Error(`Metadati MaleCNS completi non disponibili (${metadataResponse.status}).`);
    const metadata=await metadataResponse.json();
    const binaryUrl=new URL(metadata.binary,new URL(metadataUrl,location.href));
    const binaryResponse=await fetch(binaryUrl,{cache:'no-store'});
    if(!binaryResponse.ok)throw Error(`Grafo MaleCNS completo non disponibile (${binaryResponse.status}).`);
    const buffer=await binaryResponse.arrayBuffer();
    if(buffer.byteLength!==metadata.binaryBytes)throw Error('Dimensione del grafo MaleCNS completo non valida.');
    if(!globalThis.crypto?.subtle)throw Error('Verifica SHA-256 del grafo non disponibile in questo browser.');
    const digest=await crypto.subtle.digest('SHA-256',buffer),hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(hash!==metadata.binarySha256)throw Error('SHA-256 del grafo MaleCNS completo non valido.');
    const arrays={};
    for(const [name,descriptor] of Object.entries(metadata.arrays)){
      const Constructor=constructors[descriptor.dtype];
      if(!Constructor)throw Error(`Tipo binario MaleCNS non supportato: ${descriptor.dtype}`);
      arrays[name]=new Constructor(buffer,descriptor.offset,descriptor.length);
    }
    return {...metadata,compact:true,...arrays};
  }
  root.MaleCNSFull={load};
})(typeof globalThis!=='undefined'?globalThis:this);
