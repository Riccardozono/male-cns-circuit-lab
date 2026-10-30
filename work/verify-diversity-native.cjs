'use strict';
const fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-model.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json'),env=Model.create(file),episodes=[];
for(let run=0;run<2;run++){
  let state=env.reset(),overlap=0;while(!state.complete&&state.ticks<120000){state=env.step();overlap+=Number(state.car.outputs[1]>0&&state.car.outputs[2]>0);}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds'].map(k=>[k,state[k]]));
  if(!state.complete||overlap)throw Error('Actual complete exclusive-pedal episode required');for(const k in result)if(result[k]!==env.verificationExpected[k])throw Error('Native projection differs: '+k);
  episodes.push({result,overlap,ticks:state.ticks});
}
if(JSON.stringify(episodes[0])!==JSON.stringify(episodes[1]))throw Error('Native repeat differs');
const out=path.join(root,'.impeccable/review/neural-sacl/diversity-native-model'),report={passed:true,episodes,modelSha256:env.modelSha256,sourceSha256:Head.sha(fs.readFileSync(path.join(__dirname,'neural-frontier-model.cjs'),'utf8')),
  boundary:'Standalone numerical export plus actual anatomical data; no original save, historical experiment checkpoint, recorded action tape or policy position/clock inputs. Node evidence, separate from the real Electron-window smoke.'};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('DIVERSITY_NATIVE_VERIFIED '+JSON.stringify({passed:true,episode:episodes[0].result,modelSha256:env.modelSha256}));
