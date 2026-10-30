"""Reconstruct actual asked/scored CMA batches; not another physical drive."""
import argparse
import json
from neuronal_experiment_io_retry import ROOT, Pipe, atomic_json, file_hash
from train_neural_prior_kernel import BASE, REFERENCE, valid, score, global_better

def run(tag):
    out=BASE/tag
    report=json.loads((out/'report.json').read_text())
    identity=report['identity']
    assert report['passed'] and not report['promoted']
    for mapping in [identity['sourceHashes'],identity['sourceClosure']]:
        for f,digest in mapping.items():
            assert file_hash(ROOT/f)==digest,f
    assert file_hash(REFERENCE)==identity['globalReferenceSha256']
    assert file_hash(BASE/'learned-prior-gated-kernel-preflight/verification.json')==identity['preflightSha256']
    reference=json.loads(REFERENCE.read_text())['result']
    hashes={}
    count=controls=0
    best={'genes':[0.0]*16,'episode':json.loads((out/'preflight.json').read_text())['practices'][0]}
    optimizer=Pipe(ROOT/'work/neural-prior-gated-common-search.cjs',{'mean':[0.0]*16,'sigma':identity['sigma'],'population':16,'seed':identity['seed']})
    try:
        for generation in range(1,identity['generations']+1):
            asked_file=out/f'asked-{generation:03}.json'
            event_file=out/f'iteration-{generation:03}.json'
            asked,event=json.loads(asked_file.read_text()),json.loads(event_file.read_text())
            genes=optimizer.request('ask',elite=best['genes'])
            assert genes==asked['genes'] and genes[0]==asked['protectedElite']==event['protectedElite']
            assert len(event['evaluated'])==16
            scores=[]
            for j,row in enumerate(event['evaluated']):
                assert row['candidate']==j and row['environment']==j%4 and row['genes']==genes[j]
                e=row['episode']
                assert valid(e) and e['validationMode']=='restored-prior-checkpoint'
                assert e['episodeStart']['laps']==1 and e['episodeStart']['kind']=='actual-neuronal-prefix'
                assert e['actualNewControls']==e['result']['controls']-e['episodeStart']['controls']
                assert e['actualNewProgress']==e['result']['bestProgress']-e['episodeStart']['progress']
                assert e['actualNewLapGates']==e['result']['laps']-1
                scores.append(score(e,identity['objective']))
                count+=1
                controls+=e['actualNewControls']
                if scores[-1]>score(best['episode'],identity['objective'])+1e-9:
                    best=row
            assert scores==event['scores']
            optimizer.request('tell',fitness=scores)
            assert optimizer.request('state')==event['optimizerState']
            hashes[asked_file.name]=file_hash(asked_file)
            hashes[event_file.name]=file_hash(event_file)
        assert count==report['actualCandidateEpisodes']==identity['generations']*16
        assert controls==report['actualNewCandidateControls'] and best==report['bestPractice']
        for row in report['fullEvaluations']:
            assert row['episode']['validationMode']=='full-from-line' and row['episode']['episodeStart']['laps']==0
        candidate=report['bestGlobalCandidate']
        eligible=bool(candidate and len(report['fullProofs'])==2 and all(global_better(e,reference) and e['actionTraceSha256']==candidate['episode']['actionTraceSha256'] for e in report['fullProofs']))
        assert eligible==report['eligibleForIndependentNativeProof']
        proof={'passed':True,'reportSha256':file_hash(out/'report.json'),'verifierSha256':file_hash(__file__),'recordHashes':hashes,'actualRecordedCandidateEpisodes':count,'actualRecordedNewCandidateControls':controls,'reconstructedCmaUpdates':identity['generations'],'eligibleForIndependentNativeProof':eligible,'promoted':False,'boundary':'Exact optimizer ask/tell, state, actual episode record accounting and qualification checks. Not a physical rerun of all candidates. From-prefix historical first lap is excluded from new lap/control/progress counts. Full-policy improvement needs separate native driving proof.'}
        atomic_json(out/'verification.json',proof)
        print(json.dumps({k:v for k,v in proof.items() if k!='recordHashes'}),flush=True)
    finally:
        optimizer.close()

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('tag')
    run(p.parse_args().tag)
