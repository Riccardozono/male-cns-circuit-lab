'use strict';
// Gather only actual from-line observations. No teacher or counterfactual car.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Head=require('./neural-json-head.cjs'),Model=require('./neural-projected-frontier-model.cjs'),Live=require('./neural-context-live.cjs'),Residual=require('./neural-projected-residual.cjs'),Context=require('./neural-context-readout.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,'.impeccable/review/neural-sacl/projected-block-3680/model.malecns-projected-frontier.json');
function prepare(out){
  if(process.versions.node!=='24.19.0')throw Error('Pinned numerical runtime required');fs.mkdirSync(out,{recursive:false});
  const loaded=Model.load(source),parent=Residual.createParent(loaded),trace=crypto.createHash('sha256'),observations=[],actions=[];
  const env=Live.create(source,{modelOverride:loaded.parent.parent.model,onReset:()=>parent.reset(),actionOverride:(_m,obs)=>{const a=parent.action(obs);observations.push(obs.slice());actions.push(a.slice());return a;}});
  let state=env.state(),overlap=0;while(!state.complete){state=env.step();if(Math.min(state.car.outputs[1],state.car.outputs[2])!==0)overlap++;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
  const actionTraceSha256=trace.digest('hex'),expected=loaded.data.verifiedFullResult;
  if(overlap||actionTraceSha256!=='02d0cf438e6479b73e262f80ff779ccc57c31f2ed71c0c8f19d58c73f3136136'||['bestProgress','fitness','laps','reason','totalSimulationSeconds'].some(k=>state[k]!==expected[k]))throw Error('Frozen parent full trajectory differs from verified native source');
  // Sampling selects contexts, never controls the live car. Verify support on
  // EVERY protected observation, not just the selected half-second samples.
  const sampled=observations.filter((_r,i)=>i%5===0),basis=Context.grow(sampled,{limit:6,protectedFraction:.8}),protectedCount=Math.floor(observations.length*.8);
  for(const c of basis.centres){let nearest=Infinity;for(const obs of observations.slice(0,protectedCount))nearest=Math.min(nearest,Context.distance(obs,c.values,basis.scales));c.radius=Math.min(c.radius,nearest*.75);}
  if(observations.slice(0,protectedCount).some(obs=>basis.centres.some(c=>Context.feature(obs,c,basis.scales)!==0)))throw Error('Every actually observed protected control must have zero support');
  const gate=Residual.createGate(basis),rows=observations.map((obs,i)=>obs.concat(actions[i],[gate.observe(obs)])),late=rows.filter(row=>row[520]>0),f=Math.fround;
  if(late.length<50)throw Error('Insufficient actual late neuronal samples');
  const mean=Array.from({length:521},(_,j)=>f(late.reduce((s,row)=>s+row[j],0)/late.length));
  const deviation=mean.map((m,j)=>f(Math.max(.02,Math.sqrt(late.reduce((s,row)=>s+(row[j]-m)**2,0)/late.length))));
  const normalization={mean,deviation,clip:10};Residual.validateNormalization(normalization);
  const prepared={format:'male-cns-private-projected-residual-preparation',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',parentModelFile:source,parentModelSha256:loaded.sha256,basis,normalization,
    sourceControls:observations.length,protectedCount,firstActivatedControl:rows.findIndex(row=>row[520]>0),lateSamples:late.length,actualSourceTraceSha256:actionTraceSha256,
    sourceResult:{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete},
    sourceHashes:Object.fromEntries(['prepare-projected-residual.cjs','neural-projected-residual.cjs'].map(file=>[file,Head.sha(fs.readFileSync(path.join(__dirname,file),'utf8'))])),
    boundary:'Warm-start V3 / Monza only. Neuronal contexts and normalizers observed on actual frozen-parent from-line driving. No pose/clock/route/target controls in the actor. Sample order is preparation metadata, never an inference input.'};
  fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(prepared));console.log('PROJECTED_RESIDUAL_PREPARED '+JSON.stringify({file:path.join(out,'prepared.json'),sourceResult:prepared.sourceResult,controls:prepared.sourceControls,protectedCount,firstActivatedControl:prepared.firstActivatedControl,lateSamples:late.length}));return prepared;
}
if(require.main===module){if(process.argv.length!==3)throw Error('One new private output directory required');prepare(path.resolve(process.argv[2]));}module.exports={prepare};
