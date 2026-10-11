/* V5 expands processing of the existing, verified MaleCNS anatomical graph.
 * It never creates neurons/edges or rewrites the V4 bundle. Runtime capacities
 * and the learned motor adapter below are artificial model choices. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSProfiles=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const V5=Object.freeze({id:'v5',revision:5,name:'MaleCNS V5 esteso',
    solver:Object.freeze({kind:'event-driven sparse rate reservoir',iterationsPerControlTick:4,activityThreshold:.0005,edgeContributionThreshold:.0000005,activeNeuronBudget:32768}),
    policy:Object.freeze({version:5,gainGroups:32,readoutLimit:128,coreReadoutLimit:64})});
  function buildV5(full){
    if(!full?.arrays||full.nodeCount!==166700||full.edgeCount!==6242118||full.modelRevision!==4)throw Error('V5 richiede il bundle anatomico completo V4 verificato.');
    return {...full,modelId:V5.id,modelRevision:V5.revision,modelLabel:V5.name,
      anatomicalRevision:full.modelRevision,solver:{...V5.solver},policyConfig:{...V5.policy},
      modelBoundary:full.modelBoundary+' V5 retains the same anatomical nodes/edges, increases sparse capacity to 32,768 slots and four passes, and learns an artificial 128-descending-neuron/32-gain-group motor adapter. Capacity is not a guarantee of learning or biological fidelity.'};
  }
  return Object.freeze({V5,buildV5});
});
