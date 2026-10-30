'use strict';
const fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-model.cjs'),{Archive}=require('./neural-native-archive.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/native-training'),report=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/neural-sacl/neural-diversity-first/report.json'),'utf8')),
  loaded=Model.load(path.join(root,'.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json'));
if(!report.passed||report.fullChampion.result.bestProgress!==loaded.data.verifiedFullResult.bestProgress||JSON.stringify(report.state.champion.weights)!==JSON.stringify(loaded.data.weights))throw Error('Verified matching actual bootstrap required');
const state=Archive.restore(report.state).snapshot();if(fs.existsSync(path.join(dir,'bootstrap.json')))throw Error('Preserve existing native bootstrap');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'bootstrap.json'),JSON.stringify(state,null,2));console.log('NATIVE_TRAINING_BOOTSTRAP '+JSON.stringify({cells:state.cells.length,progress:state.champion.progress,weights:state.dimensions}));
