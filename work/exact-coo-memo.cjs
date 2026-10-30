'use strict';
// Experimental PURE-kernel memoization, not prerecorded driving or episodes.
// Every physical car/controller still steps separately. A hit requires exact
// input bytes AND unchanged topology/weights/groups. Hashes only index entries;
// byte comparisons rule out collisions. Old kernel/inference files stay intact.
const crypto=require('node:crypto'),Exact=require('./exact-coo.cjs'),nativeTanh=Math.tanh;
const MAX_ENTRIES=32;let buckets=new WeakMap(),counts={calls:0,hits:0,misses:0,invalidations:0,bypassed:0};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),equal=(a,b)=>a.length===b.length&&a.equals(b);
function pass(graph,brain,iterations,edgesEnabled,gains){
  counts.calls++;
  const names=['activity','next','sum','injection'],arrays=names.map(k=>brain[k]),n=graph.n;
  const suitable=edgesEnabled===true&&Math.tanh===nativeTanh&&Number.isInteger(iterations)&&iterations>0&&iterations<=8
    &&graph.from instanceof Uint32Array&&graph.to instanceof Uint32Array&&graph.weights instanceof Float64Array
    &&graph.from.length===graph.to.length&&graph.from.length===graph.weights.length
    &&(!gains||graph.learning?.groups instanceof Uint8Array)
    &&arrays.every(a=>a instanceof Float64Array&&a.length===n)&&new Set(arrays.map(a=>a.buffer)).size===4;
  if(!suitable){counts.bypassed++;return Exact.pass(graph,brain,iterations,edgesEnabled,gains);}
  const topology=[graph.from,graph.to,graph.weights,...(gains?[graph.learning.groups]:[])].map(bytes);
  let bucket=buckets.get(graph);
  if(!bucket||bucket.n!==n||bucket.edgeCount!==graph.from.length||bucket.parts.length!==topology.length||!topology.every((b,i)=>equal(b,bucket.parts[i]))){
    if(bucket)counts.invalidations++;bucket={n,edgeCount:graph.from.length,parts:topology.map(b=>Buffer.from(b)),entries:new Map()};buckets.set(graph,bucket);
  }
  const activity=bytes(brain.activity),injection=bytes(brain.injection),gainBytes=gains?bytes(Float64Array.from(gains)):null;
  const hash=crypto.createHash('sha256').update(String(iterations)+':'+(gains?'g':'n')).update(activity).update(injection);if(gainBytes)hash.update(gainBytes);const key=hash.digest('hex'),cached=bucket.entries.get(key);
  if(cached&&cached.iterations===iterations&&equal(activity,cached.inputActivity)&&equal(injection,cached.inputInjection)&&((gainBytes===null&&cached.gains===null)||(gainBytes!==null&&cached.gains!==null&&equal(gainBytes,cached.gains)))){
    counts.hits++;if(iterations%2)[brain.activity,brain.next]=[brain.next,brain.activity];brain.activity.set(cached.activity);brain.next.set(cached.next);brain.sum.set(cached.sum);bucket.entries.delete(key);bucket.entries.set(key,cached);return;
  }
  counts.misses++;
  const inputActivity=Buffer.from(activity),inputInjection=Buffer.from(injection),savedGains=gainBytes===null?null:Buffer.from(gainBytes);
  Exact.pass(graph,brain,iterations,edgesEnabled,gains);
  bucket.entries.set(key,{iterations,inputActivity,inputInjection,gains:savedGains,activity:brain.activity.slice(),next:brain.next.slice(),sum:brain.sum.slice()});
  if(bucket.entries.size>MAX_ENTRIES)bucket.entries.delete(bucket.entries.keys().next().value);
}
function stats(){return {...counts,maxEntriesPerGraph:MAX_ENTRIES};}
function reset(){buckets=new WeakMap();counts={calls:0,hits:0,misses:0,invalidations:0,bypassed:0};}
module.exports={pass,stats,reset};
