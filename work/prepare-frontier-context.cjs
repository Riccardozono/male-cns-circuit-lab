'use strict';
const fs=require('node:fs'),path=require('node:path'),Context=require('./neural-context-readout.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/context-frontier-basis'),source=path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json'),traceFile=path.join(root,'.impeccable/review/neural-sacl/frontier-1990/actual-trace.json');
if(fs.existsSync(path.join(dir,'prepared.json')))throw Error('Preserve existing observed basis');fs.mkdirSync(dir,{recursive:true});
const observations=JSON.parse(fs.readFileSync(traceFile,'utf8')).map(row=>row.observation),basis=Context.grow(observations,{limit:6,protectedFraction:.94});
const report={format:'male-cns-observed-frontier-basis',schema:1,basis,sourceModelSha256:Head.sha(fs.readFileSync(source,'utf8')),sourceTraceSha256:Head.sha(fs.readFileSync(traceFile,'utf8')),
  boundary:'Unsupervised centres from neuronal observations in the independently verified real episode. Chronological protection selects a training frontier, not a production time/position trigger. Activation uses neural distance only. Diagnostic body fields and previous action targets are discarded.'};
fs.writeFileSync(path.join(dir,'prepared.json'),JSON.stringify(report,null,2));console.log('FRONTIER_CONTEXT_PREPARED '+JSON.stringify({centres:basis.centres.length,observations:observations.length,protectedCount:basis.protectedCount}));
