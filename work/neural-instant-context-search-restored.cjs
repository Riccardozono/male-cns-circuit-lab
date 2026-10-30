'use strict';
// Restore a committed numeric optimizer checkpoint, never a pending batch.
const {Search}=require('./neural-instant-context-search.cjs'),{CMA}=require('./neural-cma.cjs');
function restore(state){
 if(!state||!Number.isInteger(state.seed)||state.seed<0||state.seed>4294967295||state.optimizer?.n!==6||state.optimizer.population!==16||!Number.isInteger(state.optimizer.generation)||state.optimizer.generation<1||state.optimizer.generation>40)throw Error('Committed six-coordinate optimizer/RNG required');
 const c=CMA.restore(state.optimizer);if(c.mean.some(v=>Math.abs(v)>8)||[...c.pc,...c.ps].some(v=>!Number.isFinite(v)))throw Error('Bounded finite committed state required');
 const s=new Search({mean:c.mean,sigma:c.sigma,population:c.population,seed:state.seed});s.optimizer=c;s.seed=state.seed;return s;
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>32768)throw Error('Bounded numeric checkpoint request required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=restore(m.restored);result={restored:true,generation:search.optimizer.generation};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={restore};
