'use strict';
// The optimizer sees coefficient vectors and actual fitness only. It cannot
// inspect cars, observations, targets or a circuit. A protected elite is asked
// as an ACTUAL candidate and receives a fresh score, not a historical score.
const {CMA}=require('./neural-cma.cjs');
class Search{
  constructor({mean,sigma,population,seed}){this.optimizer=new CMA(mean,sigma,population);this.seed=Number(seed)>>>0;this.pending=null;}
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return (this.seed+.5)/4294967296;}
  ask(elite=null){
    if(this.pending)throw Error('Tell required');
    if(elite!==null&&(!Array.isArray(elite)||elite.length!==this.optimizer.n||elite.some(v=>!Number.isFinite(v))))throw Error('Exact finite elite coordinates required');
    this.pending=this.optimizer.ask(()=>this.random());if(elite!==null)this.pending[0]={x:elite.slice()};return this.pending.map(r=>r.x.slice());
  }
  tell(fitness){if(!this.pending||!Array.isArray(fitness)||fitness.length!==this.pending.length||fitness.some(v=>!Number.isFinite(v)))throw Error('Actual complete fitness batch required');const result=this.optimizer.tell(this.pending.map((r,i)=>({...r,fitness:fitness[i]})));this.pending=null;return result;}
  state(){return {optimizer:this.optimizer,seed:this.seed};}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={Search};
