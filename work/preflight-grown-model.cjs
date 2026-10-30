'use strict';
const Model=require('./neural-grown-model.cjs'),loaded=Model.load(process.argv[2]),env=Model.createFromLoaded(loaded),s=env.state();
if(s.complete||s.totalSimulationSeconds!==0||s.bestProgress!==0||env.topology.graph.n!==7721||env.topology.graph.edgeCount!==242486)throw Error('Invalid actual from-line grown model');
console.log(JSON.stringify({sha256:loaded.sha256,nodeVersion:process.versions.node,parameters:loaded.data.stages.at(-1).weights.length,complete:false,seconds:0}));
