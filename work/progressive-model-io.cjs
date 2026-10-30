'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Model=require('./neural-grown-model.cjs');
const config=JSON.parse(process.argv[2]),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(config.op==='trace'){
  const rows=JSON.parse(fs.readFileSync(config.file,'utf8')),h=crypto.createHash('sha256');for(const r of rows)h.update(JSON.stringify([r.progress,r.seconds,r.outputs])+'\n');console.log(JSON.stringify({traceSha256:h.digest('hex'),controls:rows.length}));
}else if(config.op==='export'){
  const loaded=Model.load(config.parent),prepared=JSON.parse(fs.readFileSync(config.basis,'utf8')),r=config.result;
  if(loaded.sha256!==prepared.parentModelSha256||r.complete!==true||r.diagnosticCensor||['urto','fuori pista','progresso non valido'].includes(r.reason)||r.fitness<=loaded.data.verifiedFullResult.fitness||r.bestProgress<loaded.data.verifiedFullResult.bestProgress||r.laps<loaded.data.verifiedFullResult.laps)throw Error('Genuine safe improvement required');
  const stage={basis:prepared.basis,weights:config.weights,provenance:config.provenance};if(config.retention==='peak')stage.retention='peak';else if(config.retention!=='none')throw Error('Retention required');
  const data={...loaded.data,decoderRevision:loaded.data.stages.some(s=>s.retention==='peak')||stage.retention==='peak'?'grown-neuronal-context-v2':'grown-neuronal-context-v1',stages:loaded.data.stages.concat(stage),verifiedFullResult:r},text=Model.encode(data);Model.parse(text);fs.writeFileSync(config.file,text,{flag:'wx'});console.log(JSON.stringify({file:config.file,sha256:sha(text),stages:data.stages.length}));
}else if(config.op==='verify'){
  const loaded=Model.load(config.file),env=Model.createFromLoaded(loaded),digest=crypto.createHash('sha256'),began=performance.now();let s=env.state(),overlap=0,controls=0;
  while(!s.complete&&performance.now()-began<180000){s=env.step();controls++;overlap+=Number(s.car.outputs[1]>0&&s.car.outputs[2]>0);digest.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds'].map(k=>[k,s[k]]));if(!s.complete||overlap||Object.entries(result).some(([k,v])=>v!==loaded.data.verifiedFullResult[k]))throw Error('Independent native replay differs or is censored');
  console.log(JSON.stringify({passed:true,modelSha256:loaded.sha256,result,complete:s.complete,overlap,controls,actionTraceSha256:digest.digest('hex'),wallSeconds:(performance.now()-began)/1000}));
}else throw Error('Unsupported model operation');
