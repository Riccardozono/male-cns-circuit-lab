'use strict';
const {Search:Base}=require('./neural-head-cma-transport.cjs');
class Search extends Base{
 constructor(c){super(c);if(c.mean?.length!==9||c.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>8)||c.population!==16||c.sigma>2)throw Error('Nine bounded memory parameters required');this.optimizer.covariance=Array.from({length:9},(_,i)=>Array.from({length:9},(_,j)=>i===j?i<6?(i%2===0?.0625:1):16:0));}
 ask(elite){return super.ask(elite).map((r,i)=>{const x=r.map(v=>Math.max(-8,Math.min(8,v)));this.pending[i].x=x.slice();return x;});}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={Search};
