'use strict';
const {Search:Base}=require('./neural-prior-greedy-kernel-search.cjs');
const CORRELATION=.75;
class Search extends Base{constructor(c){super(c);this.optimizer.covariance=Array.from({length:16},(_,i)=>Array.from({length:16},(_,j)=>i%2!==j%2?0:(i%2===0?.16:1)*(i===j?1:CORRELATION)));}}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>32768)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={Search,CORRELATION};
