'use strict';
const fs=require('node:fs'),path=require('node:path'),Model=require('./neural-grown-model.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/grown-native-model'),file=path.join(dir,'model.malecns-neural-grown.json'),loaded=Model.load(file),fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
const episodes=[];for(let i=0;i<2;i++){
  const env=Model.createFromLoaded(loaded),rows=[];let s=env.state(),controls=0,overlap=0;
  while(!s.complete&&controls<20000){s=env.step();controls++;const c=s.car;overlap+=Number(c.outputs[1]>0&&c.outputs[2]>0);rows.push({observation:s.observation.slice(),progress:s.bestProgress,seconds:s.totalSimulationSeconds,outputs:c.outputs.slice(),speedKmh:c.vehicle.speedMps*3.6,fitness:s.fitness,reason:s.reason});}
  const result=Object.fromEntries(fields.map(k=>[k,s[k]]));if(!s.complete||overlap||!fields.every(k=>s[k]===loaded.data.verifiedFullResult[k]))throw Error('Independent native full physical result differs');
  episodes.push({result,controls,overlap,complete:s.complete});if(i===0)fs.writeFileSync(path.join(dir,'actual-trace.json'),JSON.stringify(rows));
}
if(JSON.stringify(episodes[0])!==JSON.stringify(episodes[1]))throw Error('Native repeat differs');
const report={passed:true,modelSha256:loaded.sha256,numericRuntime:process.versions.node,episodes,
  boundary:'Two actual independent native episodes from the line, data-only grown decoder. Physics/rewards/anatomical graph unchanged. Diagnostic control ceiling only, not the app clock or an accepted censored result. Zero completed laps is not success at the two-lap objective.'};
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));console.log('GROWN_NATIVE_VERIFIED '+JSON.stringify(report));
