"""Verify full baseline identity, early motor authority and honest local resets."""
import argparse
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped verification required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        env=Pipe(ROOT/'work/neural-feedback-world.cjs',initialization={'configuration':{'horizonControls':20}});meta=env.metadata
        atomic_json(out/'metadata.private.json',meta)
        assert meta['observationLength']==518 and meta['referenceControls']>8000 and len(meta['snapshots'])>=30
        env.request('reset',configuration={'mode':'from-line'});zero=env.request('step',action=[0,0])
        env.request('reset',configuration={'mode':'from-line'});positive=env.request('step',action=[.01,0])
        env.request('reset',configuration={'mode':'from-line'});negative=env.request('step',action=[-.01,0])
        assert zero['info']['oldHeadGate']==positive['info']['oldHeadGate']==negative['info']['oldHeadGate']==0
        assert max(abs(positive['info']['outputs'][0]-zero['info']['outputs'][0]),abs(negative['info']['outputs'][0]-zero['info']['outputs'][0]))>.001
        assert all(min(x['info']['outputs'][1:])==0 for x in [zero,positive,negative])
        local=env.request('reset',configuration={'mode':'local','snapshotIndex':0,'headingKickRad':.005})
        assert local['info']['progress']==0 and local['info']['laps']==0 and len(local['observation'])==518
        reward=0;last=None
        for _ in range(20):
            last=env.request('step',action=[0,0]);reward+=last['reward']
            if last['terminated'] or last['truncated']:break
        assert last['terminated'] or last['truncated']
        if last['truncated']:assert not last['terminated'] and last['info']['localControls']==20
        cold=env.request('reset',configuration={'mode':'cold-training','headingKickRad':-.005});assert cold['info']['laps']==0 and cold['info']['progress']==0
        assert all(file_hash(ROOT/f)==h for f,h in meta['sourceHashes'].items())
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        result={'format':'private-neural-feedback-world-preflight-v1','passed':True,'learningSucceeded':False,'parentSha256':meta['parentSha256'],
                'fullZeroResidualBaseline':meta['baseline'],'fullZeroResidualTraceSha256':meta['baselineTraceSha256'],'referenceControls':meta['referenceControls'],
                'earlyAuthority':{'zero':zero['info'],'positiveResidual':positive['info'],'negativeResidual':negative['info']},
                'localResetZeroedBookkeeping':True,'localEpisode':{'reward':reward,'lastInfo':last['info'],'terminated':last['terminated'],'truncated':last['truncated']},
                'coldPerturbationBeforeInitialNeuralObservation':True,'observationLength':518,'snapshots':len(meta['snapshots']),
                'sourceHashes':meta['sourceHashes'],'sourceSha256':file_hash(Path(__file__)),'cuda':stats,
                'boundary':'New global motor residual has authority while old head gate0 and preserves full parent trace when zero. Own real snapshots have zero local progress/laps; horizon is a bootstrap-required truncation, not a completed generation. No trained neural policy or two-lap improvement claimed.'}
        atomic_json(out/'report.json',result);(out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes());print('NEURAL_FEEDBACK_PREFLIGHT '+json.dumps(result),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);a=p.parse_args();run(a.tag)
