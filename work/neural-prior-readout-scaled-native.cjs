'use strict';
const Core=require('./neural-prior-readout-scaled-core.cjs');
function create(){const frame=Core.createFrame();let observation,controls=0;const captured=new WeakSet();
 function state(){const s=frame.env.state();return {...s,x:observation.x,active:observation.active,controls};}
 function reset(){frame.env.reset();controls=0;observation=Core.observe(frame);return state();}
 function step(weights,latent=null){if(frame.env.state().complete)return state();if(latent===null){Core.validate(weights,frame.dimension);latent=Core.mean(observation.x,weights);}frame.env.stepWithCommands(Core.commands(latent,observation.active));controls++;if(!frame.env.state().complete)observation=Core.observe(frame);return state();}
 observation=Core.observe(frame);return {reset,step,state,capture(){const saved={prior:frame.env.capture(),observation:structuredClone(observation),controls};captured.add(saved);return saved;},restore(saved){if(!captured.has(saved))throw Error('Own actually reached state required');frame.env.restore(saved.prior);observation=structuredClone(saved.observation);controls=saved.controls;return state();},metadata:()=>Core.metadata(frame)};
}
module.exports={create,stats:Core.stats,close:Core.close};
