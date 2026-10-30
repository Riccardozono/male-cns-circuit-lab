'use strict';
// Research-only adapter: substitute the separately re-verified current-driver
// copy for the byte-identical numeric parent whose earlier driver hash is stale.
const path=require('node:path'),Model=require('./neural-instant-context-model.cjs');
const STALE_DRIVER_MODEL=path.resolve(__dirname,'../.impeccable/review/neural-sacl/neuronal-instant-context256-first/clean.malecns-instant-context.json');
const CURRENT_DRIVER_MODEL=path.resolve(__dirname,'../.impeccable/review/neural-sacl/driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json');
const load=Model.load.bind(Model);
Model.load=(file,options)=>load(path.resolve(file)===STALE_DRIVER_MODEL?CURRENT_DRIVER_MODEL:file,options);
const Environment=require('./neural-mixture-feedback-env.cjs');
module.exports=Environment;
if(require.main===module){
 let env;
 const input=require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity});
 input.on('line',line=>{let id=null;try{if(line.length>262144)throw Error('Bounded message required');const message=JSON.parse(line);id=message.id;let result;if(message.op==='init'){if(env)throw Error('Already initialized');env=Environment.create();result=env.metadata();}else if(!env)throw Error('Initialize first');else if(message.op==='evaluate')result=env.evaluate(message.weights,message.mode);else if(message.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});
 input.on('close',()=>{if(env)require('./cuda-exact-v3-packed-runtime.cjs').close();});
}
