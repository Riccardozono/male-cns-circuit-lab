'use strict';
// Optional LEARNED mixture between decaying and retained actual neuronal evidence.
// No route/clock/body state. Integration/physical learning still required.
function create(){let current=0,peak=0;const owned=new WeakSet();return {
 observe(values){if(!Array.isArray(values)||!values.length||values.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Bounded actual neuronal-memory evidence required');current=Math.max(...values);peak=Math.max(peak,current);},
 value(mix){if(!Number.isFinite(mix)||Math.abs(mix)>8)throw Error('Bounded learned gate mixture required');const m=Math.max(0,Math.min(1,mix));return m===0?current:m===1?peak:current+(peak-current)*m;},
 reset(){current=peak=0;},capture(){const s={current,peak};owned.add(s);return s;},restore(s){if(!owned.has(s))throw Error('Only own observed gate state may be restored');current=s.current;peak=s.peak;}
 };}
module.exports={create};
