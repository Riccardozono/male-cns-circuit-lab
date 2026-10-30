"""Current evidence, preservation checks and non-promotion of research policies."""
import datetime
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,atomic_json,file_hash


def main():
    base=ROOT/'.impeccable/review/learning-ml';out=base/'neural-consolidation-status-20261025-01';out.mkdir(exist_ok=False)
    trainings=['neural-feedback-kernel32-20261025-01','neural-retained-exploration8-20261025-01','neural-retained-exploration16-20261025-02',
               'neural-retained-balanced16-20261025-01','neural-retained-episodic8-20261025-01']
    populations=['neural-retained-population8-20261025-01','neural-motor-population8-20261025-01']
    proofs=['neural-feedback-kernel-preflight-20261025-01','neural-feedback-kernel-restore-20261025-01','neural-feedback-retention-proof-20261025-01',
            'neural-retained-exploration-restore-20261025-01','neural-retained-balanced-restore-20261025-01','neural-retained-episodic-restore-20261025-01',
            'neural-motor-population-restore-20261025-01','neural-retention-authority-audit-20261025-01','neural-retention-exploration-range-20261025-01',
            'neural-episodic-credit-preflight-20261025-01','neural-feedback-kernel-inference-20261025-01']
    reports={n:json.loads((base/n/'report.json').read_text()) for n in trainings+populations+proofs}
    assert all(v['passed'] for v in reports.values())
    identities={}
    for name,r in reports.items():
        for field in ['sourceHashes','worldSourceHashes','pythonSourceHashes']:
            for path,sha in r.get(field,{}).items():
                if path in identities:assert identities[path]==sha,(name,path)
                identities[path]=sha
    assert all(file_hash(ROOT/p)==h for p,h in identities.items())
    production={
      'outputs/simulation.js':'d70ec1574eed93f3183df60abeb28825919d41af67540409de2679d30ea019a2',
      'outputs/neural-learning.js':'1d4c03e4128a07e594c585f8abc400fda22ea10b7aaef645be8911fa3e036b8f',
      'outputs/rewards.js':'164c8cdf875672aef8da836f04b6efc9f4e445d96f4292f33d8839a776155e42',
      'outputs/progress-save.js':'a599bf93064dd930db761dfa29e8d894c782ef540cc7531722976d779f70b718',
      'outputs/vehicle-992.js':'2c8040b32dda557d34e629529a8581c3b914fbf0915122190b79725a75bc7896'}
    assert all(file_hash(ROOT/p)==h for p,h in production.items())
    original=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
    assert file_hash(original)=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
    assert json.loads((ROOT/'package.json').read_text())['version']=='5.6.0'
    rows=[]
    for n in trainings:
        r=reports[n];assert not r['learningSucceeded'] and not r['approvedForApp']
        rows.append({'study':n,'updates':r['updatesCompleted'],'trainingControls':r.get('actualTrainingControls',r.get('trainingControls')),
                     'completedEpisodes':r.get('completedEpisodes',r.get('completedLocalEpisodes')),
                     'lastReportedResult':r['events'][-1].get('suffix',r['events'][-1].get('evaluation')),'wallSeconds':r['wallSeconds']})
    for n in populations:
        r=reports[n];assert not r['learningSucceeded'] and not r['approvedForApp'] and r['bestSource']=='zero-residual-parent'
    retention=reports['neural-feedback-retention-proof-20261025-01']
    motor=reports['neural-motor-population-restore-20261025-01']
    assert retention['fullFirstLapBodyAndNeuronsExact'] and motor['currentFull']['firstLapBodyAndNeuronsExact'] and motor['brainSilence']['allZero']
    result={'format':'private-neural-consolidation-decision-v1','checkedAt':datetime.datetime.now().astimezone().isoformat(),
            'technicalChecksPassed':True,'goalAchieved':False,'learningSucceeded':False,'approvedForApp':False,'appVersion':'5.6.0',
            'gradientUpdatesCompleted':sum(r['updates'] for r in rows),'gradientTrainingControls':sum(r['trainingControls'] for r in rows),
            'completedGradientTrainingEpisodesOrLocalTruncations':sum(r['completedEpisodes'] for r in rows),'gradientStudies':rows,
            'populationGenerations':sum(reports[n]['generationsCompleted'] for n in populations),
            'logicalPopulationSlots':sum(reports[n]['logicalPopulationSlots'] for n in populations),
            'uniquePopulationNativeEpisodesIncludingFinalEvaluations':sum(reports[n]['uniqueNativeEpisodesIncludingConfirmationsAndFinal'] for n in populations),
            'populationPhysicalControlsIncludingFinalEvaluations':sum(reports[n]['actualPhysicalControlsIncludingConfirmationsAndFinal'] for n in populations),
            'canonicalFirstLapConservation':{'actualControls':retention['firstLapControls'],'bodyAndNeuronTraceSha256':retention['firstLapBodySequenceSha256'],
               'firstNewNeuralAuthority':retention['firstNovelNeuralAuthority'],'boundary':'This deliberately retains an ALREADY trained successful lap in a private curriculum. It is not new first-lap learning, first-lap speed improvement, or the final required adaptable controller.'},
            'unchangedSafeBaseline':reports[populations[-1]]['baseline'],
            'decoderActuatorProof':motor['actuatorCases'],'brainSilenceCommands':motor['brainSilence']['outputs'],
            'sourceHashEntriesVerified':len(identities),'productionHashesUnchanged':production,'originalSaveSha256':file_hash(original),
            'evidence':{n:{'path':str(base/n/'report.json'),'sha256':file_hash(base/n/'report.json')} for n in reports},
            'provenanceClarification':'Frozen reference-info wording without actions means without desired-action labels. The518vector DOES contain512actual descending-neuron history values,2decoder-memory values,2neural baseline motors,2OWN previous executed motor values. No route position/lap/time or future/teacher target command is present.',
            'decision':'Keep conservation/actuator/credit proofs as research evidence; reject all newly trained/search policies. Safe best is unchanged zero-residual parent6597.858728m/one lap. Do not deploy a fixed-first-lap curriculum as the finished learning system.',
            'openRequirements':['Actually learn better driving/two complete laps from the start','Preserve adaptability and improve lap times rather than permanently locking the old canonical lap',
                                'Robustness to perturbations, other profiles and circuits','Compatible explicit experimental format and verified Windows integration before deployment'],
            'boundary':'These totals use different scopes: gradient controls exclude validation; population controls include final evaluation. Local truncations are not full native episodes. Native first lap1 can be inherited for curriculum search, but every claimed full run was physically rerun. Experimental stall penalty overlay is logged separately from native rewards. No app version, release, tag or binary changed.'}
    atomic_json(out/'decision.json',result)
    print(json.dumps({k:result[k] for k in ['technicalChecksPassed','goalAchieved','gradientUpdatesCompleted','gradientTrainingControls','completedGradientTrainingEpisodesOrLocalTruncations',
         'populationGenerations','logicalPopulationSlots','uniquePopulationNativeEpisodesIncludingFinalEvaluations','populationPhysicalControlsIncludingFinalEvaluations','sourceHashEntriesVerified','decision']}),flush=True)


if __name__=='__main__':main()
