'use strict';

// Research-only affine calibration over the verified network's actual motor
// commands. Four trainable values: log-gain and bias for steering and the
// exclusive throttle/brake axis. Zero is bit-exact identity.
const LIMITS=Object.freeze({logGain:1.5,bias:2});
const EPS=1e-12;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function validate(prior,weights){
  if(!Array.isArray(prior)||prior.length!==3||prior.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Comando motore del modello non valido.');
  if(prior[1]<0||prior[2]<0||Math.min(prior[1],prior[2])!==0)throw Error('Acceleratore e freno devono restare esclusivi.');
  if(!Array.isArray(weights)||weights.length!==4||weights.some(v=>!Number.isFinite(v)))throw Error('Servono quattro parametri affini finiti.');
  if(Math.abs(weights[0])>LIMITS.logGain||Math.abs(weights[2])>LIMITS.logGain||Math.abs(weights[1])>LIMITS.bias||Math.abs(weights[3])>LIMITS.bias)throw Error('Parametri affini fuori dai limiti di ricerca.');
}
function transform(value,logGain,bias){
  if(logGain===0&&bias===0)return value;
  return Math.tanh(Math.atanh(clamp(value,-1+EPS,1-EPS))*Math.exp(logGain)+bias);
}
function compose(prior,weights){
  validate(prior,weights);
  if(weights.every(value=>value===0))return prior.slice();
  const steer=transform(prior[0],weights[0],weights[1]);
  const longitudinal=transform(prior[1]-prior[2],weights[2],weights[3]);
  return [steer,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
}
function composeGated(prior,weights,gate){
  if(!Number.isFinite(gate)||gate<0||gate>1)throw Error('Il gate neurale deve essere compreso tra zero e uno.');
  validate(prior,weights);
  if(gate===0||weights.every(value=>value===0))return prior.slice();
  return compose(prior,weights.map(value=>value*gate));
}

module.exports=Object.freeze({LIMITS,compose,composeGated});
