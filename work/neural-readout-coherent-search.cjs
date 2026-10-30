'use strict';
// One candidate is a fixed neuronal readout for its entire actual episode,
// not fresh action noise at every control. No teacher/route/physics input.
const Policy=require('./neural-ppo-steering-policy.cjs'),{Search:Base}=require('./neural-head-cma-transport.cjs');
const DIMENSIONS=Policy.HIDDEN*2+2,OFFSET=Policy.COUNT-DIMENSIONS;
function merge(frozen,genes){
 Policy.weights(frozen);
 if(!Array.isArray(genes)||genes.length!==DIMENSIONS||genes.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('130 finite bounded final-layer coefficients required');
 return frozen.slice(0,OFFSET).concat(genes);
}
class Search extends Base{
 constructor(config){
  super(config);
  if(config.mean?.length!==DIMENSIONS||config.mean.some(v=>Math.abs(v)>8)||config.population!==16||config.sigma>.3)throw Error('130-coordinate sixteen-candidate bounded search required');
  // Coordinate order alternates steering/longitudinal, including last biases.
  // These scales are symmetric; no requested driving direction is encoded.
  this.optimizer.covariance=Array.from({length:DIMENSIONS},(_,i)=>Array.from({length:DIMENSIONS},(_,j)=>i===j?i%2===0?.0625:1:0));
 }
 ask(elite=null){return super.ask(elite).map((row,i)=>{const x=row.map(v=>Math.max(-8,Math.min(8,v)));this.pending[i].x=x.slice();return x;});}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{
 if(line.length>256*1024)throw Error('Bounded coefficient request required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;
 if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true,dimensions:DIMENSIONS,bounds:[-8,8],population:16};}
 else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');
 process.stdout.write(JSON.stringify({id,result})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={Search,merge,DIMENSIONS,OFFSET};
