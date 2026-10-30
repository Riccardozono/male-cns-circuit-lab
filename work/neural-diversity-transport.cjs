'use strict';
const readline=require('node:readline'),{Archive}=require('./neural-diversity.cjs'),{rng}=require('../outputs/simulation.js');let archive,random;
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  let id=null;try{
    if(line.length>1024*1024)throw Error('Archive message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;
    if(m.op==='init'){if(archive)throw Error('Already initialized');if(m.snapshot){archive=Archive.restore(m.snapshot);if(!Number.isSafeInteger(m.randomState))throw Error('Recorded random state required');random=rng(m.randomState);}else{archive=new Archive(m.configuration);random=rng(m.seed);if(!Array.isArray(m.seeds)||m.seeds.length>1000)throw Error('Bounded actual seeds required');m.seeds.forEach(r=>archive.offer(r));}result=archive.snapshot();}
    else if(!archive)throw Error('Initialize first');else if(m.op==='ask')result=archive.ask(random);else if(m.op==='offer'){if(!Array.isArray(m.candidates)||m.candidates.length>100)throw Error('Bounded evaluated batch required');result=m.candidates.map(r=>archive.offer(r));}
    else if(m.op==='state')result=archive.snapshot();else throw Error('Unsupported operation');
    process.stdout.write(JSON.stringify({id,result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
});
