'use strict';
// Restore a fully committed fitness-only optimizer/RNG; never a live pending ask.
const {Search}=require('./neural-head-cma-transport.cjs'),{CMA}=require('./neural-cma.cjs');
function restore(state){
  if(!state||!state.optimizer||!Number.isInteger(state.seed)||state.seed<0||state.seed>4294967295)throw Error('Committed optimizer and RNG required');
  const c=CMA.restore(state.optimizer);if(c.n!==18||c.population!==16||c.mean.length!==18||!Number.isInteger(c.generation)||c.generation<0)throw Error('Exact18coordinate16candidate checkpoint required');
  const search=new Search({mean:c.mean,sigma:c.sigma,population:c.population,seed:state.seed});search.optimizer=c;return search;
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=restore(m.restored);result={restored:true,generation:search.optimizer.generation};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={restore};
