'use strict';
const {Search:Base}=require('./neural-head-cma-transport.cjs');
class Search extends Base{
 constructor(c){super(c);if(c.mean?.length!==16||c.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>4)||c.population!==16||c.sigma>2)throw Error('Sixteen bounded kernel coefficients and16actual candidates required');}
 ask(elite=null){return super.ask(elite).map((r,i)=>{const x=r.map(v=>Math.max(-4,Math.min(4,v)));this.pending[i].x=x.slice();return x;});}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>32768)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={Search};
