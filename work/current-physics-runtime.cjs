'use strict';
// Current simulation factory, independent of any prior learned controller.
// The optional first-lap continuation is an explicit research ablation only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const files=['outputs/simulation.js','outputs/vehicle-992.js','outputs/rewards.js','outputs/neural-learning.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function create(paceMode='strict'){
  if(!['strict','first-lap-moving'].includes(paceMode))throw Error('Unknown physical research mode.');
  const rewardsPath=path.join(root,'outputs/rewards.js'),simulationPath=path.join(root,'outputs/simulation.js');
  let rewardsSource=fs.readFileSync(rewardsPath,'utf8');
  if(paceMode==='first-lap-moving'){
    const marker="if(!recovering)reason='troppo lenta / senza progresso';";
    if(rewardsSource.split(marker).length!==2)throw Error('Pace termination source changed.');
    rewardsSource=rewardsSource.replace(marker,"const learningMotion=car.laps===0&&v>=RULES.brakeLockMotionMps&&recentPace>=RULES.brakeLockMotionMps*ppm&&s.highWater>previousHighWater+1e-12;\n        if(!recovering&&learningMotion)car.researchPaceContinuations=(car.researchPaceContinuations||0)+1;\n        if(!recovering&&!learningMotion)reason='troppo lenta / senza progresso';");
  }
  const rewardModule=new Module(rewardsPath,module);rewardModule.filename=rewardsPath;rewardModule.paths=Module._nodeModulePaths(path.dirname(rewardsPath));rewardModule._compile(rewardsSource,rewardsPath);
  const simulationModule=new Module(simulationPath,module);simulationModule.filename=simulationPath;simulationModule.paths=Module._nodeModulePaths(path.dirname(simulationPath));
  const previousRequire=simulationModule.require.bind(simulationModule);
  simulationModule.require=request=>request==='./rewards.js'?rewardModule.exports:previousRequire(request);
  simulationModule._compile(fs.readFileSync(simulationPath,'utf8'),simulationPath);
  return {F:simulationModule.exports,rewardOverlaySha256:sha(rewardsSource)};
}
module.exports={create,sourceHashes,sha};
