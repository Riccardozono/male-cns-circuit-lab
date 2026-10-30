'use strict';
const appliedMemory=require('./neural-applied-policy-memory.cjs');
// Independent from-line native composition: no Bridge, practice capture,
// optimizer, action tape or geometry supplied to the learned policy.
const Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),R=require('./neural-projected-residual.cjs'),Live=require('./neural-command-live-cuda-packed.cjs'),Policy=require('./neural-ppo-steering-policy.cjs'),Normalization=require('./neural-observation-normalization.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs'),fs=require('node:fs');
function create({modelFile,preparedFile,normalizationFile,weights,id=0,sharedTopology=null}={}){
 Policy.weights(weights);const genes=weights.slice(),loaded=Origin.load(modelFile),prepared=JSON.parse(fs.readFileSync(preparedFile,'utf8')),normalization=Normalization.load(normalizationFile,loaded.sha256),chain=Chain.controller(loaded.parent),head=State.create(loaded.data),gate=R.createGate(prepared.basis);let previous=[0,0],lastAuthority=null;
 const env=Live.create(modelFile,{id,sharedTopology,modelOverride:loaded.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
  onReset:()=>{chain.reset();head.reset();gate.reset();previous=[0,0];},
  actionOverride:(_model,raw)=>{const old=chain.observe(raw);head.observe(raw);gate.observe(raw);return old;},
  motorOverride:(_model,raw,prior)=>{const parent=head.compose(chain.compose(prior),loaded.data.weights),features=normalization.encode(Policy.features(raw,parent,previous)),action=Policy.mean(features,genes),commands=Policy.compose(parent,gate.value(),action);lastAuthority={gate:gate.value(),parent:parent.slice(),proposedAction:action.slice()};previous=appliedMemory(gate.value(),action);return commands;}
 });
 return {...env,policyIdentity:{originSha256:loaded.sha256,normalizationSha256:normalization.sha256,parameters:genes.length},inspectMotorAuthority:()=>structuredClone(lastAuthority),cudaStats:Cuda.stats};
}
module.exports={create,close:Cuda.close};
