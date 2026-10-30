'use strict';
const fs=require('node:fs'),path=require('node:path'),Live=require('./neural-context-live.cjs'),Head=require('./neural-json-head.cjs');
const stage=Number(process.argv.find(a=>a.startsWith('--stage='))?.slice(8)||2),root=path.resolve(__dirname,'..');
const modelFile=path.join(root,'.impeccable/review/neural-sacl/context-stack-'+stage,'model.malecns-neural-context.json'),env=Live.create(modelFile);
function replay(){env.reset();let overlap=0,s;
  do{s=env.step();overlap+=Number(s.car.outputs[1]>0&&s.car.outputs[2]>0);}while(!s.complete&&s.ticks<120000);
  const {car,ticks,observation,...result}=s;return {result,ticks,gasBrakeOverlapSteps:overlap};
}
const a=replay(),b=replay(),expected=env.model.data.stages.at(-1).provenance.verifiedFullResult;
if(JSON.stringify(a)!==JSON.stringify(b)||a.gasBrakeOverlapSteps||!a.result.complete)throw Error('Live native replay failed');
for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])if(a.result[k]!==expected[k])throw Error('Self-contained native integration differs: '+k);
const out=path.join(root,'.impeccable/review/neural-sacl/context-live-'+stage);fs.mkdirSync(out,{recursive:true});
const report={passed:true,first:a,independentRepeat:b,expected,modelSha256:env.modelSha256,sourceSha256:Head.sha(fs.readFileSync(path.join(__dirname,'neural-context-live.cjs'),'utf8')),
  boundary:'Native runtime reads exported numerical model and anatomical data only. Original save and historical checkpoint loaders are not invoked. Every physical episode starts at the line. Node evidence, not yet an Electron UI result.'};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('CONTEXT_LIVE_VERIFIED '+JSON.stringify(report));
