"""Current neural motor feedback must be causal and preserve exact zero-action physics."""
import argparse
import base64
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped preparation proof required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    old=ROOT/'.impeccable/review/learning-ml/neural-feedback-retention-proof-20261025-01/report.json'
    oldproof=json.loads(old.read_text());assert oldproof['passed']
    try:
        env=Pipe(ROOT/'work/neural-intent-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        atomic_json(out/'metadata.private.json',meta)
        assert meta['observationLength']==520 and meta['baselinePreparations']==meta['referenceControls']
        assert meta['baseline']==oldproof['baseline'] and meta['firstLapBodySequenceSha256']==oldproof['firstLapBodySequenceSha256']
        preparation=env.request('check-preparation')
        assert preparation['idempotent'] and preparation['physicalAndNeuralStateUnchanged'] and preparation['preparations']==1
        assert preparation['observationIntention']==[preparation['currentIntent'][0],preparation['currentIntent'][1]-preparation['currentIntent'][2]]
        assert preparation['observationIntention']!=preparation['previousExecutedMotors']
        cases=[env.request('check-continuation',configuration={'snapshotIndex':j,'steps':20}) for j in [0,16,32,34]]
        assert all(c['preserveActualContext']['bodyAndBrainExact'] and c['preserveActualContext']['rewardsExact'] for c in cases)
        reference=env.request('reference');bank=np.frombuffer(base64.b64decode(reference.pop('base64')),dtype='<f4').reshape(reference['shape']).copy()
        assert bank.shape==(meta['firstLapControls'],520) and np.isfinite(bank).all()
        np.save(out/'successful-neural-reference-520.private.npy',bank);atomic_json(out/'reference-info.private.json',reference)
        silence=env.request('check-brain-silence');assert silence['allZero']
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        report={'format':'private-current-neural-intent-proof-v1','passed':True,'learningSucceeded':False,'approvedForApp':False,
                'preparation':preparation,'fullZeroResidualResult':meta['baseline'],'fullZeroResidualTraceSha256':meta['baselineTraceSha256'],
                'baselineControls':meta['referenceControls'],'baselinePreparations':meta['baselinePreparations'],
                'firstLapControls':meta['firstLapControls'],'firstLapBodySequenceSha256':meta['firstLapBodySequenceSha256'],
                'continuations':cases,'brainSilence':silence,'referenceShape':list(bank.shape),
                'referenceSha256':file_hash(out/'successful-neural-reference-520.private.npy'),'parentSha256':meta['parentSha256'],
                'sourceHashes':meta['sourceHashes'],'verifierSha256':file_hash(Path(__file__)),'cuda':stats,
                'boundary':'Two extra state signals are the CURRENT composite neuronal motor intention before physical action. They are internal feedback, not target actions or future physics. Preparation caches one control computation, does not integrate neurons/physics, and survives own-state capture/restore. Zero action matches the protected full trajectory; additional information is not yet proof of better learning. Fresh520bank, no padding or silent reuse of518data; app5.6unchanged.'}
        atomic_json(out/'report.json',report)
        print('NEURAL_INTENT_PROOF '+json.dumps({k:v for k,v in report.items() if k not in ['sourceHashes','cuda']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);run(p.parse_args().tag)
