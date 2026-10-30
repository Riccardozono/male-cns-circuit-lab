'use strict';
const fs=require('node:fs'),path=require('node:path'),Context=require('./neural-context-readout.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),traceFile=path.join(base,'diversity-stall-3298/actual-trace.json'),out=path.join(base,'stall-neuronal-basis');
if(fs.existsSync(path.join(out,'prepared.json')))throw Error('Preserve existing neuronal basis');fs.mkdirSync(out,{recursive:true});
const trace=JSON.parse(fs.readFileSync(traceFile,'utf8')),observations=trace.map(r=>r.observation),stride=4,sampled=observations.filter((_,i)=>i%stride===0);
const basis=Context.grow(sampled,{limit:6,protectedFraction:.8}),protectedCount=Math.floor(observations.length*.8),prefix=observations.slice(0,protectedCount);
for(const centre of basis.centres)centre.radius=.75*Math.min(...prefix.map(row=>Context.distance(row,centre.values,basis.scales)));
if(prefix.some(row=>basis.centres.some(c=>Context.feature(row,c,basis.scales)!==0)))throw Error('Every actual prefix observation must remain outside new supports');
const activations=observations.map(row=>basis.centres.map(c=>Context.feature(row,c,basis.scales))),firstActive=activations.findIndex(row=>row.some(v=>v>0));
if(firstActive<protectedCount)throw Error('Actual full prefix not preserved');
basis.protectedCount=protectedCount;basis.sourceObservationCount=observations.length;
const prepared={format:'male-cns-observed-stall-neuronal-basis',schema:1,basis,firstActiveControl:firstActive,sourceTraceSha256:Head.sha(fs.readFileSync(traceFile,'utf8')),
  sourceChampionReportSha256:Head.sha(fs.readFileSync(path.join(base,'neural-diversity-resume-40/report.json'),'utf8')),
  boundary:'Six compact artificial features of 516 actual neuronal-history/memory/readout values. No biological neurons added, no pose/time/route/gas/brake targets. Chronology selects/protects training observations only; production activation is neural distance only.'};
fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(prepared,null,2));console.log('STALL_BASIS '+JSON.stringify({centres:basis.centres.length,protectedCount,firstActive,sourceObservations:observations.length}));
