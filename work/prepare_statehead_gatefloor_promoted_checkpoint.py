"""Create a new private research checkpoint from a repeated full-line proof."""
import copy
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
run=ROOT/'.impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-20261026-12'
source=run/'checkpoint.private.json'
report=json.loads((run/'report.json').read_text(encoding='utf-8'))
checkpoint=json.loads(source.read_text(encoding='utf-8'))
proof_dir=ROOT/'.impeccable/review/learning-ml/statehead-gatefloor-best-fraction-20261026-14'
proof=json.loads((proof_dir/'report.json').read_text(encoding='utf-8'))
candidate=next(c for e in report['events'] if e['update']==6 for c in e['candidates'] if c['fraction']==.03)
assert candidate['surrogateEligible'] and report['settings']['gateFloor']==.001
assert proof['passed'] and proof['candidateUpdate']==6 and proof['candidateFraction']==.03
assert all(row['result']==candidate.get('fullFromLineResult', proof['runs'][0]['result']) for row in proof['runs'])
assert proof['runs'][0]['result']==proof['runs'][1]['result']
assert proof['runs'][0]['result']['laps']==0 and proof['runs'][0]['result']['bestProgress']>report['bestFull']['result']['bestProgress']
assert checkpoint['rootParentSha256']==proof['parentSha256']
assert checkpoint['settings']['gateFloor']==proof['gateFloor']

promoted=copy.deepcopy(checkpoint)
promoted['currentWeights']=candidate['weights'][:]
promoted['currentExploration']=copy.deepcopy(candidate['exploration'])
promoted['currentFull']=copy.deepcopy(proof['runs'][0]['result'])
promoted['bestFull']={
    'weights':candidate['weights'][:],
    'exploration':copy.deepcopy(candidate['exploration']),
    'result':copy.deepcopy(proof['runs'][0]['result']),
    'fullFromLine':True,
    'source':'posthoc-full-from-line-proof-update6-fraction0.03',
}
promoted['optimizerState']={'m':[0.]*38,'v':[0.]*38,'t':0}
promoted['policySelectionProof']={
    'sourceTrainingReportSha256':hashlib.sha256((run/'report.json').read_bytes()).hexdigest(),
    'sourceCandidateFractionReportSha256':hashlib.sha256((ROOT/'.impeccable/review/learning-ml/statehead-gatefloor-candidate-fractions-20261026-13/report.json').read_bytes()).hexdigest(),
    'repeatedReplayReportSha256':hashlib.sha256((proof_dir/'report.json').read_bytes()).hexdigest(),
    'candidateUpdate':6,'candidateFraction':.03,'gateFloor':.001,
    'result':proof['runs'][0]['result'],
    'change':'Selected the best safe, repeatable full-line result among PPO-screen-eligible fractions; reset Adam moments because the promoted step is a post-hoc branch selection.',
}

destination=run/'checkpoint.posthoc-best-fraction-06-003.private.json'
if destination.exists():
    raise FileExistsError(destination)
destination.write_text(json.dumps(promoted,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'destination':str(destination.relative_to(ROOT)),'nextUpdate':promoted['nextUpdate'],
                  'bestProgress':promoted['bestFull']['result']['bestProgress'],'laps':promoted['bestFull']['result']['laps'],
                  'sourceCheckpointSha256':hashlib.sha256(source.read_bytes()).hexdigest()},ensure_ascii=False))
