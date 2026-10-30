'use strict';
// Fitness-only optimizer transport. No car, observation or circuit is read.
const readline=require('node:readline'),{CMA}=require('./neural-cma.cjs');
let optimizer,seed,candidates;
const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (seed+.5)/4294967296;};
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  let id=null;
  try{
    const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
    let result;
    if(m.op==='init'){
      if(optimizer)throw Error('Already initialized');
      if(m.state){seed=Number(m.state.seed)>>>0;optimizer=CMA.restore(m.state.optimizer);}
      else{seed=Number(m.seed)>>>0;optimizer=new CMA(m.mean,m.sigma,m.population);}
      result={initialized:true,generation:optimizer.generation};
    }else if(!optimizer)throw Error('Initialize first');
    else if(m.op==='ask'){
      if(candidates)throw Error('Tell required');candidates=optimizer.ask(random);result=candidates.map(c=>c.x);
    }else if(m.op==='tell'){
      if(!candidates||!Array.isArray(m.fitness)||m.fitness.length!==candidates.length)throw Error('Invalid scores');
      result=optimizer.tell(candidates.map((c,i)=>({...c,fitness:m.fitness[i]})));candidates=null;
    }else if(m.op==='state')result={optimizer,seed};
    else throw Error('Unsupported operation');
    process.stdout.write(JSON.stringify({id,result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
});
