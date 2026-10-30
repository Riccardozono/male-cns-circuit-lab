"""A true replay reset preserves rewards/deadlines, not just the visible body."""
import argparse
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped context regression required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        env=Pipe(ROOT/'work/neural-feedback-world-v3.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        atomic_json(out/'metadata.private.json',meta)
        cases=[env.request('check-continuation',configuration={'snapshotIndex':j,'steps':200}) for j in [4,16,32,34]]
        assert all(c['preserveActualContext']['bodyAndBrainExact'] and c['preserveActualContext']['rewardsExact'] for c in cases)
        assert any(not c['freshBookkeeping']['rewardsExact'] for c in cases)
        reset=env.request('reset',configuration={'mode':'local','snapshotIndex':34,'headingKickRad':0})
        assert reset['info']['progress']==reset['info']['laps']==0 and reset['info']['inheritedRealLaps']==1
        first=env.request('step',action=[0,0]);assert first['info']['laps']==0
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        report={'format':'private-neural-feedback-reward-context-proof-v1','passed':True,'learningSucceeded':False,'cases':cases,
                'localResetInfo':reset['info'],'firstActualLocalStepInfo':first['info'],'parentSha256':meta['parentSha256'],
                'fullBaseline':meta['baseline'],'baselineTraceSha256':meta['baselineTraceSha256'],'sourceHashes':meta['sourceHashes'],
                'verifierSha256':file_hash(Path(__file__)),'cuda':stats,
                'boundary':'Four real captured states, up to200transitions each, reproduce original future physics, neuronal state AND reward deltas exactly. Clearing bookkeeping in v2 instead changes termination/reward context. V3 preserves actual previous state but returns only future reward and relative local progress/laps; it cannot claim a full from-line lap from a snapshot. No new trained result.'}
        atomic_json(out/'report.json',report);print('REWARD_CONTEXT_PROOF '+json.dumps({k:v for k,v in report.items() if k not in ['sourceHashes','cuda']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);run(p.parse_args().tag)
