"""Evidence index and explicit non-promotion for completed research studies."""
import datetime
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,atomic_json,file_hash


def main():
    base=ROOT/'.impeccable/review/learning-ml';out=base/'learning-readout-status-20261025-01';out.mkdir(exist_ok=False)
    late=['statehead-reward-cuda3-20261025-01','statehead-reward-cuda8-20261025-01']
    global_studies=['neural-feedback-ppo32-20261025-01','neural-feedback-ar1-ppo32-20261025-01',
                    'neural-feedback-multitask32-20261025-01','neural-feedback-context16-20261025-01']
    proofs=['statehead-reward-native-proof-20261025-01','statehead-reward-native-proof-20261025-02',
            'statehead-causal-authority-20261025-01','neural-feedback-reset-proof-20261025-01',
            'neural-feedback-ar1-preflight-20261025-01','neural-feedback-gradient-credit-20261025-01',
            'neural-feedback-multitask-preflight-20261025-01','neural-feedback-reward-context-proof-20261025-01',
            'neural-feedback-ar1-restore-20261025-01','neural-feedback-multitask-restore-20261025-01','neural-feedback-context-restore-20261025-01']
    reports={name:json.loads((base/name/'report.json').read_text()) for name in late+global_studies+proofs}
    assert all(r['passed'] for r in reports.values())
    current_hashes={}
    for name in late+global_studies:
        r=reports[name]
        assert not r['learningSucceeded'] and not r['approvedForApp']
        for f,sha in r['sourceHashes'].items():
            assert file_hash(ROOT/f)==sha,(name,f)
            current_hashes[f]=sha
    expected={
        'outputs/simulation.js':'d70ec1574eed93f3183df60abeb28825919d41af67540409de2679d30ea019a2',
        'outputs/neural-learning.js':'1d4c03e4128a07e594c585f8abc400fda22ea10b7aaef645be8911fa3e036b8f',
        'outputs/rewards.js':'164c8cdf875672aef8da836f04b6efc9f4e445d96f4292f33d8839a776155e42',
        'outputs/progress-save.js':'a599bf93064dd930db761dfa29e8d894c782ef540cc7531722976d779f70b718',
        'outputs/vehicle-992.js':'2c8040b32dda557d34e629529a8581c3b914fbf0915122190b79725a75bc7896'}
    assert all(file_hash(ROOT/f)==sha for f,sha in expected.items())
    save=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
    assert file_hash(save)=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
    version=json.loads((ROOT/'package.json').read_text())['version'];assert version=='5.6.0'
    original=reports[late[0]]['baseline'];best=reports['statehead-reward-native-proof-20261025-02']['best']['result']
    studies=[]
    for name in late+global_studies:
        r=reports[name];global_case=name in global_studies
        row={'study':name,'updates':r['updatesCompleted'],'actualTrainingControls':r['trainingControls'],'wallSeconds':r['wallSeconds'],
             'best':r['bestResult'] if global_case else r['bestFull']['result'],'approvedForApp':False,'learningSucceeded':False}
        if global_case:
            row['completedEpisodes']=r['completedLocalEpisodes'];row['finalFullEvaluation']=next(e['evaluation'] for e in reversed(r['events']) if e.get('evaluation'))
            row['bestIsUnchangedZeroResidualParent']=True
        else:row['completedEpisodes']=8*r['updatesCompleted']
        studies.append(row)
    for name in ['neural-feedback-ar1-restore-20261025-01','neural-feedback-multitask-restore-20261025-01','neural-feedback-context-restore-20261025-01']:
        assert reports[name]['bestIsInitialZeroResidualParent'] and reports[name]['best']['result']['laps']==1
    result={'format':'private-neural-learning-readout-decision-v1','checkedAt':datetime.datetime.now().astimezone().isoformat(),
            'technicalChecksPassed':True,'goalAchieved':False,'learningSucceeded':False,'approvedForApp':False,'appVersion':version,
            'actualTrainingUpdates':sum(s['updates'] for s in studies),'actualTrainingControls':sum(s['actualTrainingControls'] for s in studies),
            'completedTrainingEpisodes':sum(s['completedEpisodes'] for s in studies),'studies':studies,
            'verifiedCanonicalImprovement':{'before':original,'after':best,'distanceGainMeters':best['bestProgress']-original['bestProgress'],
              'modelFile':reports['statehead-reward-native-proof-20261025-02']['candidateFile'],
              'modelSha256':reports['statehead-reward-native-proof-20261025-02']['candidateSha256'],
              'twoLaps':False,'headingPerturbationsStillFail':True},
            'sourceHashEntriesVerified':len(current_hashes),'productionHashesUnchanged':expected,'originalSaveSha256':file_hash(save),
            'evidence':{name:{'path':str(base/name/'report.json'),'sha256':file_hash(base/name/'report.json')} for name in reports},
            'decision':'Retain the protected one-lap family. No global learned policy improves it. Preserve corrected reset phase/reward context and checked multi-objective gradient for further research; do not deploy these trained global weights.',
            'openRequirements':['Two full physical laps from the start','Useful improvement on physical perturbations and other models/circuits',
                                'Independent application integration/save compatibility and actual Windows runtime validation'],
            'boundary':'Technical reports, checkpoints, local rewards, and weight changes do not prove learned two-lap driving. V1 original PPO has no new independent checkpoint restore in this set. New corrected-world training was from zero residual over the verified parent, not cold-start learning of an entirely untrained fly brain. No app package, version, release, tag, or original save was replaced.'}
    atomic_json(out/'decision.json',result)
    print(json.dumps({k:result[k] for k in ['technicalChecksPassed','goalAchieved','actualTrainingUpdates','actualTrainingControls','completedTrainingEpisodes','sourceHashEntriesVerified','decision']}),flush=True)


if __name__=='__main__':main()
