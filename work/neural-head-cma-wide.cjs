'use strict';
// Change only INITIAL mutation covariance, not decoder authority or rewards.
// Symmetric Gaussian exploration has no requested/ideal driving direction.
const {Search}=require('./neural-head-cma-transport.cjs');
class WideSearch extends Search{
  constructor(config){super(config);if(this.optimizer.n!==2)throw Error('Two learned coefficients required');this.optimizer.covariance=[[1,0],[0,16]];}
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{const m=JSON.parse(line);id=m.id;if(line.length>8192||!Number.isInteger(id))throw Error('Bounded request required');let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new WideSearch(m);result={initialized:true,initialAxisStdMultipliers:[1,4]};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={WideSearch};
