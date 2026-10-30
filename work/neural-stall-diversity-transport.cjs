'use strict';
const readline=require('node:readline'),{Archive}=require('./neural-diversity.cjs'),{rng}=require('../outputs/simulation.js');let archive,random;
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{
  if(line.length>1024*1024)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('ID required');let result;
  if(m.op==='init'){if(archive)throw Error('Already initialized');archive=new Archive(m.configuration);random=rng(m.seed);for(const r of m.seeds)archive.offer(r);result={dimensions:archive.dimensions};}
  else if(!archive)throw Error('Initialize first');else if(m.op==='ask')result=archive.ask(random);else if(m.op==='offer')result=m.candidates.map(r=>archive.offer(r));
  else if(m.op==='state')result={archive:archive.snapshot(),randomState:random.getState()};else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});
