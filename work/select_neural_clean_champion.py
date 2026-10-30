"""Global promotion uses only reconciled, independently loaded clean models.

Individual searches compare a fixed old anchor. Their latest result must not
silently replace a stronger already verified result from another search.
"""
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,NODE,file_hash,atomic_json
from verify_neural_frontier_chain import model,KEYS


def dominates(a,b):
    return a['fitness']>b['fitness']+1e-6 and a['bestProgress']>=b['bestProgress'] and a['laps']>=b['laps']


def main():
    base=ROOT/'.impeccable/review/neural-sacl';registry_file=base/'neuronal-clean-champion.json';candidates=[]
    for folder in sorted(base.glob('neuronal-chain-*-search')):
        report_file=folder/'report.json';verification_file=folder/'verification.json'
        if not report_file.is_file() or not verification_file.is_file():continue
        report=json.loads(report_file.read_text(encoding='utf-8'));v=json.loads(verification_file.read_text(encoding='utf-8'))
        if not report.get('passed') or report.get('phase')!='finished' or not v.get('passed') or v['reportSha256']!=file_hash(report_file) or not report.get('cleanModelFile'):continue
        file=Path(report['cleanModelFile']).resolve()
        if not file.is_relative_to(folder.resolve()):raise RuntimeError('Bounded own clean model path required')
        data=model(file);proofs=report['nativeCleanProofs'];digest=file_hash(file)
        if data['status']!='clean-verified' or len(proofs)!=2 or v['cleanModelSha256']!=digest or any(not p['passed'] or p['censored'] or p['overlap'] or p['quality']!='clean-verified' or p['modelSha256']!=digest for p in proofs):raise RuntimeError('Actual clean loaded-model proofs required')
        if proofs[0]['actionTraceSha256']!=proofs[1]['actionTraceSha256'] or any(proofs[0]['result'][k]!=proofs[1]['result'][k] for k in KEYS):raise RuntimeError('Exact native repeats required')
        candidates.append({'modelFile':str(file),'modelSha256':digest,'result':proofs[0]['result'],'actionTraceSha256':proofs[0]['actionTraceSha256'],'stageCount':len(data['stages']),'reportFile':str(report_file),'reportSha256':file_hash(report_file),'verificationSha256':file_hash(verification_file)})
    if not candidates:raise RuntimeError('No fully verified clean frontier model; preserve the current registry')
    candidates.sort(key=lambda c:(c['result']['laps'],c['result']['bestProgress'],c['result']['fitness']))
    old=json.loads(registry_file.read_text(encoding='utf-8')) if registry_file.exists() else None
    if old:
        selected=next((c for c in candidates if c['modelSha256']==old['selected']['modelSha256']),None)
        if selected is None:raise RuntimeError('Previous verified champion no longer reconciles; never silently discard it')
    else:selected=candidates[0]
    for candidate in candidates:
        if dominates(candidate['result'],selected['result']):selected=candidate
    changed=not old or selected['modelSha256']!=old['selected']['modelSha256']
    history=(old['history'][:] if old else [])
    if changed:history.append({'modelSha256':selected['modelSha256'],'result':selected['result'],'reportSha256':selected['reportSha256']})
    registry={'format':'male-cns-private-verified-clean-champion-registry-v1','schema':1,'appVersion':'5.6.0','modelId':'v3','circuitId':'monza','nodeExecutableSha256':file_hash(NODE),'selected':selected,'history':history,'eligibleVerifiedModels':len(candidates),
              'boundary':'Global best among independently reconciled clean V3/Monza warm-start frontier models. A newer timestamp, better score alone, farther crash or fixed-anchor improvement cannot replace it. Not an app install, release or all-model/circuit/cold-start guarantee.'}
    atomic_json(registry_file,registry);print('GLOBAL_NEURAL_CLEAN_CHAMPION '+json.dumps({'changed':changed,'selected':selected,'eligibleVerifiedModels':len(candidates)}),flush=True)


if __name__=='__main__':main()
