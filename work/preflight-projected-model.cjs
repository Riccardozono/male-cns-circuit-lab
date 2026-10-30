'use strict';
const Model=require('./neural-projected-frontier-model.cjs'),loaded=Model.load(process.argv[2]),env=Model.createFromLoaded(loaded),s=env.state();
if(s.complete||s.totalSimulationSeconds!==0||s.bestProgress!==0||env.graph.n!==7721||env.graph.edgeCount!==242486)throw Error('Invalid actual from-line projected model');
console.log(JSON.stringify({sha256:loaded.sha256,nodeVersion:process.versions.node,parameters:18,complete:false,seconds:0}));
