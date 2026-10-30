'use strict';
const {Search:Base}=require('./neural-head-cma-transport.cjs');
class Search extends Base{
 constructor(config){super(config);if(config.mean?.length!==6||config.mean.some(v=>Math.abs(v)>8)||config.population!==16||config.sigma>2)throw Error('Six bounded local coefficients and sixteen actual candidates required');this.optimizer.covariance=Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>i===j?i%2===0?.0625:1:0));}
 ask(elite=null){return super.ask(elite).map((row,i)=>{const x=row.map(v=>Math.max(-8,Math.min(8,v)));this.pending[i].x=x.slice();return x;});}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>32768)throw Error('Bounded coefficient message required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true,dimensions:6,bounds:[-8,8],population:16};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={Search};
