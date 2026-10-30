"""Actual deterministic policy-space exploration; no externally provided actions."""
import argparse
import json
import queue
import subprocess
import time
from neuronal_experiment_io_retry import ROOT, NODE, Pipe, atomic_json, file_hash
from neural_ppo_parallel import Environments

BASE = ROOT/'.impeccable/review/neural-sacl'
PREFLIGHT = BASE/'learned-prior-greedy-kernel-preflight/verification.json'
REFERENCE = BASE/'neuronal-coordinate-feedback8-first/independent-native.json'

def valid(e):
    return e['complete'] and not e['censored'] and not e['overlap']

def clean(e):
    return valid(e) and e['result']['reason'] not in ['urto', 'fuori pista', 'progresso non valido']

def global_better(e, reference):
    r = e['result']
    return (clean(e) and e['validationMode'] == 'full-from-line'
            and r['laps'] >= reference['laps'] and r['bestProgress'] >= reference['bestProgress']
            and r['fitness'] > reference['fitness']+1e-6)

def score(e, objective):
    assert valid(e)
    if objective == 'r8':
        return e['trainingFitness']
    assert objective == 'frontier'
    # A separate exploration objective. Crashes may seed further research,
    # but NEVER qualify for promotion. No inherited prefix distance counted.
    return e['actualNewProgress'] + 10000*e['actualNewLapGates']

def run(tag, generations, objective):
    assert tag.replace('-', '').isalnum() and 1 <= generations <= 64
    out = BASE/tag
    out.mkdir(exist_ok=False)
    preflight, reference = json.loads(PREFLIGHT.read_text()), json.loads(REFERENCE.read_text())
    assert preflight['passed'] and reference['passed']
    for proof in [preflight, reference]:
        for f, digest in proof['sourceHashes'].items():
            assert file_hash(ROOT/f) == digest
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-prior-greedy-kernel-env.cjs','work/neural-prior-greedy-kernel-search.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_neural_prior_greedy_kernel.py', 'work/neural_ppo_parallel.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format':'male-cns-neuronal-prior-greedy-kernel-search-v1','appVersion':'5.6.0','objective':objective,'dimensions':16,'population':16,'environments':4,'seed':181026,'sigma':.7,'generations':generations,'preflightSha256':file_hash(PREFLIGHT),'globalReferenceSha256':file_hash(REFERENCE),'sourceHashes':{f:file_hash(ROOT/f) for f in sources},'sourceClosure':closure,'boundary':'Frozen learned one-lap neuronal representation with16reward-trainable raw motor kernel coefficients;8centres fitted to actual neuronal inputs without labels. Full7721/242486V3reservoir and251descending features retained; no biological-neuron increase or full biological learning. Deterministic candidate policies, actual own-prefix practice. Restored historical lap NOT new training. Frontier objective if selected is exploration only and can retain crashes for research; promotion still requires clean complete full-line drive beating stronger6599.861744m reference in rawR5fitness, laps and distance. No app/save/release changes.'}
    identity['neuronalBasis']='normalized-Gaussian-mean-policy-domain-v2'
    identity['initialCoefficientCovarianceDiagonal']=[.16 if j%2==0 else 1 for j in range(16)]
    identity['rawSteeringCoefficientScale']=.5
    identity['rawLongitudinalCoefficientScale']=1
    identity['boundary']+=' Normalized Gaussian basis, not compact support: no vanishing final correction gate or guaranteed first-lap protection. Coefficient covariance keeps initial raw steering exploration comparable after scale change; full bounded steering and longitudinal authority retained.'
    atomic_json(out/'identity.json',identity)
    env = optimizer = None
    initial = [0.0]*16
    elite, best_practice, best_full = initial[:], None, None
    records, summaries, full_evaluations = [], [], []
    started=time.monotonic()
    def progress(phase, **extra):
        atomic_json(out/'state.json',{'phase':phase,'actualCandidateEpisodes':len(records),'wallSeconds':time.monotonic()-started,'pids':[e.process.pid for e in env.envs] if env else [],**extra})
    try:
        progress('actually-reaching-four-prior-checkpoints')
        env=Environments(ROOT/'work/neural-prior-greedy-kernel-env.cjs',{})
        atomic_json(out/'metadata.json',env.metadata)
        baseline=env.request('evaluate',weights=initial,mode='full')
        practices=env.all('evaluate',weights=initial,mode='practice')
        for e in [baseline,*practices]:
            assert valid(e) and e['actionTraceSha256']==preflight['baseline']['actionTraceSha256']
            assert e['result']==preflight['baseline']['result']
        best_practice={'genes':elite[:],'episode':practices[0]}
        atomic_json(out/'preflight.json',{'passed':True,'baseline':baseline,'practices':practices})
        optimizer=Pipe(ROOT/'work/neural-prior-greedy-kernel-search.cjs',{'mean':initial,'sigma':.7,'population':16,'seed':181026})
        for generation in range(1,generations+1):
            protected=elite[:]
            genes=optimizer.request('ask',elite=protected)
            assert len(genes)==16 and genes[0]==protected
            atomic_json(out/f'asked-{generation:03}.json',{'genes':genes,'protectedElite':protected})
            replies,evaluated=queue.Queue(),[None]*16
            def lane(k):
                try:
                    for index in range(k,16,4):
                        replies.put((index,env.envs[k].request('evaluate',weights=genes[index],mode='practice')))
                except BaseException as error:
                    replies.put((None,repr(error)))
                    raise
            futures=[env.pool.submit(lane,k) for k in range(4)]
            for completed in range(16):
                index,episode=replies.get(timeout=240)
                if index is None:
                    raise RuntimeError(episode)
                assert valid(episode)
                evaluated[index]={'candidate':index,'environment':index%4,'genes':genes[index],'episode':episode}
                progress('actual-deterministic-candidates',generation=generation,completedInBatch=completed+1)
            for f in futures:
                f.result()
            assert evaluated[0]['episode']['actionTraceSha256']==best_practice['episode']['actionTraceSha256']
            scores=[score(r['episode'],objective) for r in evaluated]
            for row in evaluated:
                if score(row['episode'],objective)>score(best_practice['episode'],objective)+1e-9:
                    best_practice,elite=row,row['genes'][:]
            optimizer.request('tell',fitness=scores)
            state=optimizer.request('state')
            assert state['optimizer']['generation']==generation
            event={'generation':generation,'protectedElite':protected,'evaluated':evaluated,'scores':scores,'optimizerState':state}
            records.extend(evaluated)
            if generation==1 or generation%4==0 or generation==generations:
                full=env.request('evaluate',weights=elite,mode='full')
                full_evaluations.append({'generation':generation,'genes':elite[:],'episode':full})
                event['fullMeanEvaluation']=full
                if global_better(full,best_full['episode']['result'] if best_full else reference['result']):
                    best_full={'genes':elite[:],'episode':full}
            atomic_json(out/f'iteration-{generation:03}.json',event)
            summary={'generation':generation,'actualCandidateEpisodes':len(records),'maxPracticeProgress':max(r['episode']['result']['bestProgress'] for r in evaluated),'bestPractice':best_practice['episode']['result'],'fullFromLine':event.get('fullMeanEvaluation',{}).get('result'),'globalCandidate':best_full is not None,'sigma':state['optimizer']['sigma']}
            summaries.append(summary)
            atomic_json(out/'training-progress.json',{'iterations':summaries,'bestPractice':best_practice,'bestGlobalCandidate':best_full})
            print(json.dumps(summary),flush=True)
        proofs=[]
        if best_full:
            progress('global-candidate-full-line-proofs')
            proofs=[env.request('evaluate',weights=best_full['genes'],mode='full') for _ in range(2)]
        eligible=bool(best_full and len(proofs)==2 and all(global_better(e,reference['result']) and e['actionTraceSha256']==best_full['episode']['actionTraceSha256'] for e in proofs))
        report={'passed':True,'identity':identity,'baseline':baseline,'actualCandidateEpisodes':len(records),'actualNewCandidateControls':sum(r['episode']['actualNewControls'] for r in records),'iterations':summaries,'bestPractice':best_practice,'fullEvaluations':full_evaluations,'bestGlobalCandidate':best_full,'fullProofs':proofs,'eligibleForIndependentNativeProof':eligible,'cudaByEnvironment':env.request('metadata_all'),'promoted':False,'wallSeconds':time.monotonic()-started}
        atomic_json(out/'report.json',report)
        progress('finished',eligibleForIndependentNativeProof=eligible)
        print(json.dumps({'finished':True,'episodes':len(records),'eligible':eligible,'bestPractice':best_practice['episode']['result']}),flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json',{'error':repr(error),'actualCandidateEpisodes':len(records)})
        raise
    finally:
        if optimizer:
            optimizer.close()
        if env:
            env.close()

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--tag',required=True)
    p.add_argument('--generations',type=int,default=16)
    p.add_argument('--objective',choices=['r8','frontier'],default='frontier')
    a=p.parse_args()
    run(a.tag,a.generations,a.objective)
