# Native learning extension

## LATEST CHECKPOINT — 2026-10-19: progress-only frontier and multi-start search

Two bounded experiments tested whether reward credit and search diversity were
the immediate bottleneck. They ran on the unchanged V3/current-driver prior,
Monza physics, and the verified 6,350 m prefix; no production reward, policy,
save, version, or release was changed.

`frontier-progress-only-270m-16x16-r1` used 128 actual candidate episodes
(35,186 new controls) over eight CMA generations. Its optimizer ranked only
actual added metres plus completed lap gates; collision/risk and R5 fitness
were recorded but excluded from ranking. The best remained the seeded policy:
270.289 m beyond the checkpoint, one lap total, then collision. CMA sigma
contracted from 0.28 to 0.1213 without finding a farther candidate. A complete
from-line replay also collided at 6,620.471 m (R5 2,249.107), below the
independent clean reference fitness 4,061.705. Numeric reconstruction passed;
not eligible and not promoted.

`frontier-multistart-progress-only-r1` then sampled 64 fixed-width mutations
around four diverse, exactly replayed archived policies (plus four parent
replays). It found no policy beyond the same 270.289 m frontier; the selected
full-from-line replay collided again. Numeric verification passed; not eligible
and not promoted.

These results rule out neither better learning objectives nor other
architectures, but they do show that merely removing the episode risk term,
restarting CMA at one frontier, or sampling four wider local neighborhoods did
not solve this V3 Monza block. The independent impact-window audit remains the
best concrete behavioral clue: the candidate reapplied throttle while forward
clearance was about 0.014 normalized, then collided. Next work should target
sensor-grounded credit for the observed braking/re-acceleration sequence or a
meaningfully different policy/readout, with clean full-from-line qualification.
The app remains at 5.6.0; preserve the user save and do not publish a version.

## LATEST CHECKPOINT — 2026-10-19: current-driver parity and frontier3-gated study

The saved research model recorded an older NVIDIA driver hash. A separate
copy refreshed only its runtime compatibility/provenance metadata; original model,
save, app source and release files remain unchanged. Current Node 24.19 on the
RTX 4060 (CUDA capability 8.9, driver version 13040) reproduces the exact
8,520-control baseline trace and metrics: 6,597.375 m, one 742.550 s lap,
then stall. A lockstep run with all 16 coefficients at +4 matches the zero
policy's complete vehicle state at every one of the 7,426 first-lap controls;
the actual `frontierNeuronalPeak_3` gate remains zero throughout. 15,948 GPU
calls, no CPU fallback. Proofs: `driver-current-refresh-v2/verification.json`
and `frontier3-current-driver-preflight/verification.json`.

The distinct frontier3-gated R8 study is TERMINAL: 256 actual candidate
episodes, 72,028 new controls, 16 exactly reconstructed CMA updates. The
zero-weight model remains the best clean sample. Full-from-line checks at
generations 1, 4, 8, 12 and 16 exactly reproduce the baseline. The farthest
candidate reaches 6,598.320 m (+0.945 m) but collides, with raw R5 2,184.583
and R8 1,684.583; two independent full-line native runs and its practice
replay agree. Not eligible, not promoted, not integrated. Numeric verification
report SHA-256 `0703f35b177d4d33c7653acfb34b5904ebf27be701dd54b08016ac5a69155393`.
The four training workers used the RTX 4060 for 156,972 neural CUDA calls in
total, with zero CPU fallbacks; the four physics simulations ran concurrently.

Actual impact-window telemetry (`frontier3-impact-window-v2/report.json`):
zero gas/brake overlap across either full episode. The candidate brakes at
controls 8459–8464 and slows from 11.76 to 5.83 m/s, then releases the brake
and applies 0.62–0.83 throttle as normalized forward clearance falls 0.05 to
0.01; it accelerates to 11.03 m/s at control 8474 and collides at 8475. The
physical brakes did respond in this replay; the risky re-acceleration is an
observed policy choice, not proof of a single causal defect. Next work should
improve credit for safe, sensor-grounded longitudinal decisions without
feeding scripted braking/route labels into the controller.

Do not repeat another 16-coefficient CMA run with only a renamed gate. Next
work should inspect an actual-control/physics mismatch in the late braking or
collision window, or change the learning signal/credit assignment materially.
The entire task remains ACTIVE: no two-lap model has been verified; keep the
Windows app at 5.6.0, preserve original saves, and do not publish a version.

HISTORICAL CHECKPOINT 2026-10-18: pinned learned one-lap prior, R8 and kernel search.
NEWEST OVERRIDE: normalizedGaussian76578 TERMINAL0:256actualcandidateepisodes/
48953NEWsuffixcontrols/16updates, bestremainszero6597.375m/1lap/stall. Numeric
greedyverifierPASS reportSHA273dc67015b15ebdf24461e4c7b06c4dbc75c176cd8ee5ed71276ed6b46b11d6.
Archive35374 TERMINALPASS selectedzero candidate practice+independentfullsame8520trace,
notglobaleligible. No promotion. Head authority fixed algebraically but no gain.
New hiddenmemoryaudit62099 TERMINALPASS:267actualobservations/33neuronalpeak
andretentionvalues, fullbaselineexact. stateHeadPeak0atALLsampledfirstlapand
throughcontrol8288, .8367629830852934by8384. Not explicit in642oldinput.
Audit usescontrol/lap/progress REPORTING ONLY, no policydata. Not causalproof.
Newneural-prior-memory-native.cjs addsreadonly actual stateHeadPeak accessor
within priorclosure (no wholecarclone orphysicalinput); memory-core usesit.
Newgated-kernel-native/env useexactsame642+ONEactualneuronalpeak gate,16motor
coefficients,8normalizedGaussianbasis. Gatezero=>prior directly, no laps/clock/
pose/route branch inpolicy. Corrects inheritedunused64dense-headmetadata.
Gatedpreflight44984 TERMINALPASS:
Thisproof doesTWOindependentfromline drives lockstep throughfirstlap under
zero andEXTREME+4weights, comparingWHOLEstates EACHCONTROL and checkinggate0.
Then actual lategatepositive +changedcommands+restore afterreset exact.
7426FIRSTLAPwholeactualstates identicalunderEXTREME+4vszero;64tailchanged
commands/64exactreplayedtransitions;actualtailgate.59883137579566. Fullzero
baseline8520exact. No newlearned2laps. Newtrainer train_neural_prior_gated_kernel.py
uses newneural-prior-gated-common-search.cjs, NOT oldgreedysearch: same16
diagonalvariances .16steer/1long; offdiagonal SAMECONTROLcorrelation .75,
crossmotor0. TwoextraalgebratestsPASS. Broadens rawmotor exploration under
normalizedbasis, not a measuredlearninggain. Source and dataproofs preserved.
Historical job5030 `learned-prior-gated-kernel-frontier16-first` is now
terminal: all 16 generations, numeric verifier and independent native archive
checks completed. The first-generation 6,621.870 m result was a crash, not a
clean/global improvement; no promotion. Newest status is the 2026-10-19 block
above; no trainer is left running.
Numeric verifier MUST be
verify_neural_prior_gated_kernel.py (usescommoncovsearch). Independent
verify-neural-prior-gated-kernel-native.cjs /archive.cjs afterreport. On any
candidate qualifycleanfull-line global6599.862 rawfitness/distance/laps guard.
No app integration/version/release/commit/push/savechange. Goal ACTIVE, still1lap.
Historical hypothesis about `frontierNeuronalPeak_3` was exercised only in a
new driver-refresh family; see the latest checkpoint above. It stayed zero on
the exact first lap, but did not yield a clean full-line improvement. This is
not evidence that the neural memory caused or solved the stall.

ADDITIONAL CURRENT CHECKPOINT: kernel77703 TERMINAL0 256actualcandidateepisodes,
53198NEWsuffixcontrols/16CMAupdates, NO gain. Numeric verifierPASS reportSHA
f8c9d219c05e9382b82efe822d20a174d3bacac2c97b39c8ffce24b3476c3698.
archive58168 TERMINALPASS: selectedzero candidate practice+independentfull
exact8520controls, not globaleligible. Allbestweights0 unchangedbaseline.
Actual retention collector91257 TERMINALPASS:1857firstlap+273later642inputs,
stride4, fullpriortraceexact. dataSHA c63b98706ce0940105e456da5256fbde8ccb6f0155fca4aecaf4b0c8c5e54a8c.
Authorityaudit actualtail20: ALL cannot throttle underoldcompactbasis±4genes;
bestpossiblelong max-.41549, not globalimpossibilityproof. No appbrakeclaim.
First greedycompact fit failed authorityassert beforeexport; emptyfolder and
source preserved. Newfit_neural_prior_greedy_support_r2.py TERMINAL0: normalized
Gaussian8kernels, sameactual273inputs/scaler/groups/centres/radiusfittingrule;
softmax removesvanishinggate. Sourcepacket learned-prior-greedy-support-r2.
New greedy-kernel-motors/native/env/search (16weights, scale steer.5/long1,
initialsteercov.16/long1, sigma.7 so comparableinitialsteernoise). Full command
authority includingsteer retained; NO prefixprotectionclaim. Threeactual2130
input/covariance/bounds testsPASS. Preflight86188 TERMINAL0 8520fulltraceexact,
410newpracticecontrols,64changedpolicyrestoretransitionsPASS. Newnormalized
Gaussiantraining nowstarted train_neural_prior_greedy_kernel.py,
--tag learned-prior-greedy-kernel-frontier16-first --generations16 --objective frontier.
Get current processhandle and state, doNOT restart. Then verify_neural_prior_greedy_kernel.py,
verify-neural-prior-greedy-kernel-native.cjs and/or archive.cjs. Oldnumeric
verifier usesisotropicsearch so MUSTNOT useit for newanisotropicsearch.
Alloldfrozenfiles/sourceproofs preserved. App/default/save/releaseunchanged.
Metadata caveat: inherited artificialHiddenUnits64 fromunusedfree-final-head
metadata does NOT describe newGaussianhead; actualnew readout16coefficients/
8Gaussianfunctions. Code commands doNOT useold42566weighthead. Don't mutate
frozenpreflight source tofixjustmetadata; annotate studies honestly.

Read PRIOR-NEURALE-E-ESPLORAZIONE-DEV.md FIRST; older live-job notes below
are historical. Goal ACTIVE, no newly learned two-lap policy/app integration.
All251DN motorpool58409 and AR1variant96465 are TERMINAL; numeric/native
proofsPASS but no gains. New642feature pinned learned prior preserves exact
6597.375m/1lap via free42566final readout; zeroablation stopscar. Not full
biological/coldstart learning. Actual6350checkpoint restore and CUDAinit fixed.
R8adds500 on terminalcrash/offroad/invalid; retains2300stall. Corrects actual
low-speed-crash-v-stall ranking; rawR5physicsunchanged. Calibration-r2
2048actualtransitions/19completedepisodes,1024input scaler; physicalall2048PASS.
New PPO55421 TERMINAL0:65536new/381eps/64updates; ALL8full-line mean evals0m.
Verifier75524 TERMINALPASS (verification.json inspected), reportSHA
bccd67f3c1c152da87c613b8c32af84c2bb5ded783dedeb372c6f84a40f8d79f.
Independent latest native PASS81controls/0m/0lap/stall,0CPUfallback.
Not promoted; initialone-lap prior remains conserved, not newlearninggain.
Unsupervised8kernel fit: learned-prior-local-support/support.json.
Profile63607 TERMINALPASS fullbaselineexact; gatepositive6624/7426firstlap,
1022/1094afterfirstlap; max.897/.920. NOT prefix protection. No gateinput
uses lap/pose/clock; lapreportlabels ONLY. Sourcefitstats fixed, no teacher.
New kernel-motor16coefficient deterministic-search files prepared, all642
actualneuronal/history/prior features, rawboundedmotors, same251DN/7721cells.
Two kernel algebra/actual2048input testsPASS. Kernel preflight31368 TERMINAL0:
8520full-line exact/410newpracticecontrols,64changedpolicyrestoretransitionsPASS.
CURRENT OWNED JOB77703 train_neural_prior_kernel.py,
tag learned-prior-kernel-frontier16-first --generations16 --objective frontier.
Do not restart; poll/revalidate. On terminal report verify_neural_prior_kernel.py and
verify-neural-prior-kernel-native.cjs. Frontier ONLY research exploration;
even farther crashes cannot promote. Full-from-line clean global6599.862
rawfitness/laps/distance guard preserved. Prior practice restored firstlap
NEVER counted asnewlearnedlap. Alloldfrozenfiles/app/save/releaseunchanged.

NEWEST GOAL CHECKPOINT — all251DN actually trained; correlated exploration live.
Previous goalturn PROGRESS, current PROGRESS. Goal ACTIVE, no two-lap solution.
New264input preparation direct-motorpool-initial-calibration:4096actual
transitions,5completeepisodes,3fitlanes+1heldout; scalar fitfirst1024inputs.
Critic offset-63.51700340070179, heldoutRMSE64.62275->1.65054;4096native
comparisonsPASS. Model uses251realDN+12contexts+bias,17618motorparams,
same7721/242486anatomicalreservoir/encoder/gains/contextbasisfrozen.
Motorpool scaled preflight30984 TERMINAL0 initial803.478m trace exact+64samples.
Actual-observation Torch/Node264test77092 terminalPASS.
Training58409 TERMINAL0 direct-neuronal-motorpool64-r7-first:
65536PPOtransitions PLUS4096warmup/94completedtrainingepisodes/64updates.
All8mean evals0laps. Latest790.830491m stall/R5-3584.361221/R7-5884.361221.
Verifier20287 terminalPASS all64optimizer/critic updates, compressedrecords.
Report e050283c5e07e648fbd9181010f6f30b4ab7f6f51aafa189abfdd49796a9767c.
Native708controls exact,0fallback. No promotion or app changes.
New records gzip lossless/stablemtime0; no fullhistory rewrite eachupdate;
use neuronal_compressed_records.read_record. Oldsources/data preserved.
Temporal variant: own AR1 exploration rho.9, innovation std=sigma*sqrt(1-rho^2)
afterfirststep, sigma onfirststep/reset. Deterministic mean policy unchanged.
PPO conditional mean=mu(x)+rho*(previousAction-mu(previousX)); previous mu
recomputed on CURRENT weights. Correct heteroskedastic density and gradients,
not naive IID likelihood. Inactive signal clears exploration history.
Preflight93315 terminalPASS fullbaseline exact +128actualtransition replay
across weightchange +reset clears history. Puregradient/actualdata unit70651
terminalPASS; actor/critic/RNGinitial identical. Newsource files:
neural-direct-motorpool-temporal-env.cjs, neural-direct-temporal-noise.cjs,
neural_temporal_policy.py,direct_neuronal_ppo_motorpool_temporal.py.
CURRENT OWNED JOB96465 train_direct_neuronal_ppo_motorpool_temporal.py,
tag direct-neuronal-temporal64-r7-first, requested64updates. Revalidate handle
and OSprocess. First1024 physical transitions use2048same Gaussianinnovations
as IIDcontrol (maxerror3.11e-15), only temporalcorrelation differs. Newphysical
trajectories expected; no teacheractions. Allmean evaluations fromline.
On finish run verify_direct_ppo_motorpool_temporal.py (checks history across
updates/reset) then verify-direct-motorpool-latest-native.cjs on that tag.
Potential next direction if negative: preserve stronger already-learned
one-lap policy as neuronal hidden representation with a freely trainable
final motor readout. Sourceinspection shows old chain/head/instant callbacks
receive actual neural516history+internaldecoder states only, no route/clock/
progress targets. No new strong-prior adapter implemented yet. Do not claim
such warmstart is end-to-end biological training or a coldstart policy.

CURRENT GOAL CHECKPOINT 2026-10-18 — nonlinear decoder, recovery, scale,
critic calibration and temporal-credit study. Previous goalturn PROGRESS.
See DECODER-NONLINEARE-DEV.md. Goal ACTIVE; no new two-lap solution.
5276motorparameters (154linear +77x64tanhx2), alltrainable, same actualV3
7721/242486 neural reservoir. Initial output branch zero preserves exact
baseline803.478443m crash; not biological neuroncount increase.
Nonlinear first study stopped54updates, original handle35279 MISSING and
no matching OSprocess, no report. Resume44167 TERMINAL0 actually replays
55296oldtransitions EXACT, numeric optimizer/RNG/physics, then10240new.
New resumedreport65536UNIQUEtransitions/115episodes/64updates, latest695.945m
crash0laps. Numericverifier47590 terminalPASS, native476controls exact.
Report22a01c84ba8714a6e423915ba492f5162409f6c82c4bed1901b5f4c75a7042d6.
Rawfeature audit and fixed first1024input-only normalizer added; zerohead
initialpolicy/native parity againPASS. Scaledstudy42232 TERMINAL0:
65536/338episodes/64updates, latest17.879938m stall0laps, R7-6696.411250.
Verifier13335 terminalPASS, native161controls exact,0fallback.
Report4aa3f0b7adc3662494976b2962875ea3d9690768e27699db8fc26c29741b1a0a.
Criticcalibration96610 TERMINAL0:4096actualwarmuptransitions/5completeeps,
3fitlanes+1heldout. One outputbias offset-63.50873463115077, heldoutRMSE
64.6121->1.64254, actual4096native comparisonsPASS. Actor/RNG unchanged.
Calibratedstudy1609 TERMINAL0:65536PPOtransitions PLUS4096warmup/95eps/64updates.
Latest798.080814m stall0laps, R7-5874.785537; no drivinggain over803m baseline.
Verifier12543 terminalPASS, native686controls exact,0fallback.
Reportb274536c9f7fe4e24595acdc299e6957d69caa8f8a4c461c8e55312dba3aba57.
Wholecredit79598 TERMINAL0: study direct-neuronal-wholecredit64-r7-first,
65536PPOtransitions/131episodes/64updates. Only GAE lambda .98->1;
unitPASS temporal credit, terminal/no-lane leak/bootstrap. All8evals0laps.
Max804.836m crash/R7-5392.457 worse thanbaseline; last707.274m/crash.
Verifier1112 TERMINAL0 completePASS; native481controls exact,0fallback.
Report41ff05692ea60f341c7ce1df83b266f112aa10fe917da15645a5de1fab2b63c6.
NEW actual curriculum: five snapshots initialpolicy controls451/510/547/574/605,
reachedphysicallybefore803mfailure. Entire car+observedbrain+rewardledger.
Preflight99991 TERMINAL0:5fullstate matches and320actualtransition comparisons,
full-linebaseline trace unchanged. Policy inputs same77; checkpointidentity,
pose/time never supplied. Reset .25fromline/.75uniformactualsnapshots.
actualNewControls/Progress exclude historicalprefix, all evalsFULLFROMLINE.
Curriculum startup12375 TERMINAL1 before anyrollout: a freshprocess whose
initialreset was a snapshot had not run CUDA yet, so identity correctly
rejected it. Sources/evidence preserved. New env-r2 performs a real unused
freshline observation FIRST, then selected trainingreset; snapshot neural
state is not advanced. New isolated-process startupchecks cover all4seeds.
Preflight71527 TERMINAL1 in source-closure scanner of embedded require path,
after physicalchecks; fixed diagnostic absolute child paths before proof.
Curriculum preflight74030 TERMINAL0, direct-neuronal-curriculum-preflight-r2b:
320actualtransitions,5body/neuralstate matches,4freshprocessGPUstartsPASS.
Training64372 TERMINAL0 direct-neuronal-curriculum64-r7-r2:65536PPOtransitions,
64updates/344completedepisodes (78fromline,266checkpoint), all8full-lineevals0laps.
Latest727.499954558m crash/R7-5580.270141902, no candidate. Verifier42485
TERMINAL0 allupdates and prefix-vs-newmotionledgerPASS; native521controls exact,
0fallback. Report16787aa159246e4f26e1851da90f9dfa998be771ec60dcc935037d0908a34c7d.
No promotion. Samewholecredit learner/critic/seeds/rewards; reset-only trial.
NEW NEXT DIRECTION backed by actualgraph:251descendingcells exist, olddecoder
read64. neural-direct-motorpool-core.cjs now reads all251 plus12contexts+bias
=264features/17618motorparams. Same7721/242486reservoir/CUDApass; extra linear
coeffs+nonlinearoutput startzero, old64activityguard unchanged. No new anatomy.
Preflight6223 TERMINAL0 initialfulltrace exact+64actualstochasticcomparisons.
Numeric264fixture34523 TERMINAL0 grad/layout/Torch-JS/RNG/criticPASS.
Transport variant accepts1MiB, proof actual366171character request+64native
transitionsPASS. Use neural-direct-motorpool-env-transport.cjs for training,
NOT original262k-limited motorpool-env.cjs. Sources/proofs frozen.
ALL CURRENT OWNED JOBS TERMINAL. No training job running at checkpoint.
NEXT implement compatible264input preprocessing/critic then actual controlled
training for all251DNreadout. Existing scaled/calibrated learners hardcode77
and MUST NOT be reused unchanged. Generic direct_neuronal_ppo_nonlinear.py
handles264 shape but lacks new normalization/calibration. No trained17618
model exists yet. Do not claim learning gain, install or goalcompletion.
No promotion/release/version/commit/push/savechanges; appengine2a851...dcd
and default0d239...908 rechecked. Globalstrongerresearch6599.861744/1slowLap.

NEWEST GOAL CHECKPOINT — actual action audit + isolated steering exploration.
Read ESPLORAZIONE-STERZO-DIRETTA-DEV.md for scope and evidence.
R7 control recorded65536 transitions audited: no meancommand abs>.99;
observed steeringnoiseRMS .020153, longitudinal .019801, not saturation.
New separate steering-only study starts std(.08,.02) vs control(.02,.02).
Same154initialweights/critic/seeds/PPO/R7physics. Constructor unittestPASS;
matched1024transitions/2048standardnormaldraws error1.5544e-15, actual
physical trajectories expected different, no teacheractions.
Study5083 TERMINAL0:64updates/65536transitions/223completedtrainingepisodes.
Eight fullmean evaluations all0laps; best UPDATED distance641.946m/update8,
latest369.463090492m/crash/fitness-5969.408090. Bestscore remains INITIAL803m.
Verifier27135 TERMINAL0 all64 numericupdates exactly reconstructed;
reportSHA4c985dcdc4394c99e357f64e67b834102fc399f28c836e3b640f2b7c77d35d5e.
latest-policy-native.json PASS actual361controls, exactfulltrace,0fallback.
No globalcandidate, no promotion, no release/version/commit/push/save edits.
App engine2a851...dcd/default0d239...908 and originalsave29ef...943e3 rechecked.
All current ownedjobs5083/15620/27135/native verification terminal.
Next material direction: nonlinear DIRECT readout with identical initial
meanpolicy and separate native parity/proofs, NOT implemented yet. Do not
repeat same negative noise study. Goal active, no two-lap solution obtained.

NEWEST GOAL CHECKPOINT — R7 complete-failure parity + actual neural sensitivity.
Previous goalturn PROGRESS: direct154readout, actualR5 idle inversion,R6pairfix,
three controlledstudies and exactupdates/nativechecks. Currentturn PROGRESS:
corrected remaining matchednearcorner ordering, controlledR7study and local
28channel transfer audit; NO driving gain or globalcandidate.
New neural-direct-training-objective-r7.cjs adds2300 ONLY on actualterminal
stall/slow, i.e collision3200+maximpact500-stall1400. No physics/termination,
R5rawscore/crashpenalty/source edits. R6andalloldproofs frozen/separate.
Two unit testsPASS. Actual R7preflight repeats baseline803.478443m crash and
R6lowselected796.184572m stall in training/native; originaltraces unchanged,
R7 scores-5389.358099 vs-5876.656321 (R6stall-5376.656321). Also64actual
stochastic transitions replayed. Corrects THIS ordering, not universalreward.
Study62633 terminal0 direct-neuronal-ppo64-from-line-r7:
65536actualtransitions/112completedrolloutepisodes/64updates. Sameinitial
policy/critic/seeds/lowstd(.02,.02)/PPO asR6low; onlyterminalcost changed.
Independentnumericverifier45818 terminalPASS allweights/std/losses/criticSHA.
Report1b356f0bf4306fc4e63847690da9da7135ab3e9cee9792cb52c76f3f3d8e926a.
matched-controlled-prefix.json PASS2048actualphysicaltransitions identical,
oneextra500terminalcost row; actorpoliciesfirstdivergeupdate3. Olddata only
compared AFTER independentphysicalsampling, never actionlabels.
No meanimprovement; bestByR7scoreinitial803m. Latest704.436828m/0lap/crash,
rawR5andR7-5601.546782. Actuallatest-policy-native.json PASS487controls
exacttrace/results,0fallback. Not a new champion or goalcompletion.
Additional actualreadout neural audit: direct-neural-observability, native
rootreachescontrol600/progress764.415396765. Perturb ONLY CLONED braininput
vectors on28channels for1or3controls; no vehiclecontrols/trainingdata.
Originalwholebaseline trace preservedexactly. Jacobian28x77 localrank28 at
relative1e-6, no channelnorm<1e-12 bothhorizons. Local at ONE actually reached
state, NOT universalobservability or learnability proof. Does not support
blaming disconnectedinputs there. Rawmetadata/readout real64DN+12contexts.
All ownedprocesses62633/45818/nativeaudit terminal; revalidate no live jobs.
Windows default0d239...908/engine2a851...dcd unchanged; GLOBALresearch remains
6599.861744225725/4061.7051939257017/ONEslowLap. No appwindow/release/version/
tag/commit/push or save changes. Goal active, notblocked: meaningful alternatives.
See PENALITA-TERMINALI-COMPLETE-DEV.md for fullscope/evidence.
NEXT MATERIAL WORK: inspect actual action-latent saturation/exploration and
consider nonlinear DIRECT neuronal readout (all branches trainable, no frozen
driver/projection/teacher), rather than more identical64update PPO runs or
blind sensorcount increase. Preserve complete-failure penalty/rawR5comparison,
sameMonza/GT3physics/anatomicalgraph and oldstrongerchampion. Initial nonlinear
branch should be zero so meanpolicy baseline reproduces exactly beforetraining.

NEWEST GOAL CHECKPOINT — DIRECT154 PPO + observed idle-reward inversion.
Previous turn PROGRESS: mixture19 integration/negative studies, exacttransfer.
Current turn PROGRESS: genuinely different trainable direct readout/no cascade,
physical preflights, reward-ranking defect identified/corrected for matchedpair,
three controlled actualPPOstudies and allnumericalupdates independently verified.
Goal NOT achieved; all meanpolicies0laps, no strongerglobalcandidate.
New neural-direct-policy-core.cjs uses actual7721/242486 V3 reservoir,28sensors,
64realDN+12fixedneuronalcontexts+bias=77features,154ALLtrainablemotorweights.
Warmstarts sensory/gains AND prior learnedlinearreadout, NOT fullcoldstart.
ExplicitCUDA injection/pass without oldmotorcommand or RBFmotorcascade;
normalised neuronal features only, signalguard; no route/time/teacher/actionslabels.
Old train-neural-ppo.cjs WAS direct but oldobjective+prefixprojection/curriculum;
this uses fullfromline R5GT3physics/no projection. No claimfirsteverPPO.
Initial verifier field name.n mistaken vs.nodes fixed BEFORE anyproof; empty
firstpreflight dirpreserved. direct-neuronal-policy-preflight-r2 PASS: meanbaseline
648controls/native exact +64actualstochastic transitions replayedindependently.
Baseline803.478443m/-5389.358099pts/0lap/crash64.75s,154parameters.
direct_neuronal_ppo.py: perenv GAE gamma1/lambda.98; separateActor/CriticAdam,
active-neural mask, reward/100, no anchors/projection,154weights+2explorationstd.
Two GAE testsPASS terminal/lane isolation and unfinished bootstrap.
R5study84391 terminal0 direct-neuronal-ppo64-from-line:65536actualtransitions,
304actualterminatedtrainingepisodes/64updates; verifier96350 PASS exactallweights/
std/losses/criticSHA. Report9c69ca87e45fd1825d93ad11b8e5bc8051de288e75edf9e6d63f65387c1ea5c9.
R5bestByFitness actually87.907011m stalled/-4346.300352 >baseline803m crash/-5389!
Highertrainingfitness != betterdriving. No lap/globalcandidate promoted.
R6 private training-only terminaladjustment1800 =collision3200-stall1400.
No R5file/physics/termination/crashcost modified. ActualrawR5 andR6score separate.
Matchedpair preflight-R6 PASS bothfullpolicies and64transitions: samephysics/
commands; 88mR6-6146.300352 now worse than803mcrashR6-5389.358099. Two testsPASS
no invented penalties on unfinishedrollouts. Onlythispair corrected, notgeneral.
R6study32002 terminal0:65536actual/214episodes/64updates, no meanimprovement.
First1024physicaltransitions matchedR5 exactly,6terminalrewardrows differ.
Verifier43895 PASS64updates; reportff3d64d408199081db555e294e663df996a5e95e5844ed7d9cb2ba42bb8a9f49.
Low-noise ablation10390 terminal0 direct-neuronal-ppo64-from-line-r6-low-noise:
ONLYinitialstd .02,.02 instead .08,.2; sameweights/critic/seeds/R6/algorithm.
Matched2048normalizedrandomdraws across1024transitions to1.33e-15;
trajectories EXPECTEDdifferent because noisescalechanged.65536actual/95episodes/
64updates, verifier27022 PASS exactallupdates. Report7d7cd9405f1c9a06949b38a9dda7e59b58fab3793386b837d1e697695c201f96.
Maxmeanprogress805.208224m CRASHED, no globalimprovement. BestByR6score796.184572m
STALLED,rawR5-3576.656321/R6-5376.656321 stillslightlyprefers stopnearcorner
overinitial803mcrash-5389.358099. Basefailureparitydoesn'tincludeimpactpenalty.
Actualnative independent-mean-native proof PASS685controls/0fallback exact;
R6scoreandrawphysicsbothconfirmed. This is NOT a betterdriver or1lap.
All three studies65536each=196608actualtrainingtransitions, not laps/generations;
numerical verifiers reconstruct, do NOT create another196608physicaltransitions.
All ownedjobsconfirmedterminal; no known liveprocesses, revalidateifneeded.
Windows engine2a851...dcd/default0d239...908 remainunchanged; globalresearch
6599.861744/4061.705194/ONEslowLap remains. No release/version/tag/push/commit.
See POLITICA-NEURALE-DIRETTA-DEV.md for sources/limits/commands.
NEXT MATERIAL WORK: investigate complete terminalfailurecost (R5impact500
in addition to basecollision3200) so stoppingnearcorner isn't locallycheaper,
and/or nonlinear trainableneuronalreadout. Do not blindlyrerun same64PPO.
Preserve exactpairtests/physicaltraces and R5 rawglobalpromotionthreshold.
Never declare newR6higherfitness as betterdriving; no route/teacher/forcedgas.

NEWEST CHECKPOINT — learned mixture19 integrated, all studies TERMINAL NEGATIVE.
Previous turn PROGRESS: authoritybound and tiny2.85cm verified coordinate gain.
Current turn PROGRESS: actual dual-inference integration with ownpeak state,
exactzero preservation and positive-mixture native transfer + widerbias audit.
No bestclean improvement; no two laps/goalcompletion claimed.
New neural-mixture-feedback-model.cjs validates latestcoordinate report/
verifier/nativeproof and sources; initialgenome latest18weights +mixture0.
Native and Bridge19 use observed neuronalmemory current/peak learnedmixture;
ownreset/capture/restore forpeak. Current8descendingneurons still drive readout,
no route/clock/teacher/fixedmotorcommand. Physicalrules/penalties unchanged.
Two unit testsPASS. Preflight1115 terminalPASS8531controls exact latestbaseline,
tracea6304cc3c1c7c71582699b61cccc6207182a463f2520deec7d573769c4357d4d,
8531GPUcalls0fallback. Zeromixturefinalgate.2825989382004964.
Study74304 terminal0: neuronal-mixture-feedback256-first,
256actual/16CMAupdates/20452suffixcontrols/97.765s. NO bestClean.
146crash/66stall/44slow. Independent source/CMA/record verifierPASS.
Reporte03d125d8607453f9cbe759a4f3cf78038d0cbb49a3b79d60d65ebb57f87f344.
Positive-mixture native48432 terminalPASS8450controls, retainedgate actually
used73controls, mixtureparam1.435397375 effective1. Actual6618.772821m/
2188.138409pts CRASHED; exacttrace3e8e284dc49cd551dcc4ebb0098ad748b7c3242a6738ac559e4343d275a65006.
Single-axis native99749 terminal0 keeps18weights, changesONLYmixture1:
6588.572834m/2204.525444pts CRASHED,retained52controls/finalgate1. Not better.
Broader same-family biasgrid19784 terminal0:neuronal-mixture-bias-grid81-first,
81actualtrials/3627suffixcontrols/45.828s,52crash29stall, no cleanimprovement.
Four actualprefixes +baselinepractices checked; fullnativebaseline reused
with identicalsources, NOT anewfullpreflight. Centre equals actualsingleaxis
nativefulltrace. Independent grid/source/record verifierPASS.
Reporte0899bdcd2ee7b6b6254ae03d26f21e768f0126375badb9550aaa80a7e75db1d.
Furthest6626.593784m CRASHED, not promoted. Do not inflate81prefix trials to laps.
GLOBAL researchbaseline unchanged6599.861744225725/4061.7051939257017/ONEslowLap.
No known ownedjobs remain; allhandlesaboveconfirmedterminal. Revalidateifneeded.
UsableWindows default0d239...908/engine2a851...dcd untouched; no savechanges,
appwindow/version/tag/commit/push/release. See MISCELA-GUADAGNO-NEURALE-DEV.md.
NEXT MATERIAL WORK: reconsider directly trainable neuronal policy ratherthan
blindly adding stages/bias/gate sweeps to frozen cascade. Preserve sameactual
MaleCNS V3 graph, Monza, GT3physics and officialevaluation; no teacher or route.
Inspect existing direct-policy/PPO/native utilities first to avoid duplicate
oldstudies. A separate train-from-line current-neuronal actor can be tested
without replacing frozen app or claiming a smaller/easier track as success.
If trying fromscratch, preserve previous learned parameterdata and disclose
scope; biologicalgraph is not full physiological simulation. Goal staysactive.

NEWEST GOAL CHECKPOINT — surrogate rejected, coordinate study + authority audit.
Previous turn PROGRESS: current-feedback R2 bugfix+actualnegative256study.
Current turn PROGRESS: new evidence pinpoints restricted late motor authority;
prospective predictor gate rejected and only microscopic genuine clean gain.
No two-lap solution; no claim goal achieved.
RBF parameter->fitness predictor calibrated on previous256actualrecords:
241uniquegenotypes grouped BEFORE split,150train/45validation/46test.
Validation chooses length2/ridge.1; testMAE797.515242 vsconstant829.772278,
fails preregistered10%gain gate. NO surrogate-proposed physicaltrials executed.
Fresh reconstructionPASSED calibration3cb08ba1daa4984c64bdb735a785e60c1b8de5d01128c343682da3467cf92622.
Actual pairedcoordinate study49573 terminal0: neuronal-coordinate-feedback8-first,
8cycles/328trials(288opposedmutations+40actualprotectedreevaluations),
31116suffixcontrols/2parameterupdates/164.11s inclfullproofs. Two unit testsPASS.
Independent verifierPASSED allproposals/updates/radius/protectedtraces.
Reportab1bbc557fd87d180d1fbe1ab6fc01f6b45deea14b58dda3ea3d3310a55c449b.
Bestclean6599.861744225725m/4061.7051939257017pts/ONE lap742.5501609581744s,
then stalled853.083333s. Gain.028487754m (~2.85cm) NOT a solution.
Two completeBridgeproofs + independentnative50924 terminalPASS8531controls,
8531GPUcalls0fallback; tracea6304cc3c1c7c71582699b61cccc6207182a463f2520deec7d573769c4357d4d.
GLOBAL researchbaseline now6599.861744/4061.705194 (not easier6599.833).
Actualzero-readout authorityaudit45443 terminalPASS on previous6599.833root:
current-feedback-authority-audit.json,8531controls traceunchanged. AFTER-step
memory corresponds to command just used.155active/114parentbraking;
85 states optimisticlong=parentLong+2gate<=0, so cannot positivegas THERE.
Maxgate1,finalgate.31009353314687177,parentLong-.9857517564316705,
maxoptimisticLong-.3655646901379269. DoesNOT prove all trajectories impossible
or solefailurecause; applies to NEW current-feedback readout, not oldgate1audit.
New unit-only neural-learned-feedback-gate.cjs: bounded learnedmixture of
currentdecay and retainedactualpeak. Mix0 EXACToldgate, mix1 peak. Two testsPASS
owncapture/reset/numericalbound. NOT integrated/trained/deployed yet.
NEXT MATERIAL WORK: integrate this LEARNED mixture as19th parameter, initial
genes current verified coordinate18weights +mix0, preservingGLOBALbaseline.
Native/Bridge need own peakstate reset/capture/restore and actualneuralSignal
guard. No clock/route/teacher or fixed motorboost. Use separateprivate sources/
proofs; zero-mixture must fullreproduce lateststronger6599.861744 baseline.
All handlesabove terminal, no known ownedjobs remain (revalidate ifneeded).
UsableWindows source/default engine2a851...dcd /model0d239...908 unchanged.
No appwindow/version/tag/commit/push/release/saves changes. Goal remainsactive.
See PROPOSTE-E-AUTORITA-FEEDBACK-DEV.md for exactscope/evidence.

NEWEST CHECKPOINT — current-neuronal feedback R2, TERMINAL VERIFIED NEGATIVE.
Previous turn PROGRESS: memoryarchive produced verified .708m clean gain.
Current turn PROGRESS: current-state feedback implementation, real prep-phase
bug caught/fixed without bypass, and actual negative study+nonzero nativeproof.
New neural-current-feedback.cjs freezes global6599.833 parent, selects8CURRENT
descending-neuron rawcolumns384..511 by actualvariance/correlation only,
normalizes+tanh, learns18linear motorcoefficients under existingneuronal gate.
Two numericaltestsPASS currentneuronscanchange addedcommands withsamegate,
zero/readout preservesparent and pedalsexclusive. No teacher/pose/clock/route.
Original prep hadfirst8377 from PREVIOUS control's memory peek, not actual
currentgate8376. Nativezero proof8531controls/4401996values remained valid,
but Bridgeinit rejected8376!=8377 before ANYcandidate. Study48302 terminal1,
neuronal-current-feedback256-first:0evaluations, failedsources/data preserved.
APPLICABILITY.json annotates originalprep; no frozen source overwritten.
R2 separatefiles preservev1. prepare70256 terminalPASS8531rows, first8376,
155fitrows,8selectedcurrentindices[394,432,418,497,420,408,414,397].
NativeR2preflight88286 terminalPASS4401996values/fulltrace/basis exact,
8531GPUcalls0fallback. Sourceprep fix uses ACTUAL current observation features,
NOT changing physics/motor timing or skipping the assertion.
Corrected study78735 terminal0: neuronal-current-feedback256-r2,
256actualcandidates/16CMAupdates/19184suffixcontrols/95.781s wall. NO bestClean.
171crash/45stall/40slow. Independent source/CMA/record verifier PASSED.
Report41606d1c0d15e2feb3dd48643392bf8ee74420d331c9ba9245da41975703925a.
Furthest6634.520828611332m/2236.5475783061247pts CRASHED, not improvement.
Independent fullnative52052 terminalPASS8468controls/8468GPUcalls0fallback,
retained91controls, actual18nonzero feedbackweights transferexactly:
f8aa432576230e95cae4659bc883def33c425fa1a3bb43c89982f6ab97dbfe7f.
Confirms this actualcandidate transfer, not allmodel correctness or crashcause.
All owned study/preflight handles above terminal; revalidate no livejobs.
GLOBAL researchbaseline remains6599.833256472155/4061.6942943133963/ONE slowlap.
No newchampion/Windows integration/savecompatibility/version/tag/push/release.
DefaultWindows0d239...908 and engine2a851...dcd remain frozen. Goal NOTachieved.
See FEEDBACK-NEURALE-CORRENTE-DEV.md for full evidence and boundaries.
NEXT MATERIAL WORK: use actual genotype/fitness/outcome records to improve
candidate proposals/sampleefficiency rather than blindly redoing18CMA or
adding neurons. Currentstate feedback now exists and nonzero transfer tested;
do not blame an unproved runtime mismatch. Compare against GLOBAL6599.833,
not easier historicalparents; keep safe champion and official penalties.

NEWEST GOAL TURN CHECKPOINT — memory archive selection, TERMINAL VERIFIED.
Previous turn PROGRESS: two negative memory studies and native transfer audit.
Current turn PROGRESS: changed exploration selection ONLY, actual small clean
improvement with independent optimizer/archive reconstruction+nativeproof.
New neuronal_memory_archive.py keeps clean/unsafe5m bins separate. Unsafe
parents may generate offspring, NEVER replace clean official-score champion.
16actualcandidates/batch: protectedchampion, reevaluatedfrontier, seven
antithetic blockmutationpairs. Two unit tests PASS incl RNG/incomplete rejection.
No inference/physics/reward changes, no teacher/route/clock. Existing additive
memory9 policy source identity remains unchanged, as does usableWindows.
Study87617 terminal0: neuronal-memory-archive256-first,
256NEWactualevaluations +256historicalactualrecords imported separately,
16archiveupdates/21447suffixcontrols/164.938s inclfullproofs. No count inflation.
Report3e4a007714c7f943d885162886db648520b0cb231ab6209d01a66b160c8a4d92.
Independent verifier PASS allparentchoices/mutations/RNG/snapshots/admissions,
including exactprotected and unsafe-frontier actual reevaluation traces.
Bestclean6599.833256472155m/4061.6942943133963pts/ONE lap742.5501609581744s,
stalled853.05s. Gain.708445m/.366689pts, NOT two laps or firstlap improvement.
Unsafefrontier6634.814069594997m NOTpromoted. Single seeded study does NOT
prove general algorithm superiority or faster convergence from zero.
Two complete Bridgeproofs and independent native50014 terminalPASS8531controls,
8531GPUcalls0fallback, memoryretained154controls. Fulltrace
1b598d56f9d312ecb07e68679a493b388477eb56eeeee4ec2826dc981b48763a.
GLOBAL research baseline now6599.833256/4061.694294; not old6599.124811.
This is source+genes+proof research result, NOT yet standalone numericfamily
or Windows integrated. Defaultmodel0d239...908 still6597.375 and appengine
2a851cf6146a91a14692c055926815a9335000343dced07aa3c168c9f5c21dcd unchanged.
All owned handles87617/50014 terminal. No known live jobs; revalidate ifneeded.
No appwindow/release/tag/version/commit/push changes. Documentation:
ARCHIVIO-MEMORIA-NEURALE-DEV.md. Goal remains active/unachieved.
NEXT MATERIAL WORK: investigate learned CURRENT-neuronal-state feedback while
memory is active, rather than only three decaying context traces. Do not blindly
repeat memoryretention sweeps or claim stale frozen statehead/PPO trials novel.
Any new candidate must beat current GLOBAL6599.833256/4061.694294 with clean
full-native proof; retain the protected Windows/default/save compatibility.

NEWEST CHECKPOINT — 17 OCTOBER 2026, learned-memory variants TERMINAL.
Previous goal turn PROGRESS (implemented memory and real running study).
Current turn PROGRESS: verified two actual negative learning experiments,
separate additive architecture and actual nonzero-memory transfer proof.
No clean improvement, no promotion, no two-lap solution. Do not claim success.
Four numerical tests PASS incl zero-retention bit-exact behavior, reset/capture,
exclusive bounded motors and zero additive motor effect under retained memory.
learned-context-memory-preflight native8527controls exactly matches current
6599.124811099363/4061.3276056160284/ONE lap742.5501609581744s baseline.
Study neuronal-learned-memory256-first confirmed terminal+processes missing:
256actualcandidates/16CMAupdates/21843suffixcontrols, no bestClean.
153crash/67stall/36slow. Independent optimizer/source verifier23834 PASSED.
Reportcaccc64b0f85db478db68a5749295ab908b7c220d485804b4f9f245959599284.
New additive memory freezes ENTIRE current controller, starts six motor
weights zero plus three learned retentions4. Zero-model native13609 PASS
8527controls exact baseline; memory retained150controls, versus instantaneous8.
This measures memory persistence, NOT improved driving.
New study76625 confirmed terminal0:
neuronal-additive-memory256-first,256actual/16updates/20722suffixcontrols,
86.625s wall, no bestClean.146crash/64stall/46slow.
Reportf72fb8fdc84b85cc095d5c71db24cd7b08931d973f1d29453fbfe736a2708c00.
Independent nine-parameter source/CMA/record verifier PASSED all16updates.
Furthestcandidate6624.102205m/2209.338272pts CRASHED, not improvement.
Actual full-native nonzero-memory transfer51622 terminalPASS8457controls,
retained80controls,8457GPUcalls0fallback, fulltrace exact practice:
afd35c41e59383f0740162d97b6a2d738ffb8bfad3af57025762265b6a7f3682.
Confirms this candidate transfers, not universal correctness or crash cause.
No known owned study remains live; revalidate handles, do not restart oldfiles.
App engine2a851cf6146a91a14692c055926815a9335000343dced07aa3c168c9f5c21dcd
and default0d23973f4f7ef4d590238b38062203db5b1eb773923315d70d02a2f285eef908
unchanged; release5.6.0/saves/UI untouched. No commit/tag/push/release.
Next work must address learning/exploration from ACTUAL outcomes rather than
repeat retention sweeps or attribute failure to an unproved transfer bug.
Current GLOBAL research baseline remains6599.124811/4061.327606, not default6597.
See MEMORIA-NEURALE-APPRESA-DEV.md for commands/evidence and exact boundaries.

NEWEST GOAL TURN — NEXT CONTEXT STUDY TERMINAL, real small clean progress.
Previous turn PROGRESS: verified16paused/max100 privateWindows+launcher.
Current turn PROGRESS: new actual-neuronal support prepared from current
qualified6597 winner; original Windows source/default SAVES UNCHANGED.
next-instant-context192-prepared:8520rows/516actualvalues, protected8328,
first8376; independent native zero proof3126 passed4396320values/scales/
centres/radii/fulltrace exact,8520GPUcalls0fallback. Existing2coretestsPASS.
Study handle29686 terminal0, neuronal-next-instant256-first:
256actualcandidates/16CMAupdates/17148suffixcontrols,139.281s wall inclproofs.
Bestclean6599.124811099363m/4061.3276056160284pts/ONE lap742.5501609581744s,
stalled852.7s. Gain1.749388m/.885861pts, NOT two laps/faster firstlap.
Report71fee58bbe841f54d8f5280efc70b0d681ea7ac6dd213c1d99d5f074d77cdc44.
Independent optimizer/source/record verifier PASSED all16updates.
Two actualFULLBridge proofs +freshnative73034 terminalPASS8527controls,
trace3864025ee715905cd9dd4794f4a7db59ff8b3c7c9f31f0c57a642cceeb56614a,
8527GPUcalls0fallback. Separate actualnative diagnostic36071 terminalPASS:
new support activeONLY8controls (gas1/brake7); laststate speed0,
oldfeatures[0,0,0],newfeatures[0,0,0],commands[-.8078340710829438,0,1].
This suggests investigate actual-state coverage/learned memory; NOT proof
of cause or license for imposed acceleration/route/teacher labels.
Current research frontier6599.124811/4061.327606 is nativeproven but NOT
yet shareable numeric envelope/Windows integrated/registered default.
Default Windows remains qualified0d239...908/6597.375 and engine2a851...dcd.
All three owned sessions29686/73034/36071 confirmed terminal. No window,
version/release/tag/commit/push changes. See CONTESTI-SUCCESSIVI-DEV.md.
NEXT MATERIAL WORK: actual-state support coverage or learned recurrent
neural correction, not blindly repeat instantaneous3centre fit. Its effect
onlylasts8controls on finalcandidate. Any next study must beat6599.124811/
4061.327606 GLOBAL research baseline, not easier historicalparents.

NEWEST CHECKPOINT — Windows instantaneous-context integration VERIFIED.
This supersedes the older note below that says the model is not installed.
Separate launcher Avvia-contesti-neurali-dev.cmd, private 5.6.0, paused16/max100,
V3/Monza, four CPU+CUDA workers. Original CPU/CUDA apps remain unchanged.
New engine identity 2a851cf6146a91a14692c055926815a9335000343dced07aa3c168c9f5c21dcd.
instant-desktop-preflight.json passed full 8520-control exact clean trace,
8520 CUDA calls, zero fallback. instant-training-ui-first/verification.json
passed26 checks including a GENUINELY DISTINCT16-candidate physical generation,
actual100 agents, exact protected trace, strict new save roundtrip and UI.
No owned instant-main/worker processes remained after terminal fixture.
Two app tests and two real-Windows-lock atomic-save tests passed.
Actual screenshots inspected as one batch: approved layout preserved, no polish
loop. Native picker return values were mocked only in fixture; handler/file real.
Candidate14 reached6617.84389778965m but CRASHED, score2187.48290621762;
NOT a clean improvement over protected6597.375423331411/4060.4417447678807.
New .malecns-instant-dev strict family, no oldsave masking or release overwrite.
See APP-WINDOWS-CONTESTI-DEV.md for evidence and limits. Goal still unfinished:
ONE slow lap, not two; no coldstart/allmodels/alltracks convergence proved.
Next learning work must beat the global verified6597.375/4060.442 baseline,
not merely make parameter updates or beat an older weaker parent.

LATEST CHECKPOINT — 16 OCTOBER 2026, exact CUDA native backend and private Windows integration

NEWEST GOAL TURN CHECKPOINT — 16 OCTOBER 2026 19:19 UTC (later tool results below).
Previous turn PROGRESS (parallelPPO, rewarddiagnostic/fix, realnegative studies).
This turn PROGRESS with a REAL small verified clean improvement and WindowsIO
fix, but two-lap/coldstart/othermodels-tracks objective still UNFINISHED.

1. Coherent130readout: handle10249 terminal256actualcandidates/16CMAupdates/
95972suffixcontrols. No cleanimprovement. Independentverifier90268 terminal
PASSED report130b6a1ace2dc0674d9cbacc5a1654fef6ed6e1c69ff5c5b9881177c5b6aebf9.
2. Brake diagnostic handle93116 terminalPASSED5actualreachedstatecopies:
15physicssteps(.25s) each coast/brake/throttle, brakealwaysslowsmorethancoast,
sourcefullparenttrace unchanged. Diagnosticcommands NEVERtrainingtargets.
3. Authority audit36842 terminalPASSED8495actualcontrols,768active,gateMAX1,
cannotBrake0/cannotAccelerate0 undermaxcorrectionbound onactualtrajectory.
Therefore DONOTclaim a gate-authorityblock or changeitslimit without evidence.
4. Instant local neuralcontexts (NOT retainedmax) fitfromactualrawbeforecontrol
observations; prepare33976 terminal8495rows,firstactivation8300,protected8239,
centres8303/8367/8431. No geometry/idealactions used. 2coreunit testsPASS.
Preparation verifier19122 terminalPASSED4,383,420rawvalues reproduced in a
fresh native trajectory, full zero-context native trace also EXACTparent.
5. Instantstudy69520 terminal256actualpracticecandidates/16CMAupdates/35841
suffixcontrols. A cleanwin6597.375423331411m/4060.4417447678807pts/ONE lap/
stalled851.9666667s vsparent6590.791629964014m/4057.0775028753487pts.
Firstlap time remains742.550160958s inherited/protected. Gain6.583793m, NOT
two laps or fast driving. IndependentCMA verifierpassed allgenes/fitness/
optimizerstates; reporte6a94d9c4acc47d9ccddb74247aa6a04c5720b6e918a25a73e90f591fc6c3537.
Two BridgeFULLproofs exact, two fresh standalone native candidateproofs77190/
32803 exact(PIDs28316/22700), plus finalqualifiedfile nativeproof27790 exact.
Trace7ac5a4f00fad5d0c16ec71493b1bf45514e40ccaf3e4723070b9934060f3818c.
6. NEW shareable numeric family neural-instant-context-model.cjs embedsparent/
preparedbasis/6coefficients; no pose/actiontape. 2modelcontracttestsPASS.
Candidatefffa0d0adf9b00f0e8b2eb11dc24e5d96d4aa4d2956149bf4937e9b4c3ddee32.
QUALIFIED clean model in neuronal-instant-context256-first/clean.malecns-instant-context.json
SHA0d23973f4f7ef4d590238b38062203db5b1eb773923315d70d02a2f285eef908.
Finalfile itself physicallyreplayed in clean-file-native-proof (PID24188).
New verified-research-frontier-v2.json registers it; OLDERcatalog and actual
Windows defaults UNCHANGED. Do notmistakeitfor a normalmalecns-save or claim
alreadyinstalled. CurrentWindowscompatiblechain stays6584m (4a752...d80).
7. Leaky .98 neuralcontextmemory alternative: 2unit testsPASS; original
study24664 FAILED after12committed generations/192candidates because old
Pythonatomic_json os.replace(state.pending,state) raisedWinError5. Partial
gen13 was NOTcommitted; no fabricatedfitness/count. Oldfiles preserved.
8. NEW neuronal_experiment_io_retry.py uniqueownpending+boundedWinretry,
2actualWindowsfilehandle testsPASS (transient reader and persistentlock
preservepreviousjson). Oldneuronal_experiment_io.py FROZEN/UNCHANGED because
older study sourceidentities includeit. DoNOTeditit tofixnewruns.
9. Committed12prefix independentlyreconciled; newCMArestore emits EXACTold
asked13genes. Resume51961 terminal completes ONLY4newupdates/64reevaluated
candidates,192retainedhistoricalrecords; cumulative16updates/256committed.
ResumedverifierPASSED report26698a02f92cda4713aeacb214ce270e25aa3150e280f2f6f5af4d6a1b2aa92a.
Bestleaky6594.432776779007m/4057.825838787858pts/one/stalled is WEAKER than
globalinstant6597.375423/4060.441745; NOTpromoted evenif ownparentimproved.
10. No known ownedjob remainslive (allhandles above terminal, finalCIMempty).
Revalidate liveness, neverrestart from stale state files. SourceCPUengine
fb85e4c62abcfdbdb6b652255a9801d950ddb3f145a7c735f0dc00c656e779ba;
WindowsCUDAengine80fe28ea9898b3e02933f96aa4110460f13c1743cf357349fe36ce8d8f6283ea
still unchanged. No appwindow/release/tag/version/commit/push changes.

NEXT MATERIAL WORK: integrate the stronger QUALIFIEDinstant6coefficient model
into a SEPARATE private Windows training engine, same approvedUI/16paused/
max100/5.6.0, without replacingoldCPU/GPUbuilds or makingoldsaves lookcompatible.
Need new6dimensionArchive, desktopModeladapter/defaultproof, Native training
adapter passing previousLapTime (frozen standaloneNative lacks that option),
newcoordinator/worker/arena/save/main/newlauncher and strictnewprivateextension.
Do NOTedit frozen standalone model/Native/oldapp/sourceids; copies/newengine.
Fullactual nativepreflight and genuine16-DISTINCTgene generation, save/load
archive/RNG/history, actualGPUcounters, approvedUIfunctionaltests required.
Currentoldsmoke testedmutation0 before16generation; newtest must reset after
restoringmutation16 so traininggeneration really hasdistinctgenes.
Then pursue two-lap learning (possibly generic appendable actual-neural local
context stack/encoder observability), not another blindfullNNPPO sweep. Keep
global6597.375423/4060.441745 reference, not easierown6590 baseline forpromotion.
Model still one slowlap; no completion claim. See APPRENDIMENTO-CONTESTI-NEURALI-DEV.md.

Older checkpoints follow; newest terminal/qualification records above win.

NEWER GOAL TURN — parallel on-policy actual experience and objective diagnostics.
Previous goal turn was PROGRESS (GPUWindows integration,25checks, actualdiverse
generation, memorytransferfix and fullyreconciled negative65kPPOstudy).
This turn: new4process independentseed collector/per-env GAE,2math tests;
actual4update/4096transition/22episode smoke terminal+numeric verifier PASSED;
actual64update/65536transition/247episode study terminal+numeric verifier PASSED,
still NOcleanimprovement/all1inheritedlap. Final6506.389040m/3976.180920pts/
too slow, no promotion. Reporta02d43d1168c0e9b5639a230ddcd5579168aacd6d24510cd8db4d0b543b500ae.
First4updates/4096transitions repeat smoke, not novelinformation. Four actual
first Gaussian action streams independently verified using actualFloat64
exp(log(std)); first auditor mistake used decimal std exactly and was retained
as seed-audit-first-failed-source.cjs, not a training/data failure.

Important diagnostic correction: audit_ppo_longitudinal_authority.py used a
HYPOTHETICAL LOGIT residual, but actual neural-command-residual.cjs ALREADY
uses DIRECT CLIPPED MOTOR addition. The impossible-reversal counts are NOT
applicable; preserved APPLICABILITY.json saysfalse. Do not repeat that claim.
Actual-motor audit uses120 real module gridcases and inversefeatures from
65536actualrows:35786positiveparent,29253beyond4GaussianSD brake threshold
evenatbestgate1. This diagnoses narrowexploration bounds, not actualbrake
telemetry or proof of solecause. Actual direct decoder CANreverseallparents
atgate1. Report ppo-normalized-direct-motor-exploration-first/verification.json.

Controlled next study LIVE atlastcheck: neuronal-ppo-parallel4-brake-exploration,
64updates/65536planned, ONLYinitialLongStd .08->.3, steerstd.12same, restsame.
Handle79767; ownedphysicalNode23880/13220/19356/24600, allactualprefix/preflight
passed andfirstactionstreamsverified. Revalidatehandle/PIDs, NEVERinferlive
fromstatefile orrestartanobservationtimeout. Fourenvfamily-sourcefrozen.

Additional actual objective audit: first16batches16384transitions/82terminals
(74crash,5stall,3slow) hadrawterminalroughly-33vs-14 buttrainingfloor madeALL
-40. Whole-episode returns NOTclaimed equal. New separate additive40 helper,
env/trainer/verifier prepared+2unit tests PASSED: raw-40 preservesoriginal
terminaldifference andleavesphysicalR5unchanged. NOT YET RUN atcheckpoint,
do notclaimtrained/fixedlearning. Ideallycompareaftersigma.3studyterminal,
same64updates/seeds/architecture, onlyrewardrevisionchanges. New filenames:
train_neural_ppo_additive_failure.py,verify_neural_ppo_additive_failure.py,
neural-ppo-additive-cost-cuda-env.cjs. Do noteditfrozenpriortrainer/sourceids.
See APPRENDIMENTO-PPO-PARALLELO-DEV.md. WindowsCUDAengine/default/oldsave/
releaseunchanged; no version/tag/release/commit/push. Goal remainsACTIVE.

Previous checkpoint follows; newer terminal reports above take precedence.

LATEST TERMINAL UPDATE FOR THIS GOAL TURN:
- Handle79767 brakeexploration64updates/65536transitions/176practiceepisodes
  terminal, independentverifier59679 terminalPASSED. Last6235.973825m/
  3757.116661pts/slow. BestcleanNONE, no promotion. 114432GPUcalls,0fallback.
  Reportfb62cbc678ae18cbaa29a5d58535039e57aa53ebc9ba0a73071100e1006a8d04.
- Additivefailure study was ACTUALLY RUN, not merely prepared. Handle55868
  terminal64updates/65536transitions/171practiceepisodes. Verifier20343
  terminalPASSED allupdates/losses/KL/scales/finalweights. Last6598.214235m/
  2191.504160pts/CRASH/oneinheritedlap. No cleanimprovement; notinstalled.
  115096GPUcalls,0fallback. Report62607d86eeb54aaf349c4f78b3ee2e13a1487973d59e7b59516ed3e59cea0733.
  First1024physicaltransitions exactlysameas .3comparison includingall
  observations/actions/rawrewards/nextstates/episodes; ONLY3terminalreward
  rowschanged. Controlled-start and4actualRNGstream auditspassed.
  Additiveverifierchecks literalaux40, not reverseFloat64 subtraction, to
  match declaredhelpersemantics. No changes to actualphysicalR5/oldapp.
- No known ownedjob remainslive. Handles1264/98595/15106/79740/79767/26528/
  64121/33601/55868/59679/20343 all observedterminal. Revalidatebeforework,
  doNOTrestartfrom oldstatefiles. Model/CPU/GPUapp/release sourcespreserved.
- NEXT: coherent parameter-space exploration instead of another blindPPO
  stepnoise sweep. New neural-readout-coherent-search.cjs+2unittestsPASS,
  130lastlayer coefficients outof33474, frozenfirst33344. Population16,
  boundedactualpendingvectors, symmetricsteer/longitudinalinitialcov scales.
  ActualCMA driving experiment NOTyetimplemented/run. Existing proven
  neural-cma.cjs handles130dims cheaply in tested3iteration SYNTHETICquadratic
  fixture (ask9/53/99ms,tell36/88/100ms); no needanother optimizer dependency.
  Reuse four actual corrected-memory CUDA envs, evaluate eachfixedpolicywhole
  suffix with officialR5fitness, freshprotectedzero. Clipactualpendinggenes
  BEFOREevaluation/tell, neverfabricatefailurefitness oruse teacheractions.
  Anywin requiresfreshfullfromline/standalone nativeproofs beforepromotion.
  All3new64updatePPOstudies wereNEGATIVE; do notclaim learningresolved.

New verified native GPU result: packed CUDA backend runs the actual V3 graph
through Node/Koffi and CUDA Driver, no Python driving, no action replay. Two
complete state-head controllers: 16,912 whole-brain/car comparisons identical.
Fresh four-agent native pair: CPU 200.3836111 s, CUDA 156.8567564 s (-21.7218%
wall); 33,815 GPU controls, 135,260 kernels, zero CPU fallbacks. All four full
results and action/progress/time traces identical. One pair, not app FPS,
all-model/track convergence or GPU batch100. See CUDA-ESATTA-V3-DEV.md.

Separate Windows chain CUDA adapters/launcher now exist; original CPU app,
frozen inference, original save and public5.6.0 distributions untouched.
Default compatible chain6584m stays16paused/max100, not the incompatible
research state-head6590m. New chain CUDA native preflight-r2 passed 8,495
actual controls/33,980 kernels/zero fallback/full protected trace exact.
Windows functional smoke is a separate hidden owned fixture: require its
terminal verification.json, never infer success from progress alone.
UPDATE: terminal Windows report PASSED25checks, one actual16episode generation,
100agents actually advanced/GPU counters verified, save/load archive/RNG/history
exact, zero renderer errors. That UI generation used16IDENTICALgenes because
it was prepared while mutation0 was tested. It is NOT a diversity/learning
success. Separate run-chain-cuda-generation.cjs now executes16DISTINCTgenes
with mutation.16 fromzero physicalstate; handle78886. Require its terminal
report and independent consistency check, not stale heartbeat alone.
UPDATE: handle78886 terminal PASSED. Independent record/save/source verifier
passed:16distinctweights/16distinctactiontraces/16completeepisodes/1actualupdate,
zeroGPUfallback, but cleanchampion NOTimproved; all1lap, no2laps.189.223s
is NOTa controlledperformancepair (PPOstartupoverlappeditslastpart).
OriginalCPUengine identity remainsfb85e4c62abcfdbdb6b652255a9801d950ddb3f145a7c735f0dc00c656e779ba.
NewCUDAengine80fe28ea9898b3e02933f96aa4110460f13c1743cf357349fe36ce8d8f6283ea.

Next actual learning study STARTED, not proven: normalized520-CUDA-long,
256updates/65,536plannedrealtransitions. New isolated GPU Bridge/env/trainer
and verifier clones; frozen original normalized study unchanged. Same seed,
network, normalization and rewards, so first64updates may reproduce old CPU
run; those repeats are not novel information. Handle42490, ownedPython6288/
5876 and Node22776 atdispatch. MUSTrevalidateactualhandle/PIDs; state.json
alone is not liveness. Require both zero-policy full and reached-prefix
preflights, terminalreport, allupdate numericalverification, actualGPUcounters
and independent fullnative proofs before anypromoted trainedpolicy. No new
policy is installed merely because coefficients change.

New measured learning-protocol discrepancy: actual trained normalized64policy
native full fromline6361.429311m/1989.729867pts/crash vs actual cachedpractice
6178.364094m/3716.279676pts/stalled. Fresh actual GPUBridge FULL matches native
trace, PRACTICE matches oldCPU trace, but full!=practice. Two audits terminal
PASSED, not caused by CUDA approximation. Previous residual memory is updated
even when neuralgatezero/commandsunchanged; cachedprefix storeszero while
nonzero trained fullpolicy stores unappliedproposals. New separate env/native
and helper resetmemoryONLYatgatezero; positivegate semantics unchanged.2unit
tests pass; actual three-way physical fixproof handle72948 MUSTfinish before
claiming physicaltransferfixed. See PPO-TRASFERIMENTO-MEMORIA-DEV.md.
UPDATE: memoryfix handle72948 terminal PASSED. Actual trained64policy fixed
nativeFULL/fixedBridgeFULL/fixedBridgePRACTICE all reproduce EXACT oldpractice
trace6178.364094m/3716.279676pts/stalled. Therefore transfer discrepancy fixed
for this real trainedpolicy, NOTbetterdriving. No weakpolicyinstalled.

LongGPUstudy handle42490 terminal FINISHED:65,536actualtransitions/256updates/
251practiceepisodes,97,376actualGPUcalls/389,504kernels/zeroCPUfallback.
All32deterministicevaluations failcleanprotectedimprovement. Last6588.989394m,
2152.333601pts,oneinheritedlap,CRASH. Independent numericalverifier handle79311
terminal PASSED all256updates/finalweights/losses/KL/scales/actualepisodecounts.
ReportSHA04561fa9b4dd45e1a58f3da3cd5a72c8032403dd5df1f458b60720d34dbb371c.
First64updates/16,384transitions exactlyrepeat oldCPUstudy; only subsequent
49,152transitions extend beyond it.490.469wallseconds is not a controlled
performancebenchmark (other ownproofs overlapped). No trainedMLPpromoted.
All owned handles78886/42490/70819/36709/18688/72948/79311 are terminal.
No known ownedworker/trainer remains live. DO NOTrestartfrom stale state.json.

Remaining primary problem is actualtwo-lap learning, not GPU installation.
Next meaningful study should use correctedmemory and diversified on-policy
rollouts (e.g.several independently seeded actual environments with per-env
GAE), not merely repeat another small learning-rate sweep or install a weaker
actor. Existing private WindowsCUDAcopy already usable16paused/max100 and
25checks verified,originalCPU/source/save/release unchanged. Do not overwrite
frozen CUDA/math/model/training source identities. Coldstart/othermodels/tracks
and two-lapconvergence remain unproven; goal staysactive.
See APP-WINDOWS-CUDA-DEV.md; no version/tag/release/push/commit authorized.

Fourth wide PPO comparison completed: normalized520-first,16,384 real
transitions,64 updates,71 practice episodes, no protected improvement.
Last policy6178.364094m,3716.279676points,one inherited lap,terminal stalled.
Independent normalizer statistics and all64 PPO updates verified. Not
promoted. Weights changing does not establish improved driving. This negative
study does not prove PPO cannot learn with more data/different design.

Previous checkpoint follows for historical evidence:

Previous goal turn was PROGRESS (two actually executed/reconciled small PPO
studies,16384transitions/64updates, negative). Current turn is PROGRESS too:
actual full sensory audit, three executed/reconciled wide-PPO studies totaling
49152transitions/192updates, exact numerical kernel prototypes/full physical
equivalence evidence/three-way timings, actual compiled CUDA capability probe.
Full objective remains ACTIVE/unfinished. No blockers or completion claimed;
do not substitute these numerical checks for two-lap/all-model/track/cold-start
learning or delivery into the Windows app.

All newly owned jobs were observed TERMINAL via handles or absence after
terminal output. Handles59754(sensory audit),46633(wide PPO),92699(verifywide),
11466(failurefloor PPO),52787(verifyfailure),18014(full-stateincoming),
96714(original+incoming timedsequence),92390(preparedCOOtiming),51647(fullsteer
PPO),78912(verifysteering) are completed. No known owned training job remains.
Never restart from stale state.json or infer any user window liveness from it.

ACTUAL SENSORY EVIDENCE: audit-neural-sensory-coverage.cjs executes current
6590m state-head native full trajectory unchanged8495controls/3e3658trace.
Counterfactual neural-only probes at4actually reached brains (controls0/500/
4000/8000),28channels x1or4neural ticks, holding vehicle fixed. All28channels
affect old128descending readout atall8probes; all251reachable descending cells
do not recover a wholly absent channel. audit_neural_sensory_rank.py PASSED
source/model/metric/probe reconciliation. Local finite matrices rank28 inold128
andall251, rank8 after linearPCA8 transform of most-recent128neural frame ONLY,
holding other history/memory/baseline fixed. NOT proof all discarded dimensions
are needed, PCA caused the plateau, general observability or physiology.
Files neuronal-sensory-coverage-6590/report.json and rank-verification.json.

WIDE PPO: neural-ppo-wide-policy.cjs uses actual520inputs (raw516neural/history/
decoder values,2actualparentcommands,2previousresiduals),64tanhhidden,2Gaussian
latents,33474artificial parameters. Same7721anatomicalnodes, NOTadded33474fly
neurons. Parent still contains its learned PCA head; NEWactor skips PCA.
neural_ppo_wide_network.py shared with later trials is NOWFROZEN; do not edit
it or old env/policy/trainers and break their source fingerprints. NodeFloat64
physical inference compared toTorchFloat64actualmeans<1e-12; deterministic
evaluation alwaysNode. Three numerical policy tests passed. Originzero-output
matrix gives exact full/practice identity before every trial, no learned
improvement inferred from zero-policy preflight.

neuronal-ppo-full-history-6590-first:16384actualtransitions/64updates,60completed
practiceepisodes, all33474parameterschanged, no protected gain in8evaluations.
Last6086.5049819m/3634.901946pts/1inheritedlap, stops too slow. ReportSHA
8d9c932ecd74662b316dcf38c8d072927052a25c8b2f0b3e6746237dd1fe02fe;
verify_neural_ppo_wide.py passed exact batch/loss/KL/std/finalweights replay.

REAL terminal-cost evidence from those60episodes:19collision terminal drops
median-32.80813,22slow-pace median-14.00039,19stall median-14.00047 inreward/100
units. This is not a whole-episode score nor causal proof of stopping behavior.
Separate failurecost experiment uses ONLY auxiliary training reward:
ifterminated&&laps<2 then min(rawR5reward/100,-40), never softens original
collision/other more severe cost. Rawreward/auxpenalty/terminalLaps recorded
peractual row;2algebraunit tests passed. OFFICIALphysicalfitness/evaluation
remainsR5andstrict clean6590m guard, no actor reward/lap input, no optimalpolicy
invariance claim for changed auxiliary objective.
neuronal-ppo-full-history-failure40:16384transitions/64updates,37completed
practiceepisodes, no gain. Last6512.3107708m/2088.447239pts/COLLISION.
ReportSHA f0f31d3ff303e46a2c5f4a33ef7a8f8357cb7b378e6d97e3cb2da9be10b75e06;
verify_neural_ppo_failure.py PASSED complete numerical+auxpenalty reconciliation.

Motor coverage audit ofthatactual16384rows:3928strongparentsteer abs>.8;
maxobserved fullgate steering correction2*tanh(.2latent)=.2269117685;
NONE couldreverse strongparentsteer evenat hypotheticalmaximumgate1. This
does NOT label reversal ascorrect/needed, is not actualcounterfactualdriving
and NOT intrinsic maximumcapacity; only actual sampled exploration coverage.
Next controlled trial changed ONLY steeringlatent scale .2->1 (symmetricwith
longitudinal), samephysicalsteeringlimits/physics/auxfloor/seed/model/budget.
neuronal-ppo-symmetric-steering-first:16384transitions/64updates,85completed
practiceepisodes, no gain in8evaluations. Last6583.732024m/2200.682288pts/URTO.
Clean6481.289506m/3957.474684pts/stall also below6590m guard. ReportSHA
03adb75f3bba51f88b84afecbddc0495653b0fdc27a46e0d82ef2304d7f8c221;
verify_neural_ppo_steering.py PASSED exact optimizer replay.2unitpolicytests
passed. All three latest-policy snapshots are RESEARCH-UNVERIFIED, no standalone
model export/native-trained-policy proofs warranted, no promotion/install.

CPUprofile actual whole one native6590m episode:38806V8samples,24129(62.1785%)
inexact-coo.pass. Instrumented/concurrent-ownedlearner caveat, not precise
time/FPS/GPU/appwideprofile. profile-neural-native.cjs and
analyze_neural_cpu_profile.py; report neuronal-native-cpu-profile/summary.json.
Stable incoming layout exact-incoming-stable.cjs groups bytarget preserving
ORIGINALadditionorder; caches unchangedprep withbytechecks topology/weights/
groups/gains.3testsactual8brainsx1/2/4/8iters+inplacemutations+fallback passed.
Distinct state-head-exact-stable-incoming-v1 engine. Full verify-neural-incoming-
live.cjs PASSED16912every-control comparisons ofentirebrain/car/observations/
sensors/motors/rewards/trails/head on2distinct complete actualtrajectories;
8495+8415controls. NOT universalproof, NOT newWindowsengine installed.

Three-way timed series, sequential ORIGINAL then INCOMING then PREPARED-COO,
fourdistinctactuallyevaluatedcontrollers/33815controlsEACH, result+WHOLEaction/
progress/time traces identical. Original199.8877647sWall/193.202sCPU;
incoming210.204sWall/204.453sCPU =>5.161%SLOWER. Originalreference reportSHA
8caf974a6f42811f5940127177e626f359f4d401dbc15d85e472b20fa3e429ee;
incoming09f2d172867cc6a6dfdb33a51782c025dd6b66e23f88f6e0d191f10368803920.
PreparedCOO exact-coo-prepared.cjs keepsoriginalLOOParithmetic+livetopology,
onlyunchangedweights/sourcegainprep reusedwithbytesANDgain-typecheck.4tests
passed including f32/f64samebytesinvalidated. Distinct preparedCOOengine;
thirdmeasure198.52875sWall/193.031sCPU, only.6799%Wall/.0885%CPU reduction,
not a useful repeatable gain established. Its reportSHA
05be7653d669d00468e1a01d4dd7ac1a444cd485f79a1173e6f9962f228003e1.
verify_neural_incoming_benchmark.py and verify_neural_prepared_benchmark.py
PASSED all4entiretraces/identities/CPUstats. Nootherownedlearner/benchmark at
dispatch;briefunit/diagnostic commands/userapps/thermal/scheduler/cache/order
notcontrolled. ONEseries/notrandomized/NOconfidenceinterval/FPS/GPU/fullapp
speed/learning-convergence claim. No newkernel installed. PreparedCOOfullstate
lockstep harness EXISTS but NOTEXECUTED; neverattribute16912incoming comparisons
toit. Both variants are unconvincing for speed; do NOTpromote bygreenchecks.

GPUcapability probe ACTUALLYEXECUTED notonlyinstalled: RTX4060 capability8.9,
Torch2.11.0+cu128/NVRTC12.8localbundledlibs. probe_cuda_nvrtc.py compiledCUDA
viactypesNVRTC, loadedPTX/launchedthroughCUDA Driver intoTorch-ownedstream,
1024Float64affine numericfixtures bitwise CPUmatch,0mismatches. --fmad=false,
explicit__dmul_rn/__dadd_rn. NoSDK/driver/globalsettingsinstall. Report
cuda-nvrtc-affine-probe/report.json. This is SYNTHETICNUMERICUNITONLY, never
traininglabels/actualbrain/performance/integrationproof. DoesNOTtesttanh,
graphmatmulor fullsavedcontroller. Node actualV8=13.6.233.17-node.51. ExactGPU
brain work would need activation/rounding/order proof, not repeat old Torch
GEMMprecision mismatch. AvailableNVRTCDLL directory .impeccable/rl-venv/Lib/
site-packages/torch/lib; no externalSDKneededfor thislimitedprobe.

Full current guides APPRENDIMENTO-PPO-DEV.md and PERFORMANCE-NEURALI-DEV.md.
NEXT substantive learning direction: audit conditioning/centering/scales of
FULLactual520neuronalfeatures before another samepolicy64updaterun. A separate
normalized full-history actor could use only actual fixed mean/scales already
inverifiedparentprojection WITHOUTPCAreduction; no newroute/clock/teacherinputs.
NOTIMPLEMENTED/RUN. Do not edit anyfrozenwide policy/network/env to do it;
createexplicitdistinctfamily. Need genuinefromline/cold-start/allmodels/tracks/
2laps validation; inherited742.55sfirstlap remains. Longer/on-policy learning
and genuineGPUbatching remain unproved, not blocked merely becausehard.

Originalauthor's saveSHA rechecked29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3.
Same16preexistingdirtytrackedfiles untouched. Noappwindowclosed/reopened,
no release/version/tag/push/commit/oldsourcefingermutation, Windows16paused
compatible6584mcopy unchanged. Researchchampion STILL6590.79163m/4057.0775pts,
ONEwarmstartlap742.55016s, nottwo orconvergence. Older sections below historical.

LATEST CHECKPOINT — 16 OCTOBER 2026, after the two actual PPO studies

Previous goal turn was progress: completed the affine256-candidate study and
its independent numerical verification, negative against6590m; startup
contract verified16paused/max100, original save hash unchanged. Current turn
is progress too: implemented and physically exercised a genuinely different
on-policy PPO learner, not another plan or unchanged status report. The full
goal remains ACTIVE/unfinished; do not redefine it around these passing tests.

Frozen affine report neuronal-affine-6590-search/report.json SHA
df447b8d63e887396d2461e242302de96e76db2b03cb1f17811d78d9fc01bf64;
verification passed. Four new coefficients remain zero; no clean gain. Two
full Bridge plus two separately loaded native traces match the6590m origin.
Farther6597.201m suffix candidate crashed, never promoted.

New files neural-ppo-policy.cjs / neural-ppo-env.cjs / train_neural_ppo.py
and verify_neural_ppo.py use26learned linear Gaussian-residual weights over
13neuronal/controller features:9existing neural projection values,2actual
parent commands,2previous residual values. No actor geometry/time/lap/reward
or teacher actions. Node24.19performs ALL physical control inference; Torch
CPU float64 trains actor and64x64critic, single thread. Node/Torch actual
means agree below1e-12; every exact source closure/Node/model/preparation hash
is recorded. Original biological-activity guard and exclusive motors remain.

Both studies passed zero-policy entire full-from-line and cached-prefix+suffix
identity against original3e3658trace. Each subsequently collected8192actual
on-policy transitions and32PPOupdates, independently reconciled from every
saved rollout. First study (gamma.995/lambda.95)16completed practice episodes,
last deterministic6266.653m/3783.596pts, too slow; NONE of4evaluations improved.
Report neuronal-ppo-feedback-6590-first/report.json SHA
c77cab98e11f7a50ee073fe16233d5696c09713e5d5c95d9cfff69e648b5544f.
Long-credit controlled ablation uses separate train_neural_ppo_long.py and
verify_neural_ppo_long.py; ONLY gamma/lambda changed to.999/.995; same seed,
initialization/model/physics/reward/input/update/evaluation budget.19actual
terminated practice episodes; final6303.939m/1925.919pts COLLISION, none of4
evaluations improved. Report neuronal-ppo-feedback-6590-long-credit/report.json
SHA c7735a60c725cd762d798b628cbb42e71094e6d31cbff971e61235bd022160c5.
Both verification.json PASSED, all losses/KLs/stds/final weights exactly
reproduced; no candidate eligible for independent native export proofs.
Latest policy snapshots are research-unverified, NOT models/saves for app.

New audit_neural_ppo_features.py on actual8192first-study rows gives centered
rank12/13 atrelative1e-6, biasintentionallyconstant. Does NOT prove adequate
sensor information or causality; only rules out all12featuresbeingconstant
on these visited states. Four mathematical unit tests +2policyunit fixtures
passed; fixtures never enter learner/reward data. Both owned training handles
94463/52692 and verifier handles79702/9340 were observed TERMINAL; actual owned
Python/Node PIDs9976/17180/23888/28148 absent after completion. Do not restart
them from stale state files. No user window was closed/reopened.

No app installation, version change, tag, release, push, commit or old-source
mutation. User app remains the separate16paused compatible6584m last-pair
learner. Research champion remains6590m one VERYslow warm-start lap. These
small-budget negative studies do not disprove PPO generally. They DO NOT
justify installing a worse policy, weakening penalties or claiming two laps.
Next substantive work should address broader sensory/controller coverage and
genuine from-line learning/generalization, not repeat the same26weight gated
PPO or affine/PCA windows as though more updates alone proved improvement.
All-model/circuit/cold-start/two-lap scope is still unmet. Full current Italian
evidence guide: APPRENDIMENTO-PPO-DEV.md; older sections below are historical.

THESIS
Operate: extend the approved session UI with actual native generation training. The circuit and selected-car telemetry remain the primary work area; settings and test views stay separate. This is a private V3/Monza warm-start experiment, not a release or a cold-start benchmark.

OWN-WORLD
Keep the author's approved real white/navy/red control room, its optional dark theme, fonts, flat borders and small radii. No new world, raster, mockup or visual identity. Do not reproduce the illustrative landscape as factual track geometry.

STORY
Start paused at the line. Adjust population, next-generation mutation and requested speed; resume actual physics. Only a whole terminated population produces a generation record and changes learned coefficients. Keep metres, actual laps, score and learning updates distinct. Save a dedicated incompatible private file; loading restarts the saved generation from the line.

FIRST VIEWPORT
The interactive circuit remains large. Find the paused state, actual agent count and resume action immediately. The compact model note states warm start, V3/Monza scope and four CPU workers. The signature interaction is a real completed-population barrier: history appears only after every car terminates, never from a cached replay. Camera, atlas, theme and selection remain read-only observers of physics.

FORM
Local extension of the approved outputs/index.html surface; inherit seed key 58a4bd19. Do not roll a new form or seed. Preserve established responsive layout and map, first-person/chase/overview cameras, keyboard focus and light/dark states. Disabled controls explain scope, not pretend to work.

FINISH
Ready for handoff means actual paused/run/reset/speed/mutation/population controls, a whole physically completed generation, exclusive pedals, independent agents, strict private save/load round trip and rejection, bounded desktop/narrow visual inspection, no page overflow or renderer errors, and fresh finish review. No full lap, GPU learning, all-model convergence, production release or uninterrupted mid-lap restore claim without evidence.

RESEARCH STATUS — 2026-10-15

The separate projected18 Windows copy now starts from the independently verified3803m V3/Monza parent,16cars paused,100maximum, four CPU workers and the unchanged approved frontend.23Windows functional checks and two real16-car generations passed;32episodes/2updates did NOT improve the protected clean champion. This is a completed integration subtask, NOT completion of the author's broader learning goal. See APPRENDIMENTO-PROIEZIONI-DEV.md.

A separate CUDA SAC residual completed20,000actual transitions,4,750gradient updates and165practice episodes.37,690inference coefficients changed, but none of five full from-line candidates beat the frozen parent; selected best remains3803m/0laps. Numeric-model exports repeat exactly in independent pinned Node24 processes. A one-ulp observed-context overshoot was fixed only in the new private gate.395general tests passed. No weaker SAC candidate was installed into either active Windows app. See APPRENDIMENTO-SAC-PROIEZIONI-DEV.md and the finished bounded experiment report.

An offline, time-blocked sensory-information probe on two actual matched full rollouts compared128vs251existing descending neurons, without changing either controller.1,455unique aligned samples, five time blocks,2s embargo, training-fold-only PCA/ridge. Physical sensor reconstruction improved for13variable signals and worsened for3; speed and road information already exists in the old readout. This does NOT establish the cause of learning failure or prove that more neurons improve driving. The first one-control-misaligned diagnostic collection is excluded and recoverably kept in misaligned-v1; an aliasing regression test now protects simultaneous snapshots. Sensor-reconstruction weights/targets must never be used as a hidden teacher or controller.

Continue toward real one/two-lap learning, then other models/tracks/seeds and cold starts; do not redefine success as these private integration checks. Prefer a controlled optimization/stability comparison before blindly widening the readout. Preserve the completed experiment's immutable inference/math/model sources and reports. Any orchestration change needs transparent source provenance rather than relabeling an old report. Evaluate exported numeric Node24 policies from the line; Torch-only trajectories and cached practice cannot prove native laps. Do not edit sources/fingerprints of already-open user copies, auto-close them, increment5.6.0, commit without verified model attribution or publish a release.

COMMAND-SPACE RESEARCH — 2026-10-15

The trust and16-step SAC comparisons both finished without improving the3803m parent. A later audit found a genuine restriction in the NEW nested bounded SAC corrector: at full observed context72of428actual commands could not release throttle and93could not reach half-brake. This does NOT prove a physical-brake fault or the same restriction in the projected18 Windows parent. A separate command-space neural corrector now has full actuator range at full neural context and exact zero-correction identity, with fresh actual zero/full/native proofs. No old inference sources or Windows copies were changed.

Command-space SAC still failed to improve. CPU fitness-only search over TWO neural output biases then gained6.208431139m: best3809.278554262007m,fitness-600.8843393789334,0laps, independently repeated in two full and two standalone native episodes. A subsequent18-coordinate unsupervised neural-readout search did not improve this. Its first process failed with MemoryError after224committed records; a separately verified exact optimizer/RNG recovery completed32new recorded evaluations for256committed records. Uncommitted attempts are not included in that total and their physical count is unknown. See APPRENDIMENTO-COMANDI-NEURALI-DEV.md; do not label small gains or completed tests as learning-goal completion.

A separate asymmetric TD3 experiment finished: the driving actor still has521neuronal/controller-only inputs, while a training critic can see36additional actual sensor/reward-state values.32fully repeated complete actual controllers supplied9346aligned transition rows, with matching entire control traces and no invented examples. Critic initialization uses actual behavior returns, not teacher controls; actor coefficients stayed exactly unchanged during that phase.20000new transitions,20000online critic updates,10000actor updates,2000critic-prefit updates and356practice episodes still did NOT improve3809m/0laps. All37698actor coefficients changed; final3584.989846m/-829.561899. Two full plus two fresh native selected-model proofs and an independent reconciliation passed. This combined profile is NOT an isolated causal comparison or proof that partial observability caused previous failures. Do not install it into either older Windows copy or change their private-save compatibility.

A scalar native audit on the9346actual recorded states measured severe output drift/saturation in the rejected4000/8000step actors; this does not prove an across-model physical steering/brake defect. A controlled own-replay-regularized TD3 comparison is now launched separately, with the same data/architecture/source/budget/backend and prefit recipe. Before updating the actor, it must match all prepared policy tensors AND Adam states of the completed reference. Its explicit regularizer follows the TD3+BC actor criterion using agents own ACTUAL replay actions, not ideal actions or an external teacher; online collection means this is NOT a reproduction of the offline-only paper. Keep that distinction honest. Await actual from-line numeric driving outcomes, not a loss reduction or passing unit tests.

UPDATE: The own-replay regularized comparison finished too: all36prepared policy tensors AND both Adam states matched exactly.20000new transitions/20000online critic updates/10000actor updates/2000critic-prefit updates/319practice episodes still did NOT improve the3809m clean champion. Final after all updates3622.079036m/-2638.315573,collision. The checkpoint20000candidate was evaluated BEFORE its last gradient update and has different metrics; never substitute it for the final actor. Independent verification and two full plus two fresh standalone selected-model proofs passed. The regularizer's actual replay-action MSE averaged.11636,max.41926; it is not a hard safety/drift constraint. No weak candidate was installed.

The next actual exploration branch was selected from the EXISTING verified CMA archive: record194,4013.367375m/-2253.690406,collision. It is deliberately NOT a clean champion. Fresh full5326control and practice707control rollouts matched the original branch results and entire practice trace. Raw actual neuronal/controller inputs and commands were recorded. A new neuronal-only context has zero support on all5230protected observations and first activates at actual control5252,74controls before the failure. A separate two-coefficient fitness-only correction search is now running with16candidates/two pinned CPU workers. It must first prove exact zero-correction full/suffix identity, then clean candidates need two full from-line proofs against3809m, followed by standalone numeric-model and Windows verification. This reuses the return-then-explore principle, not a full Go-Explore implementation, not route/time/progress input or a teacher. Do not promote the crashing parent or call cached practice a lap/generation. Preserve every completed run's frozen sources and originals.

Two completed numerical CPU/CUDA microbenchmarks are preserved separately. The first had concurrent CUDA training and greatly inflated measured CUDA latency; after that trainer finished, CUDA backward was faster than one CPU thread, while single-state actor/NumPy roundtrip stayed faster on CPU. Neither benchmark includes full optimizer/physics cost or proves an app speedup. No open user app was closed, no frozen inference source was changed, and the controlled next run keeps the same backend. A first failed timing-only script is explicitly excluded and preserved with its source; it was not a failed physical/learning experiment.

CURRENT VERIFIED LEARNING STATUS — 2026-10-15

The later real-return neuronal frontier searches achieved the first actual Monza lap. Global clean best is6584.838934902363m / fitness4052.108730315078 /1lap, lap time742.5501609581744simseconds, terminal reason too slow/no progress at849.4833333333333simseconds. Source is neuronal-chain-6541-search/clean.malecns-frontier-chain.json, SHA4a752dfb82c2268721f0ae100e550bd174be81a04e96ca7259b3e29814043d80, with two full Bridge plus two independently loaded native complete traces matching384601f5a3a8b3c7129c76a58fb4e2b3e43709ad15902ba015088dc0977bb1ac. Warm-start V3/Monza ONLY; one very slow lap, NOT two, other models/tracks or cold-start success. Do not mark the broader goal complete.

The initial crashing4013m branch was repaired to4287m but still crashed. Subsequent128-evaluation searches each produced clean4568m, then6491m/1lap, then6584m/1lap. Preserve their separately verified exploration branches, never relabel farther collisions as clean champions. Later wider-longitudinal, earlier-context and six-coefficient/three-new-context searches all finished and were independently verified but did NOT dominate6584m. Global selection now lives in neuronal-clean-champion.json and is guarded by select_neural_clean_champion.py; each trainer's fixed3809anchor flag is NOT evidence of a new global best. The latest model is not necessarily the strongest.

Actual native cue audit of the six-coefficient trial passed its complete control trace. Two of its three new contexts never activated; only the earliest new cue activated, at8135controls. This proves unused nominal capacity on that one trajectory, not a universal diagnosis. Prefer a genuinely state-dependent neural correction or evidence-led context design over repeating identical searches or blindly adding biological neurons. The graph still has7721real anatomical nodes/242486edges. No ideal actions, target coordinates, route, progress, lap counter or wall clock may drive the car. Training sample order can select actual frontier states; it must not become a hidden controller.

WINDOWS INTEGRATION IN PROGRESS — 2026-10-15

The author chose16initial cars, maximum100, paused from the best independently verified model. A NEW isolated neural-chain desktop adapter/main/coordinator/worker/arena/archive/save/UI copy and Avvia-campione-neurale-dev launcher now implement that choice. Existing native/grown/projected copies and frozen inference models are not modified. The complete data-only chain is embedded in a new incompatible .malecns-chain-dev file, with static dependency-closure fingerprints including vehicle/physical terrain, numeric runtime and UI. Loading performs a full physical native trace preflight before interrupting the current trial, then restarts at the line paused; it is not a mid-lap restore. A five-test suite passes default-choice, strict save roundtrip/rejection, mutations and100independent actual agents. Full real Windows16-car-generation/save/load/visual smoke is currently running in chain-training-ui-first; do NOT call it passed until verification.json is present and all actual results reconcile. Scope remains5.6.0 private local development, no release/tag/push or source attribution guessed from available models.

WINDOWS INTEGRATION NOW VERIFIED — 2026-10-15

The first Windows attempt completed16actual episodes/one update and exactly matched the protected agent's entire native command trace, then the TEST timed out waiting45s for full load preflight. Preserve its failed.json, actual private save and smoke-source-at-timeout.cjs (SHA04d91fe821b3b83b56d26142cc81bd1a595ffde1c19fac3d9c4194b66bad56ee); do not relabel it passed or rerun over its folder. Frozen neural-chain main/save/inference/UI/test sources and their fb85e4c62abcfdbdb6b652255a9801d950ddb3f145a7c735f0dc00c656e779ba engine identity were NOT changed to evade compatibility.

A separate diagnostic entry only substituted the harness. Its180+second load allowance recovered the genuinely created file exactly, then evaluated a SECOND actual16car generation with16distinct pairs.32episodes/two updates completed; the clean champion did NOT improve. Maximum observed6595.291973756102m was a collision and stayed exploratory; clean best still6584.838934902363m/4052.108730315078/1lap. Both physical preflight loads passed,46.71s and50.94s, exact weights/archive/RNG/history; invalid-engine files rejected before interruption, cancels/reset/paused observers passed. Completed recovery report: chain-training-ui-recovered/verification.json,18checks plus16preserved checks from the first partial attempt. It contains all16second-generation actual results and whole baseline trace evidence. Its real roundtrip-generation3.malecns-chain-dev includes32episodes, not a fabricated standard save. This completes the user's Windows-copy integration choice, NOT the broader two-lap/all-model learning goal.

The recovery's first screenshots captured preceding compositor frames. A separate SECOND/final bounded visual pass awaited actual DOM theme/view/camera/idle state, two frames and used an inactive visible window. chain-training-ui-visual-confirmation/verification.json passed7checks with four correct-state captures,1500/980/740px, zero physics changes and no renderer errors. Fresh cold startup can show the inherited geometric car placeholder while asynchronous Porsche asset loading proceeds; no original asset/renderer source was replaced. Do not use the preceding recovery captures as dark/split proof and do not start another polish loop. Existing source/CSS identities are preserved.

NEXT LEARNING FAMILY PREPARED AND ZERO-VERIFIED — 2026-10-15

The two dormant new cues of the prior multi6 search motivated a STATE-DEPENDENT neural head rather than more latched constant offsets. collect-current-neural-champion.cjs recorded a NEW full8495control clean6584m episode (56.605s wall), exactly matched the protected full trace, with a retained older native proof explicitly labeled as retained, not another new run. Folder neuronal-clean-6584-actual-projection-source. prepare-neural-chain-context.cjs with tail256 produced exact zero prefix support, first actual new gate8300, folder neuronal-clean-6584-statehead-zero-context. prepare_neural_statehead.py uses ONLY the516neuronal/controller columns of256actual late states, eight unsupervised PCA axes, no physical/action/reward/time/progress targets. New18coefficients are ZERO, not trained; pca/projection axes are artificial math, not new biological cells.

New isolated files: neural-statehead.cjs, neural-statehead-model.cjs, neural-statehead-env.cjs, neural-research-source-identity.cjs, statehead-model-io.cjs, preflight-neural-statehead.cjs. Frozen chain/app files stay unchanged. Model embeds its clean parent, materializes a hash-keyed owned data-only parent cache and checks the complete local static dependency closure including physical terrain/vehicle and Node executable. Normal loading rejects the research-unverified seed. Controller uses actual current neuronal features plus a clamped retained gate, then full-range exclusive Motor.compose; no hidden driver or sample-order input.18current-state coefficients, NOT extra anatomical neurons.

Four actual-data unit tests passed. neuronal-clean-6584-statehead-preflight/report.json PASSED: actually reached8300control prefix, exact own restored suffix trace, full Bridge episode and independently loaded Native episode ALL reproduce6584.838934902363m/4052.108730315078/1lap and the original384601f5...full trace. Zero model file neuronal-clean-6584-statehead-prepared/zero.malecns-statehead.json SHAe34ade608203efcce632ae6bff78d567fc44184fb8a90bb5098837dc6329b68f. It remains explicitly research-unverified because there is NO trained improvement. The nine new targeted tests (five desktop +four statehead) pass.

Next meaningful work: implement an isolated fitness-only18coefficient CMA trainer using neural-statehead-env.cjs (Pipe configuration requires preparedFile AND modelFile), protected baseline must be the GLOBAL6584m model, not fixed3809. Require every actual complete suffix candidate, fresh physical elite reevaluation, two full from-line and two separately loaded statehead-model-io native traces before accepting an exported clean improvement. Both old-constant bias and state-dependent head use actual neuronal state; no waypoint/clock/lap-reset/ideal controls. Update liveness/checkpoints per batch rather than leave state.json misleadingly initializing. Old CMA ask is UNBOUNDED: either correctly clip the actual pending x used by tell in a distinct transport or otherwise handle bounds transparently, never score fake/clipped different genes. Leave the current Windows app/source/save identity intact; do not install the untrained head or mutate live/frozen sources. No new18coefficient training has yet run.

USER WINDOW OPENED — 2026-10-15 21:07 UTC

Avvia-campione-neurale-dev.ps1 successfully opened the normal visible neural-chain-main.cjs --show application, not a diagnostic harness. Observed main PID4120, title Circuit Lab5.6.0/apprendimento neurale DEV/V3Monza, four pinned Node24 workers26180/20412/31840/26216. Fresh isolated development-chain-training-profile; tested default16cars/paused from global6584m model. Recheck current OS liveness before acting; these PIDs are a point-in-time observation. NEVER auto-close/restart/edit this user window's frozen65-file engine identity fb85e4c62abcfdbdb6b652255a9801d950ddb3f145a7c735f0dc00c656e779ba or any saved private study. Its original timeout harness is included in the dependency identity: do NOT patch it to change45s, use separate diagnostic entries as documented. All owned collection/preflight/diagnostic processes finished; only the newly handed-off user app remains from this integration. Original older context-preview worker26504 was still present and was not closed. Original31476 was no longer present when checked; no action here closed or reopened it.

Nine targeted desktop/statehead tests passed together with JUnit evidence in chain-training-ui-recovered/targeted-tests.xml. Nineteen before/after preserved-file SHA checks pass in preservation.json, including original author save and frozen source/model/UI files. Release binaries still SHA95f5bff7...portable /c070442d...setup, version5.6.0; dereferenced published tag commit7cb6fcf0b12bd56bd7a7510fef147f7356a2f3a4 unchanged. The plain git rev-parse v5.6.0 value b8e78c... is the annotated TAG OBJECT, not a changed source commit. Sixteen preexisting tracked dirtyfiles remain unchanged by this integration. No release/tag/push/commit was performed. The broader learning goal stays ACTIVE and unfinished; do not narrow its success to this Windows handoff or the zero-head identity proof.

ACTUAL STATE-HEAD LEARNING AND EARLIER WINDOW COMPLETED — 15–16 OCTOBER2026

Previous goal turn (Windows integration +zero-head proofs) was progress; this continuation is progress too, not merely waiting:512actual candidate episodes, one genuinely learned/independently exported18coefficient improvement, one negative controlled-window study, cross-family guard, paired exact-runtime optimization and a full controller-component audit. Full objective remains ACTIVE/unfinished: still only1very slow lap on warm-start V3/Monza, no2laps or other models/tracks/cold-start proof.

New bounded optimizer neural-statehead-cma.cjs projects the ACTUAL pending x to[-8,8] before scoring/tell. Two transport-only tests use no fictional physical fitness/model training. train_neural_statehead.py completed256actual cached-suffix candidates/16optimizer updates in263.813s; selected ALL18coefficients changed. Two full Bridge and two fresh standalone statehead-model-io native complete traces exactly match. verify_neural_statehead.py independently reconciled all asked/scored batches/elite fresh evaluations/full optimizer state/export/source hashes. Report neuronal-statehead-6584-cma-search/report.json SHAad8ec68bc65a53c0a294e3d64a81df6b9d8ebd836dfe48985eb5e56e0875e329. Verification SHA4586cc3cd33acf856fad0ec40e500084b3efab7ab97d0807a43040d4ba163bba. Trained model clean.malecns-statehead.json SHA5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35. Entire trace3e3658c1543fe43791dd21db1410e0e58213691a2d6569fc2d34146f45651244. New verified RESEARCH champion6590.791629964014m /4057.0775028753487 /1lap,742.5501609581744s lap, stop too slow at849.4833333333333s. Only+5.952695m/+4.968773pts, NOT convergence. Farthest cached6601.235403m was a COLLISION, not promoted/full-native-proved. NOT installed into the frozen Windows app.

select_neural_verified_catalog.py and neural_verified_catalog_test.py now reconcile CURRENT source hashes, envelope checksums and two matching complete native proofs across frontier-chain and state-head families. File neuronal-verified-model-catalog.json has selectedResearch (currently5de/6590m) SEPARATE from frozenWindowsCompatible (4a752d/6584m). NEVER update the old neuronal-clean-champion.json with a different format; it feeds the live frozen Windows app. Catalog no silent downgrade, no farther crash/newer-timestamp promotion. Unit test uses actual historical study values and remains valid when a stronger future model is selected.

Earlier-window study was real and NEGATIVE: new prepare-neural-chain-context-long.cjs allows up to4096actual tail controls (old file untouched), prepare_neural_statehead_window.py allows actual windows up to4096, same516neural columns only. Using the same recorded parent6584m,1024samples, first actual gate7727versus8300 (57.3simseconds earlier), new zero model SHAfaae7cf938136b35b6f468ca842bf502e9277158e6739f9800906810123332bf. neuronal-clean-6584-statehead-early1024-preflight/report.json passed reached-prefix/exact suffix/full Bridge/independent Native zero traces. train_neural_statehead_window.py has source-parent zero identity separate from stronger cross-family global guard6590m; snapshots protected catalog at start.256actual candidates/16updates completed511.109s, no clean improvement even over source6584m. Export908d419323a47a9236a6fb505281b7ea6e9923a00ffe1b6826cee0e904c6549d has ZERO new coefficients and is NOT a global promotion. Report SHA87e580f52dfd0bb6f68a35df352c042f5cabdbad2df3ab73fa95cafe436c9591. verify_neural_statehead_window.py passed all actual batches/optimizer/source/2full+2native proofs. Catalog keeps6590m. All these finished sources/models/reports are now frozen; do not edit them in place.

The final gate was>=.819275 in every256sample of the first study and exactly1 in ALL256earlier-window candidates. Persistent final low gate authority is NOT supported in these studies; this does not isolate all early-ramp effects. No reason to blindly install a hard full-activation gate as a claimed fix.

PERFORMANCE: EXACT PURE-KERNEL MEMO PROTOTYPE, NOT WINDOWS-INSTALLED

exact-coo-memo.cjs caches ONLY the pure Float64 COO neural pass, not actions/episodes/physics. Each car still steps independently. Exact activity/injection/gain bytes, topology/from/to/weights/groups snapshots; hashes only index entries and full bytes also confirm a hit. Detects in-place weight/group changes, preserves activity/next swap parity and separate mutable arrays; unsupported/aliased cases call original. Bounded32entries per graph. Three actual-data unit tests passed on12real neuronal states x1/2/4iterations with bitwise arrays, isolation/invalidation/fallback. New declared DIFFERENT engine neural-command-live-memo.cjs /neural-statehead-memo-runtime.cjs; origin numeric model uses its original loader, new runtime has its own complete source/runtime identity. NOT a compatibility bypass, never edit original live/source/save fingerprints.

benchmark-neural-memo-batch.cjs ran four actual distinct previously evaluated vectors under original then memo engine SEQUENTIALLY,33815controls EACH from line. Original report neuronal-memo-four-reference/report.json SHAddfaa8354e28085d91e7cc054a050a32316eb287ddd3879513eadd6d977b4bfa. Memo report neuronal-memo-four-memo/report.json SHA9a0701e2f1f625b9e5b168c3aebfeb685c52864d063411bda9fb38a99781e73e. verify_neural_memo_benchmark.py passed exact complete result AND entire action/progress/time trace per each4agents. Wall198.6638133s ->183.5195795s (-7.623%); processCPU188.110s ->162.047s (-13.855%).24903hits/8912misses/33815calls, zero invalidations/fallbacks in this run. ONE sequential measurement, other user apps open; NOT an app/FPS/GPU/learning speedup or randomized confidence interval. Do not overclaim or reinterpret progress.json's slightly later elapsed timestamp as the timed report value.

verify-neural-memo-live.cjs then ran2actual distinct controllers in ORIGINAL and MEMO engines lockstep from line. Entire brain object, entire vehicle, all neuronal observations, state-head gates/features, physical/reward/sensor/trail fields compare EVERY CONTROL. neuronal-memo-full-state-equivalence/report.json PASSED16912comparisons (8495+8415controls plus2initial), complete resulting6590m and6542m trajectories, no overlap. Memo8301hits/8609misses. This is strong finite full-state evidence, not a universal proof for all graphs/models.219s verifier time includes assertions and is NOT another performance measurement. Original app engine identityfb85e4c62abcfdbdb6b652255a9801d950ddb3f145a7c735f0dc00c656e779ba rechecked unchanged afterwards.

NEW DIAGNOSTIC EVIDENCE: ROOT CONTROL CHANGES BETWEEN LAPS

audit-neural-command-components.cjs replays the controller on8495ACTUAL recorded neural inputs from neuronal-clean-6584-actual-projection-source, with no physics driving/training. Reconstructs original causal-memory/current+peak authority, every stored521input and2inner residual and final motor. neuronal-command-component-audit/report.json PASSED zero input mismatches, zero inner mismatches, zero command differences, full original384601f5...trace. Ten labeled distance-bin samples (labels NEVER controller inputs). At first751.03m, prior/final steer-.00558,long-.20907 (brake); at second750.38m, prior+.05066,long+.95601, final+.01779,long+.70956 (throttle). At first500m priorsteer~-.00113,long.0950; second500m prior+.86437,long.98685, final+.79452,long.97096. Much difference already PRECEDES the latest NN/4constant stages, whose extra contributions are smaller. Physical/sensor/controller histories are NOT matched between these points: NOT proof of a brake hardware bug or one universal cause. Do not use component commands as ideal teacher targets. Blindly changing only the newest four gate decays would not directly address all observed prior differences.

NEXT MEANINGFUL LEARNING WORK (not yet implemented/run): current18head observes PCA neural features but not actual parent motor outputs/hidden controller memories. Test a genuinely more observable/stable neural-feedback head (e.g. learned gain/bias on actual neuronal parent commands, then nonlinear residual) rather than another identical PCA-window/CMA rerun. Pure affine gain/bias calibration4params could initialize exact identity, neural-only context before7727, use parent5de/6590m, learn steering gain+bias and longitudinal gain+bias from REAL fitness, no scripted braking or route. This is an experimental capacity/calibration stage, NOT shrinking the overall goal to a trivial controller; keep two laps and all-model/circuit/cold-start scope. A clipped/on-policy PPO residual is another untested alternative to rejected off-policy SAC/TD3. If taking PPO, keep baseline zero-residual identity, actual-reached-memory curriculum, no teacher/clock/geometry inputs, control inference precision/export parity rigorously (old Torch/Node rounding differences were real), and require two full +two fresh native exported-policy proofs before promotion. No such affine/PPO training has yet run.

All owned trainer/preflight/benchmark/full-state audit processes above were observed TERMINAL via their exec handles; no orphan trainer or pending benchmark known. The user window observed earlierPID4120 and its4workers MUST stay untouched; recheck actual current OS liveness before acting. Goal remains active, not blocked/complete. Six new targeted tests this continuation:2bounded-CMA+1catalog+3memo;9desktop/statehead tests from prior continuation remain separate evidence. Updated user guide no longer falsely says18coefficients untrained; clearly separates research6590m and frozen Windows6584m. No version/tag/release/push/commit or user-app closure performed. Full current narrative/evidence: APPRENDIMENTO-STATO-NEURALE-DEV.md.

MONZA V3 FRONTIER LINEAGE EXPERIMENT — 2026-10-19

Control and treatment at Monza/V3/seed7717/16 agents/8 generations had identical early progress because the farther-but-penalized branch did not activate before the 60s-per-generation cap. This is no efficacy result and no regression signal. The implementation keeps the penalized winner as champion and optimizer reference while retaining a distinct farther-progress genome and up to10% mutated offspring only when it is outside the fitness parent pool and ahead by the configured progress tolerance. Focused physical-fixture test passes and the complete suite passed395/395. Built a separate Windows portable at dist-learning-frontier-v3-560, still app version5.6.0; original distributions remain unchanged. Full portable smoke passed: V3/Monza/16 agents/paused/fresh isolated profile. SHA256 A493DD8B89C8CE95C6D4D299916F7512CF66CC08A39EE2573DE68BEFEDF59D25. Launch via Avvia-copia-frontiera-v3-560.cmd; per-copy profile is .impeccable/training-copy-frontier-v3-560-profile. This validates packaging/startup and branch inclusion, NOT improved lap completion. Preserve existing saves/release folders; no tag/release/commit/push. Continue actual multi-generation test on this copy and require 2 laps before claiming learning success.
