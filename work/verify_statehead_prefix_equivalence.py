"""Check causal zero-gate prefix reuse with a changed policy and exploration."""
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped verification required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    calibration=out.parent/'statehead-exploration-calibration-20261025-01'
    c=json.loads((calibration/'selected-exploration.private.json').read_text())
    observed=[]
    for sign in [1,-1]:
        e=json.loads((calibration/f'selected-full-{sign}.private.json').read_text())
        observed.append({'sign':sign,'prefixControls':8200,'maximumGate':max(r['gate'] for r in e['rows'][:8200]),'active':sum(r['active'] for r in e['rows'][:8200])})
    assert all(r['maximumGate']==0 and r['active']==0 for r in observed)
    try:
        env=Pipe(ROOT/'work/statehead-reward-env.cjs');meta=env.metadata
        weights=np.clip(np.asarray(meta['weights'])+1e-4*np.sin(np.arange(18)*1.7+.3),-8,8).tolist()
        cfg={**c,'weights':(.01*np.sin(np.arange(20)*1.1)).tolist()}
        full=env.request('episode',configuration={'weights':weights,'exploration':cfg,'resetMode':'from-line','seed':91262029,'sign':1})
        env.request('clear')
        local=env.request('episode',configuration={'weights':weights,'exploration':cfg,'resetMode':'observed-8200','seed':91262029,'sign':1})
        assert full['rows'][8200:]==local['rows'] and full['result']==local['result']
        assert all(r['gate']==0 and not r['active'] for r in full['rows'][:8200])
        assert abs(local['nativeRewardAfterReset']-(full['result']['fitness']-local['start']['fitness']))<1e-7
        atomic_json(out/'changed-full.private.json',full);atomic_json(out/'changed-continuation.private.json',local)
        result={'format':'private-statehead-causal-prefix-equivalence-v1','passed':True,'learningSucceeded':False,
                'parentSha256':meta['parentSha256'],'prefixControls':8200,'calibrationPrefixes':observed,
                'changedMeanCoefficients':int(np.sum(np.abs(np.asarray(weights)-meta['weights'])>1e-12)),
                'changedVarianceCoefficients':int(np.sum(np.abs(cfg['weights'])>1e-12)),
                'fullControls':full['controls'],'continuationControls':local['controls'],'allContinuationRowsIdentical':True,
                'result':full['result'],'fullResultIdentical':True,'cuda':env.request('stats'),'sourceHashes':meta['sourceHashes'],
                'sourceSha256':file_hash(Path(__file__)),'fullSha256':file_hash(out/'changed-full.private.json'),
                'boundary':'Observed zero gate and no sampled noise before8200, plus a changed38-parameter counterfactual with bit-identical suffix rows/results. Source induction: these head parameters cannot affect commands while their existing neuronal gate is zero. Reuse is an optimization for this family, not a new protected-prefix requirement or proof of two learned laps. Candidate promotion still requires full fresh from-line replay.'}
        atomic_json(out/'report.json',result);(out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes());print('STATEHEAD_PREFIX_EQUIVALENCE '+json.dumps(result),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);a=p.parse_args();run(a.tag)
