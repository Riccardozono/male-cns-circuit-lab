'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Grown=require('./neural-grown-model.cjs'),Model=require('./neural-projected-frontier-model.cjs');
const c=JSON.parse(process.argv[2]);if(c.op==='export'){
  const parent=Grown.load(c.parent),prepared=JSON.parse(fs.readFileSync(c.basis,'utf8')),r=c.result;
  if(prepared.parentModelSha256!==parent.sha256||r.complete!==true||r.diagnosticCensor||['urto','fuori pista','progresso non valido'].includes(r.reason)||r.fitness<parent.data.verifiedFullResult.fitness||r.bestProgress<parent.data.verifiedFullResult.bestProgress)throw Error('Actual safe non-regressing parent comparison required');
  const data={format:'male-cns-private-projected-frontier-model',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',decoderRevision:'projected-neuronal-frontier-v3',parentEnvelope:JSON.parse(fs.readFileSync(c.parent,'utf8')),basis:prepared.basis,projection:prepared.projection,weights:c.weights,verifiedFullResult:r,provenance:c.provenance};const text=Model.encode(data);Model.parse(text);fs.writeFileSync(c.file,text,{flag:'wx'});console.log(JSON.stringify({file:c.file,sha256:crypto.createHash('sha256').update(text).digest('hex')}));
}else if(c.op==='verify'){
  const loaded=Model.load(c.file),env=Model.createFromLoaded(loaded),digest=crypto.createHash('sha256'),start=performance.now();let s=env.state(),overlap=0,controls=0;
  while(!s.complete&&performance.now()-start<180000){s=env.step();controls++;overlap+=Number(s.car.outputs[1]>0&&s.car.outputs[2]>0);digest.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds'].map(k=>[k,s[k]]));if(!s.complete||overlap||Object.entries(result).some(([k,v])=>v!==loaded.data.verifiedFullResult[k]))throw Error('Independent projected native replay differs or is censored');console.log(JSON.stringify({passed:true,result,complete:true,overlap,controls,actionTraceSha256:digest.digest('hex'),modelSha256:loaded.sha256,wallSeconds:(performance.now()-start)/1000}));
}else throw Error('Unsupported operation');
