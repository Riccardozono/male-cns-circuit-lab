'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-projected-frontier-model.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),source=JSON.parse(fs.readFileSync(path.join(base,'projected-live-generations/report.json'),'utf8')),loaded=Model.load(path.join(base,'projected-block-3680/model.malecns-projected-frontier.json'));
const env=Model.createFromLoaded(loaded,{weights:source.champion.weights}),trace=crypto.createHash('sha256');let state=env.state();
while(!state.complete){state=env.step();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
const actual={fitness:state.fitness,baseFitness:state.car.baseFitness,progress:state.bestProgress,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,actionTraceSha256:trace.digest('hex')};
const report={modelSha256:loaded.sha256,sourceResult:loaded.data.verifiedFullResult,actual,fitnessMinusStableBase:state.fitness-state.car.baseFitness,changedWeights:JSON.stringify(source.champion.weights)!==JSON.stringify(loaded.data.weights),
  boundary:'Fresh actual from-line replay of the native archive elite. Compares raw running fitness with stable ledger score; no counterfactual driver, source mutation or active app change. A changed vector is not evidence of improved driving.'};
const out=path.join(base,'projected-elite-rounding');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
