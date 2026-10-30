'use strict';
// Bounded search coordinates. The ACTUAL pending x is projected before it is
// physically evaluated and passed to tell; no different/unclipped genome gets
// the measured score. The inherited positive-weight covariance update uses x.
const {Search:Base}=require('./neural-head-cma-transport.cjs');
class Search extends Base{
  constructor(config){super(config);if(config.mean?.length!==18||config.mean.some(v=>Math.abs(v)>8)||config.population!==16||config.sigma>2)throw Error('Bounded18coefficient/16candidate search required');}
  ask(elite=null){const rows=super.ask(elite);return rows.map((row,i)=>{const x=row.map(v=>Math.max(-8,Math.min(8,v)));this.pending[i].x=x.slice();return x;});}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>32768)throw Error('Bounded coefficient request required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true,bounds:[-8,8]};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={Search};
