'use strict';
// Explicit research-only facade. Normal app callers use Model.load, never this.
const Model=require('./neural-statehead-cuda-model.cjs');
module.exports={loadResearch:Model.loadResearch,createFromLoaded:Model.createFromLoaded,stats:Model.stats,closeCuda:Model.closeCuda};
