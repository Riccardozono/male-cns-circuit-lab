'use strict';
// Body telemetry is read-only evidence. It is never appended to observations.
const readline=require('node:readline'),Bridge=require('./neural-rl-additive.cjs');
let env;
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  let id=null;
  try {
    if(line.length>4096)throw Error('Message too large');
    const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
    let result;
    if(m.op==='init'){if(env)throw Error('Already initialized');env=Bridge.create();result=env.metadata();}
    else if(!env)throw Error('Initialize first');
    else if(m.op==='reset')result=env.reset(m.mode);
    else if(m.op==='step')result=env.step(m.action);
    else if(m.op==='metadata')result=env.metadata();
    else if(m.op==='inspect'){
      const s=env.inspect(),c=s.car;
      result={x:c.x,y:c.y,heading:c.heading,speedKmh:c.speed/(c.pixelsPerMeter||1)*3.6,
        steeringAngle:c.vehicle.steeringAngle,gear:c.vehicle.gear,rpm:c.vehicle.rpm,
        memory:c.brain.decoderMemory.slice(),amplitude:Math.min(1,Math.hypot(...c.brain.decoderMemory)*5),
        longitudinalAuthority:s.longitudinalAuthority,baseline:s.baseline.slice(),
        lastCommands:s.lastCommands.slice(),progress:c.bestProgress,lifetime:c.lifetime};
    } else throw Error('Unsupported operation');
    process.stdout.write(JSON.stringify({id,result})+'\n');
  } catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
});
