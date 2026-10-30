'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Head=require('./neural-json-head.cjs'),Parent=require('./neural-projected-frontier-model.cjs'),Model=require('./neural-command-model.cjs');
if(process.versions.node!=='24.19.0')throw Error('Pinned Node24 required');
const c=JSON.parse(process.argv[2]);
if(c.op==='export'){
  const prepared=JSON.parse(fs.readFileSync(c.preparedFile,'utf8')),parent=Parent.load(prepared.parentModelFile),episode=c.episode,r=episode?.result;
  if(prepared.parentModelSha256!==parent.sha256||episode.censored||!episode.complete||episode.gasBrakeOverlapSteps||!r?.complete||['urto','fuori pista','progresso non valido'].some(x=>r.reason.includes(x))||r.fitness<parent.data.verifiedFullResult.fitness||r.bestProgress<parent.data.verifiedFullResult.bestProgress||r.laps<parent.data.verifiedFullResult.laps)throw Error('Uncensored safe full non-regression required');
  const data={format:'male-cns-private-neuronal-command-model',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',decoderRevision:'neuronal-command-residual-v1',parentEnvelope:JSON.parse(fs.readFileSync(prepared.parentModelFile,'utf8')),basis:prepared.basis,normalization:prepared.normalization,actor:JSON.parse(fs.readFileSync(c.actorFile,'utf8')),verifiedFullResult:r,verifiedTraceSha256:episode.actionTraceSha256,provenance:c.provenance};
  const text=Model.encode(data);Model.parse(text);fs.writeFileSync(c.file,text,{flag:'wx'});console.log(JSON.stringify({file:c.file,sha256:Head.sha(text)}));
}else if(c.op==='verify'){
  const loaded=Model.load(c.file),env=Model.createFromLoaded(loaded),digest=crypto.createHash('sha256'),start=performance.now();let s=env.state(),overlap=0,controls=0;
  while(!s.complete&&performance.now()-start<180000){s=env.step();controls++;overlap+=Number(Math.min(s.car.outputs[1],s.car.outputs[2])!==0);digest.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','complete'].map(k=>[k,s[k]])),actionTraceSha256=digest.digest('hex');
  if(!s.complete||overlap||Object.entries(result).some(([k,v])=>v!==loaded.data.verifiedFullResult[k])||actionTraceSha256!==loaded.data.verifiedTraceSha256)throw Error('Independent actual native SAC model trace differs or is censored');
  console.log(JSON.stringify({passed:true,result,overlap,controls,actionTraceSha256,modelSha256:loaded.sha256,wallSeconds:(performance.now()-start)/1000}));
}else throw Error('Unsupported operation');
