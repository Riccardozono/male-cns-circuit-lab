'use strict';

// In-memory research overlay: isolate one decoder7 pedal head while keeping
// the production sources and original save unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'work', 'decoder7-brake-aware-stopped-focus-rtx.cjs');
const decoderPath = path.join(root, 'work', 'decoder7-model.cjs');
const focusArg = process.argv.find(value => value.startsWith('--pedal-head-focus='));
const branchMode = focusArg ? focusArg.slice('--pedal-head-focus='.length) : '';
if (!['control', 'steering-only', 'steering-brake', 'gas-only', 'brake-only'].includes(branchMode)) {
  throw new Error('Specify --pedal-head-focus=control, steering-only, steering-brake, gas-only, or brake-only.');
}
const pedalHeadFocus = branchMode === 'control' ? '' : branchMode;

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const replaceExactly = (source, oldText, newText, count, label) => {
  const actual = source.split(oldText).length - 1;
  if (actual !== count) throw new Error(`${label}: expected ${count} occurrence(s), found ${actual}.`);
  return source.split(oldText).join(newText);
};

const originalDecoder = fs.readFileSync(decoderPath, 'utf8');
const focusExpression = "focus==='longitudinal'?[1,2]:focus==='steering'?[0]:focus==='combined'?[0,1,2]:null";
let patchedDecoder = branchMode === 'control' ? originalDecoder : replaceExactly(
  originalDecoder,
  focusExpression,
  "focus==='steering-only'?[0]:focus==='steering-brake'?[0,2]:focus==='gas-only'?[1]:focus==='brake-only'?[2]:" + focusExpression,
  1,
  'decoder7 local mutation focus'
);
if (branchMode !== 'control') {
  const contextFocusExpression = "const focusedActions=focus==='longitudinal'?[1,2]:focus==='steering'?[0]:focus==='combined'?[0,1,2]:[Math.floor(r()*3)]";
  patchedDecoder = replaceExactly(
    patchedDecoder,
    contextFocusExpression,
    "const focusedActions=focus==='longitudinal'?[1,2]:focus==='steering'?[0]:focus==='steering-only'?[0]:focus==='combined'?[0,1,2]:[Math.floor(r()*3)]",
    1,
    'decoder7 context steering focus'
  );
}

let runnerSource = fs.readFileSync(runnerPath, 'utf8');
runnerSource = replaceExactly(
  runnerSource,
  'state.population!==40',
  "state.population!==Number(arg('--population','40'))",
  1,
  'runner saved population guard'
);
runnerSource = replaceExactly(
  runnerSource,
  'state.rewardRevision!==Rewards.REVISION',
  '!Rewards.SUPPORTED_REVISIONS.includes(state.rewardRevision)',
  1,
  'runner saved reward revision guard'
);
runnerSource = replaceExactly(
  runnerSource,
  'settings.seed!==state.seed',
  'settings.seed!==(independentSeed??state.seed)',
  1,
  'runner paired independent seed validation'
);
runnerSource = replaceExactly(
  runnerSource,
  "const focusSteeringOverride=process.argv.includes('--focus-steering');",
  "const focusSteeringOverride=process.argv.includes('--focus-steering');\n  const pedalHeadFocusArg=arg('--pedal-head-focus','');\n  if(pedalHeadFocusArg&&!['control','steering-only','steering-brake','gas-only','brake-only'].includes(pedalHeadFocusArg))throw Error('Invalid pedal head focus.');\n  const pedalHeadFocus=pedalHeadFocusArg==='control'?'':pedalHeadFocusArg;",
  1,
  'runner pedal focus argument'
);
runnerSource = replaceExactly(
  runnerSource,
  "const runMode=brakeAwareStoppedFocus?'brake-aware-stopped-longitudinal-focus':signedMotorDecoder?'signed-longitudinal-decoder':fitnessBandMeters>0?'safe-progress-fitness-band':sparseSteeringOverride?'sparse-context-steering-mutation':focusSteeringOverride?'steering-focused-mutation':focusCombinedOverride?'combined-steering-longitudinal-mutation':contextMutation?'context-preserving-mutation':'natural-evolution';",
  "const runMode=pedalHeadFocus?pedalHeadFocus+'-focused-mutation':brakeAwareStoppedFocus?'brake-aware-stopped-longitudinal-focus':signedMotorDecoder?'signed-longitudinal-decoder':fitnessBandMeters>0?'safe-progress-fitness-band':sparseSteeringOverride?'sparse-context-steering-mutation':focusSteeringOverride?'steering-focused-mutation':focusCombinedOverride?'combined-steering-longitudinal-mutation':contextMutation?'context-preserving-mutation':'natural-evolution';",
  1,
  'runner mode label'
);
runnerSource = replaceExactly(
  runnerSource,
  "const applyRequestedFocus=focus=>focusSteeringOverride&&focus==='longitudinal'?'steering':focusCombinedOverride&&focus==='longitudinal'?'combined':focus;",
  "const applyRequestedFocus=focus=>pedalHeadFocus&&focus==='longitudinal'?pedalHeadFocus:focusSteeringOverride&&focus==='longitudinal'?'steering':focusCombinedOverride&&focus==='longitudinal'?'combined':focus;",
  1,
  'runner action focus'
);
runnerSource = replaceExactly(
  runnerSource,
  "if((focusSteeringOverride||focusCombinedOverride)&&requestedFocus==='longitudinal')recordFocusedMutation(graph,before,after);",
  "if((pedalHeadFocus||focusSteeringOverride||focusCombinedOverride)&&requestedFocus==='longitudinal')recordFocusedMutation(graph,before,after);",
  1,
  'runner action focus audit'
);
runnerSource = replaceExactly(
  runnerSource,
  "else if(focusCombinedOverride||focusSteeringOverride)L.safeMotorMutation=",
  "else if(pedalHeadFocus||focusCombinedOverride||focusSteeringOverride)L.safeMotorMutation=",
  1,
  'runner action focus mutation hook'
);
runnerSource = replaceExactly(
  runnerSource,
  "brakeAwareStoppedFocus,\n        frontierMutationFocusOverride:focusCombinedOverride?",
  "brakeAwareStoppedFocus,pedalHeadFocus:pedalHeadFocusArg,\n        frontierMutationFocusOverride:pedalHeadFocus?('longitudinal→'+pedalHeadFocus):focusCombinedOverride?",
  1,
  'runner report settings'
);
const sensorSteeringFocus = process.argv.includes('--sensor-steering-focus');
const sensorSteeringAntithetic = process.argv.includes('--antithetic-steering');
const sensorSteeringHandoff = process.argv.includes('--sensor-steering-handoff');
if (sensorSteeringAntithetic && !sensorSteeringFocus) {
  throw new Error('Antithetic steering requires --sensor-steering-focus.');
}
if (sensorSteeringHandoff && (!sensorSteeringFocus || !sensorSteeringAntithetic)) {
  throw new Error('Steering handoff requires sensor-conditioned antithetic steering.');
}
if (sensorSteeringFocus) {
  runnerSource = replaceExactly(
    runnerSource,
    "const brakeAwareStoppedFocus=process.argv.includes('--brake-aware-stopped-focus');",
    "const brakeAwareStoppedFocus=process.argv.includes('--brake-aware-stopped-focus');\n  const sensorSteeringFocus=process.argv.includes('--sensor-steering-focus');\n  const sensorSteeringAntithetic=process.argv.includes('--antithetic-steering');\n  const sensorSteeringHandoff=process.argv.includes('--sensor-steering-handoff');",
    1,
    'runner sensor-conditioned steering flag'
  );
  runnerSource = replaceExactly(
    runnerSource,
    "const runMode=pedalHeadFocus?pedalHeadFocus+'-focused-mutation':brakeAwareStoppedFocus?'brake-aware-stopped-longitudinal-focus':signedMotorDecoder?'signed-longitudinal-decoder':fitnessBandMeters>0?'safe-progress-fitness-band':sparseSteeringOverride?'sparse-context-steering-mutation':focusSteeringOverride?'steering-focused-mutation':focusCombinedOverride?'combined-steering-longitudinal-mutation':contextMutation?'context-preserving-mutation':'natural-evolution';",
    "const runMode=sensorSteeringHandoff?'sensor-conditioned-antithetic-steering-longitudinal-handoff':sensorSteeringAntithetic?'sensor-conditioned-antithetic-steering-focus':sensorSteeringFocus?'sensor-conditioned-steering-focus':pedalHeadFocus?pedalHeadFocus+'-focused-mutation':brakeAwareStoppedFocus?'brake-aware-stopped-longitudinal-focus':signedMotorDecoder?'signed-longitudinal-decoder':fitnessBandMeters>0?'safe-progress-fitness-band':sparseSteeringOverride?'sparse-context-steering-mutation':focusSteeringOverride?'steering-focused-mutation':focusCombinedOverride?'combined-steering-longitudinal-mutation':contextMutation?'context-preserving-mutation':'natural-evolution';",
    1,
    'runner sensor-conditioned mode label'
  );
  runnerSource = replaceExactly(
    runnerSource,
    'const originalSafeMotorMutation=L.safeMotorMutation;',
    `const originalSafeMotorMutation=L.safeMotorMutation;
  const sensorSteeringAntitheticAudit={enabled:sensorSteeringAntithetic,focusedMutations:0,pairs:0,unmatched:0,boundaryRejected:0,maxSymmetryError:0};
  let pendingSensorSteeringPair=null;
  if(sensorSteeringFocus)L.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
    // Always consume the normal mutation RNG, including for the mirrored half,
    // so control and treatment keep the same random-stream shape.
    const sampled=originalSafeMotorMutation(graph,values,r,amount,experience,focus);
    if(focus!=='steering'){
      if(pendingSensorSteeringPair){sensorSteeringAntitheticAudit.unmatched++;pendingSensorSteeringPair=null;}
      if(sensorSteeringHandoff&&focus==='longitudinal')recordFocusedMutation(graph,values,sampled);
      return sampled;
    }
    sensorSteeringAntitheticAudit.focusedMutations++;
    if(sensorSteeringAntithetic&&pendingSensorSteeringPair){
      const sameBase=pendingSensorSteeringPair.base.length===values.length&&pendingSensorSteeringPair.base.every((value,index)=>value===values[index]);
      if(sameBase){
        const opposite=L.scaleMutation(values,L.mirroredMutation(values,pendingSensorSteeringPair.candidate),1);
        let symmetryError=0;
        for(let i=0;i<values.length;i++)symmetryError=Math.max(symmetryError,Math.abs((pendingSensorSteeringPair.candidate[i]-values[i])+(opposite[i]-values[i])));
        if(symmetryError<1e-7){
          sensorSteeringAntitheticAudit.pairs++;
          sensorSteeringAntitheticAudit.maxSymmetryError=Math.max(sensorSteeringAntitheticAudit.maxSymmetryError,symmetryError);
          recordFocusedMutation(graph,values,opposite);
          pendingSensorSteeringPair=null;
          return opposite;
        }
        sensorSteeringAntitheticAudit.boundaryRejected++;
      }
      sensorSteeringAntitheticAudit.unmatched++;
      pendingSensorSteeringPair=null;
    }
    recordFocusedMutation(graph,values,sampled);
    if(sensorSteeringAntithetic)pendingSensorSteeringPair={base:values.slice(),candidate:sampled.slice()};
    return sampled;
  };`,
    1,
    'sensor-focused mutation audit hook'
  );
  runnerSource = replaceExactly(
    runnerSource,
    'mutationFocusAudit.changedByAction[1]!==0||mutationFocusAudit.changedByAction[2]!==0||mutationFocusAudit.nonActionChanges!==0',
    '(!sensorSteeringHandoff&&(mutationFocusAudit.changedByAction[1]!==0||mutationFocusAudit.changedByAction[2]!==0))||mutationFocusAudit.nonActionChanges!==0',
    2,
    'sensor-focused mutation action validation'
  );
  runnerSource = replaceExactly(
    runnerSource,
    'fitnessTieBandMeters:fitnessBandMeters||null,signedMotorDecoder,steeringGain,sparseContextSteeringMutation:sparseSteeringOverride?{selectedPerMutation:sparseFeatureCount,selection:"top-32 empirical neural-context variance with weighted sampling",energyMatched:true}:null,mutationFocusAudit,localSteeringDiagnostic:',
    'fitnessTieBandMeters:fitnessBandMeters||null,signedMotorDecoder,steeringGain,sparseContextSteeringMutation:sparseSteeringOverride?{selectedPerMutation:sparseFeatureCount,selection:"top-32 empirical neural-context variance with weighted sampling",energyMatched:true}:null,mutationFocusAudit,sensorSteeringAntitheticAudit,sensorSteeringHandoff,localSteeringDiagnostic:',
    1,
    'runner antithetic steering report field'
  );
  runnerSource = replaceExactly(
    runnerSource,
    "if(focusCombinedOverride&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction.some(count=>count<1)||mutationFocusAudit.nonActionChanges!==0))throw Error('Combined-focus mutation audit failed.');",
    "if(sensorSteeringAntithetic&&pendingSensorSteeringPair){sensorSteeringAntitheticAudit.unmatched++;pendingSensorSteeringPair=null;}\n    if(sensorSteeringAntithetic&&((!sensorSteeringHandoff&&sensorSteeringAntitheticAudit.focusedMutations!==mutationFocusAudit.calls)||sensorSteeringAntitheticAudit.focusedMutations<1||sensorSteeringAntitheticAudit.pairs*2<sensorSteeringAntitheticAudit.focusedMutations*.9||sensorSteeringAntitheticAudit.maxSymmetryError>=1e-7))throw Error('Antithetic steering-pair audit failed.');\n    if(sensorSteeringHandoff&&(mutationFocusAudit.changedByAction[1]+mutationFocusAudit.changedByAction[2]===0))throw Error('Steering-to-longitudinal handoff did not mutate either pedal head.');\n    if(focusCombinedOverride&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction.some(count=>count<1)||mutationFocusAudit.nonActionChanges!==0))throw Error('Combined-focus mutation audit failed.');",
    1,
    'runner antithetic steering integrity gate'
  );
}
const sensitiveFrontier = process.argv.includes('--sensitive-frontier');
if (sensitiveFrontier) {
  runnerSource = replaceExactly(
    runnerSource,
    "let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');",
    `let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');
if(process.argv.includes('--sensitive-frontier')){
  const current='this.track.total*.0005';
  if(simulationRuntimeSource.split(current).length-1!==3)throw Error('Expected the three safe/raw frontier thresholds.');
  simulationRuntimeSource=simulationRuntimeSource.split(current).join('this.track.total*.0001');
}`,
    1,
    'research-only safe-frontier promotion threshold'
  );
}
if (sensorSteeringFocus) {
  runnerSource = replaceExactly(
    runnerSource,
    "let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');",
    `let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');
if(process.argv.includes('--sensor-steering-focus')){
  const current="const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;";
  if(simulationRuntimeSource.split(current).length-1!==1)throw Error('Expected one frontier mutation-focus expression.');
  const sensorCondition="Number(safeProgressLeader.inputs?.[3])<.08&&Math.abs(Number(safeProgressLeader.outputs?.[0])||0)<.05";
  const handoffFlag=sensorSteeringHandoff?'true':'false';
  const steeringProgressHandoff=handoffFlag+"&&this.lastFrontierDiagnostics?.frontierMutationFocus==='steering'&&safeProgressLeader.bestProgress>(this.safeLearningFrontier?.progress??0)+1";
  const replacement="const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?("+sensorCondition+"?("+steeringProgressHandoff+"?'longitudinal':'steering'):'longitudinal'):null;";
  if(replacement.includes('sensorSteeringHandoff'))throw Error('Research handoff flag leaked into the simulation runtime.');
  simulationRuntimeSource=simulationRuntimeSource.replace(current,replacement);
}`,
    1,
    'research-only sensor-conditioned frontier action focus'
  );
}

if (process.argv.includes('--preflight') && !process.argv.includes('--runner-preflight')) {
  console.log(JSON.stringify({
    preflight: 'passed',
    pedalHeadFocus,
    sensitiveFrontier,
    sensorSteeringFocus,
    sensorSteeringAntithetic,
    sensorSteeringHandoff,
    decoderOverlaySha256: hash(patchedDecoder),
    runnerOverlaySha256: hash(runnerSource),
    checkpointGuard: runnerSource.match(/if\(state\.generation[\s\S]{0,260}/)?.[0] || null,
    runnerReplacements: 9 + Number(sensitiveFrontier) + (sensorSteeringFocus ? 6 : 0) + Number(sensorSteeringHandoff),
    productionFilesChanged: false
  }));
  process.exit(0);
}

const outputArg = process.argv.find(value => value.startsWith('--output='));
if (!outputArg) throw new Error('Specify an isolated --output directory.');
const outputPath = path.resolve(root, outputArg.slice('--output='.length));
if (fs.existsSync(outputPath)) throw new Error('Output directory already exists; refusing to overwrite evidence.');

const decoderSha256 = hash(originalDecoder);
const patchedDecoderSha256 = hash(patchedDecoder);
const runnerSha256 = hash(fs.readFileSync(runnerPath));
const patchedRunnerSha256 = hash(runnerSource);
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename === runnerPath && request === './decoder7-model.cjs') {
    const filename = Module._resolveFilename(request, parent, isMain);
    if (path.resolve(filename) !== decoderPath) throw new Error('Unexpected decoder7 module path.');
    const loadedDecoder = new Module(filename, parent);
    loadedDecoder.filename = filename;
    loadedDecoder.paths = Module._nodeModulePaths(path.dirname(filename));
    loadedDecoder._compile(patchedDecoder, filename);
    return loadedDecoder.exports;
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};

const loadedRunner = new Module(runnerPath, module);
loadedRunner.filename = runnerPath;
loadedRunner.paths = Module._nodeModulePaths(path.dirname(runnerPath));
try {
  loadedRunner._compile(runnerSource, runnerPath);
} finally {
  Module._load = originalLoad;
}

process.on('exit', () => {
  if (!fs.existsSync(outputPath)) return;
  const reportPath = path.join(outputPath, 'decoder7-main-runtime-result.json');
  const audit = {
    format: 'male-cns-v3-decoder7-independent-pedal-focus-v1',
    runtimeOnly: true,
    productionFilesChanged: false,
    savesChanged: false,
    branch: sensorSteeringHandoff ? 'sensor-steering-to-longitudinal-handoff' : sensorSteeringFocus ? 'sensor-steering-focus' : branchMode,
    mutatedAction: sensorSteeringHandoff ? null : sensorSteeringFocus ? 0 : pedalHeadFocus === 'steering-only' ? 0 : pedalHeadFocus === 'gas-only' ? 1 : pedalHeadFocus === 'brake-only' ? 2 : null,
    mutatedActions: sensorSteeringHandoff ? [0, 1, 2] : sensorSteeringFocus ? [0] : pedalHeadFocus === 'steering-brake' ? [0, 2] : branchMode === 'control' ? [] : [pedalHeadFocus === 'steering-only' ? 0 : pedalHeadFocus === 'gas-only' ? 1 : pedalHeadFocus === 'brake-only' ? 2 : 2],
    actionNames: ['steering', 'throttle', 'brake'],
    originalDecoderSha256: decoderSha256,
    runtimeDecoderOverlaySha256: patchedDecoderSha256,
    originalRunnerSha256: runnerSha256,
    patchedRunnerSha256,
    sensorSteeringFocus,
    sensorSteeringAntithetic,
    sensorSteeringHandoff,
    sensitiveFrontier,
    safeFrontierThresholdScale: sensitiveFrontier ? 0.0001 : null,
    overlay: [
      sensorSteeringHandoff ? 'The research runtime hands mutation from steering to throttle/brake after a safe steering gain greater than 1 m that remains stopped.' : sensorSteeringAntithetic ? 'The research runtime generates audited antithetic steering-only mutation pairs for the sensor-conditioned stopped frontier.' : sensorSteeringFocus ? 'The research runtime selects steering-only mutation when a stopped safe leader has a close front sensor and near-zero steering.' : null,
      sensitiveFrontier ? 'The research runtime changes the safe-frontier threshold scale from 0.05% to 0.01% of track length.' : null,
      !sensorSteeringFocus && !sensitiveFrontier ? 'Only decoder7 localMutation focus mapping was extended.' : null,
      'Production sources and saves were not modified.'
    ].filter(Boolean).join(' ')
  };
  fs.writeFileSync(path.join(outputPath, 'pedal-head-mutation-audit.json'), JSON.stringify(audit, null, 2), { flag: 'wx' });
  if (!fs.existsSync(reportPath)) return;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.settings.pedalHeadFocus = branchMode;
  report.runtimeDecoderOverlaySha256 = patchedDecoderSha256;
  report.researchHarnessAudit = audit;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
});
