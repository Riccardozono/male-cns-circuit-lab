'use strict';
// Private artificial decoder, not additional anatomical fly neurons.
const HIDDEN=64;
function count(d){return d*2+HIDDEN*d+HIDDEN+2*HIDDEN+2;}
function validate(w,d){if(!Array.isArray(w)||w.length!==count(d)||w.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded private nonlinear decoder required');}
function extend(linear,d){if(linear.length!==d*2)throw Error('Linear initialization required');return [...linear,...Array.from({length:HIDDEN*d},(_,i)=>((i*37+11)%101-50)/500),...Array.from({length:HIDDEN},(_,i)=>((i*13)%23-11)/100),...Array(2*HIDDEN+2).fill(0)];}
function mean(x,w){const d=x.length;validate(w,d);if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal features required');const y=[0,0];for(let j=0;j<d;j++)for(let a=0;a<2;a++)y[a]+=x[j]*w[2*j+a];const h=[],start=2*d,bias=start+HIDDEN*d,out=bias+HIDDEN;for(let i=0;i<HIDDEN;i++){let s=0;for(let j=0;j<d;j++)s+=x[j]*w[start+i*d+j];h.push(Math.tanh(s+w[bias+i]));}for(let a=0;a<2;a++){let s=0;for(let i=0;i<HIDDEN;i++)s+=h[i]*w[out+a*HIDDEN+i];y[a]+=s+w[out+2*HIDDEN+a];}return y;}
module.exports={HIDDEN,count,validate,extend,mean};
