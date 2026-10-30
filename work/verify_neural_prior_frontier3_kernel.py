"""Independent numerical reconstruction of frontier3-gated CMA records."""
import argparse
import json
from neuronal_experiment_io_retry import ROOT, Pipe, atomic_json, file_hash

BASE = ROOT/'.impeccable/review/neural-sacl'
REFERENCE = BASE/'neuronal-coordinate-feedback8-first/independent-native.json'
PREFLIGHT = BASE/'frontier3-current-driver-preflight/verification.json'
MODEL = BASE/'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json'

def valid(e):
    return e['complete'] and not e['censored'] and not e['overlap']

def global_better(e, reference):
    r=e['result']
    return (valid(e) and r['reason'] not in ['urto','fuori pista','progresso non valido']
            and e['validationMode']=='full-from-line' and r['laps']>=reference['laps']
            and r['bestProgress']>=reference['bestProgress'] and r['fitness']>reference['fitness']+1e-6)

def run(tag):
    out=BASE/tag
    report=json.loads((out/'report.json').read_text())
    identity=report['identity']
    assert report['passed'] and not report['promoted'] and identity['objective']=='r8'
    for mapping in [identity['sourceHashes'],identity['sourceClosure']]:
        for f,digest in mapping.items():
            assert file_hash(ROOT/f)==digest,f
    assert file_hash(REFERENCE)==identity['globalReferenceSha256']
    assert file_hash(PREFLIGHT)==identity['preflightSha256']
    assert file_hash(MODEL)==identity['currentDriverModelSha256']
    reference=json.loads(REFERENCE.read_text())['result']
    hashes={};count=controls=0
    practices=json.loads((out/'preflight.json').read_text())['practices']
    assert len(practices)==4
    best={'genes':[0.0]*16,'episode':practices[0]}
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
                scores.append(e['trainingFitness']);count+=1;controls+=e['actualNewControls']
                if scores[-1]>best['episode']['trainingFitness']+1e-9:
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
        proof={'passed':True,'reportSha256':file_hash(out/'report.json'),'verifierSha256':file_hash(__file__),'recordHashes':hashes,'actualRecordedCandidateEpisodes':count,'actualRecordedNewCandidateControls':controls,'reconstructedCmaUpdates':identity['generations'],'eligibleForIndependentNativeProof':eligible,'promoted':False,'boundary':'Exact optimizer ask/tell, R8 score, state and actual episode accounting. Not a physical rerun of all candidates. Restored first-lap progress is excluded from new totals. Full-policy improvement still needs separate native driving proof.'}
        atomic_json(out/'verification.json',proof)
        print(json.dumps({k:v for k,v in proof.items() if k!='recordHashes'}),flush=True)
    finally:
        optimizer.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('tag');run(parser.parse_args().tag)
