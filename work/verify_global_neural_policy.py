"""Fresh native physical replays for the global recurrent-policy experiment."""
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash

parser=argparse.ArgumentParser()
parser.add_argument('--study',required=True)
parser.add_argument('--tag',required=True)
args=parser.parse_args()
study=(ROOT/'.impeccable/review/learning-ml'/args.study).resolve()
if not study.is_relative_to(ROOT) or not args.tag.replace('-','').isalnum():
    raise ValueError('Scoped named verification required')
out=ROOT/'.impeccable/review/learning-ml'/args.tag
out.mkdir(exist_ok=False)
report=json.loads((study/'report.json').read_text())
checkpoint_bytes=(study/'checkpoint.private.json').read_bytes()
checkpoint=json.loads(checkpoint_bytes)
assert report['passed'] and checkpoint['format']=='private-global-neural-policy-checkpoint-v1'
assert checkpoint['sourceHashes']==report['sourceHashes'] and checkpoint['bestSafe']==report['bestSafe']
assert report['bestSafe']['aggregate']['allSafe']
assert all(file_hash(ROOT/f)==digest for f,digest in report['sourceHashes'].items())
env=None
try:
    env=Pipe(ROOT/'work/recurrent-v3-global-env.cjs')
    meta=env.metadata
    assert meta['parentSha256']==checkpoint['rootParentSha256'] and meta['rewardRevision']==checkpoint['revision']
    for key,value in meta['genome'].items():
        if key!='policyWeights':
            assert checkpoint['currentGenome'][key]==value
    def evaluate(weights,offset):
        result=env.request('evaluate',weights=weights,configuration={'maxTicks':0,'headingOffsetRad':offset})
        assert not result['censored']
        return result
    def summary(rows):
        return {'allSafe':all(r['safe'] for r in rows),'minimumLaps':min(r['laps'] for r in rows),
                'minimumProgress':min(r['bestProgress'] for r in rows),'meanProgress':float(np.mean([r['bestProgress'] for r in rows])),
                'meanFitness':float(np.mean([r['fitness'] for r in rows]))}
    training=[]
    for row in report['baseline']:
        offset=row['headingOffsetRad']
        before=evaluate(meta['genome']['policyWeights'],offset)
        after=evaluate(report['bestSafe']['weights'],offset)
        repeat=evaluate(report['bestSafe']['weights'],offset)
        expected=next(r['result'] for r in report['bestSafe']['outcomes'] if r['headingOffsetRad']==offset)
        assert before==row['result'] and after==repeat==expected
        training.append({'headingOffsetRad':offset,'before':before,'after':after,'repeatIdentical':True})
        print('GLOBAL_PROOF_TRAIN '+json.dumps(training[-1]),flush=True)
    assert summary([r['after'] for r in training])==report['bestSafe']['aggregate']
    def compare(offsets,label):
        rows=[]
        for offset in offsets:
            assert offset not in report['settings']['trainingOffsets']
            row={'headingOffsetRad':offset,'before':evaluate(meta['genome']['policyWeights'],offset),'after':evaluate(report['bestSafe']['weights'],offset)}
            rows.append(row)
            print('GLOBAL_PROOF_EVAL '+json.dumps({'split':label,**row}),flush=True)
        return rows
    validation=compare(report['settings']['validationOffsets'],'prior-validation')
    test=compare(report['settings']['testOffsets'],'prespecified-test')
    research=[{'headingOffsetRad':offset,'result':evaluate(checkpoint['currentGenome']['policyWeights'],offset)} for offset in report['settings']['trainingOffsets']]
    root=np.array(meta['genome']['policyWeights'])
    offset=meta['graph']['readoutOffset']
    blocks=[('sensoryScale',0,28),('sensoryBias',28,56),('recurrentGain',56,offset),('motorReadoutAndBias',offset,len(root))]
    def changes(weights):
        delta=np.array(weights)-root
        return {name:{'changed':int(np.count_nonzero(np.abs(delta[a:b])>1e-12)),'norm':float(np.linalg.norm(delta[a:b]))} for name,a,b in blocks}
    validation_summary=summary([r['after'] for r in validation])
    test_summary=summary([r['after'] for r in test])
    save_hash=file_hash('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
    assert save_hash==report['originalSaveSha256']=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
    result={'format':'private-global-neural-policy-native-proof-v1','passed':True,
            'learningSucceeded':report['bestSafe']['aggregate']['minimumLaps']>=2 and validation_summary['minimumLaps']>=2 and test_summary['minimumLaps']>=2 and validation_summary['allSafe'] and test_summary['allSafe'],
            'training':training,'trainingAggregate':report['bestSafe']['aggregate'],'validation':validation,'validationAggregate':validation_summary,
            'test':test,'testAggregate':test_summary,'researchCurrent':research,'researchCurrentAggregate':summary([r['result'] for r in research]),
            'bestWeightChanges':changes(report['bestSafe']['weights']),'researchWeightChanges':changes(checkpoint['currentGenome']['policyWeights']),
            'sourceHashes':report['sourceHashes'],'trainingReportSha256':file_hash(study/'report.json'),'checkpointSha256':file_hash(study/'checkpoint.private.json'),
            'verifierSha256':file_hash(Path(__file__)),'originalSaveSha256':save_hash,
            'boundary':'Fresh native from-line replays verify recorded outcomes, not bitwise optimizer continuation or all internal neural states. Validation/test excluded from training; prior validation already observed for older policies. Native202controller starting near795m, not the distinct935m context model. Private geometry revision, no app distribution or save-compatibility bypass.'}
    atomic_json(out/'report.json',result)
    (out/'checkpoint-snapshot.private.json').write_bytes(checkpoint_bytes)
    (out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes())
    print('GLOBAL_PROOF_RESULT '+json.dumps({'passed':True,'learningSucceeded':result['learningSucceeded'],'training':result['trainingAggregate'],
        'validation':validation_summary,'test':test_summary,'bestWeightChanges':result['bestWeightChanges'],'report':str(out/'report.json'),'sha256':file_hash(out/'report.json')}),flush=True)
finally:
    if env:
        env.close()
