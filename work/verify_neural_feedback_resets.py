"""Regression: reset must preserve a real captured body AND neuronal phase."""
import argparse
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped reset proof required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        env=Pipe(ROOT/'work/neural-feedback-world-v2.cjs',initialization={'configuration':{'horizonControls':20}});meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        cases=[env.request('check-continuation',configuration={'snapshotIndex':j,'steps':10}) for j in [0,8,16,24]]
        assert all(c['withoutExtraRefresh']['bodyAndBrainExact'] for c in cases)
        assert any(not c['withExtraRefresh']['bodyAndBrainExact'] for c in cases)
        reset=env.request('reset',configuration={'mode':'local','snapshotIndex':0,'headingKickRad':0});assert reset['info']['progress']==reset['info']['laps']==0
        env.request('reset',configuration={'mode':'from-line'});zero=env.request('step',action=[0,0])
        env.request('reset',configuration={'mode':'from-line'});changed=env.request('step',action=[.01,0])
        assert changed['info']['oldHeadGate']==0 and abs(changed['info']['outputs'][0]-zero['info']['outputs'][0])>.001
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        report={'format':'private-neural-feedback-reset-phase-proof-v1','passed':True,'learningSucceeded':False,'cases':cases,
                'zeroedLocalProgressAndLaps':True,'earlyMotorAuthority':True,'fullBaseline':meta['baseline'],'baselineTraceSha256':meta['baselineTraceSha256'],
                'parentSha256':meta['parentSha256'],'sourceHashes':meta['sourceHashes'],'sourceSha256':file_hash(Path(__file__)),'cuda':stats,
                'boundary':'Four own snapshots:10complete body/neuronal transitions match the actual recorded parent exactly without extra refresh. Emulated v1 extra observation diverges, so previous local training used a changed neural phase. Physical kicks remain training perturbations; no pose or route inputs added. No trained two-lap result claimed.'}
        atomic_json(out/'report.json',report);(out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes());print('FEEDBACK_RESET_PROOF '+json.dumps(report),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);a=p.parse_args();run(a.tag)
