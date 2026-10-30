"""Explicit checkpoint recovery after a terminal memory failure, with2workers.

Keeps the failed run immutable. Validates all224committed actor hashes before
continuing the same optimizer/RNG; interrupted uncommitted candidates rerun.
"""
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
import argparse
from concurrent.futures import ThreadPoolExecutor
import ctypes
from ctypes import wintypes
import hashlib
import json
import subprocess
import time
import traceback
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json
from neural_readout_coordinates import materialize
from train_neural_command_readout import eligible,node,KEYS


def alive(pid):
    p=subprocess.run(['powershell.exe','-NoProfile','-Command',f'if(Get-Process -Id {int(pid)} -ErrorAction SilentlyContinue){{exit 0}}else{{exit 1}}'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
    return p.returncode==0


def memory():
    class Counters(ctypes.Structure):
        _fields_=[('cb',wintypes.DWORD),('faults',wintypes.DWORD)]+[(k,ctypes.c_size_t) for k in ['peakWorkingSet','workingSet','quotaPeakPaged','quotaPaged','quotaPeakNonPaged','quotaNonPaged','pagefile','peakPagefile','private']]
    counters=Counters();counters.cb=ctypes.sizeof(counters)
    kernel=ctypes.windll.kernel32;kernel.GetCurrentProcess.restype=wintypes.HANDLE
    get=ctypes.windll.psapi.GetProcessMemoryInfo;get.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
    if not get(kernel.GetCurrentProcess(),ctypes.byref(counters),counters.cb):return {'available':False}
    return {'pythonWorkingSetBytes':counters.workingSet,'pythonPeakWorkingSetBytes':counters.peakWorkingSet,'pythonPrivateBytes':counters.private,'scope':'recovery Python process only, not system or child-process peak'}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='neuronal-command-3809-cma-readout-recovered');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('New private recovery tag required')
    base=ROOT/'.impeccable/review/neural-sacl';failed_dir=base/'neuronal-command-3809-cma-readout'
    failed_state=json.loads((failed_dir/'state.json').read_text(encoding='utf-8'))
    if failed_state['phase']!='failed' or 'MemoryError' not in failed_state.get('error','') or alive(failed_state['pid']):raise RuntimeError('Confirmed terminal memory failure and absent prior process required')
    checkpoint_file=failed_dir/'progress.json';checkpoint=json.loads(checkpoint_file.read_text(encoding='utf-8'));old_identity=checkpoint['identity']
    for name,digest in old_identity['sourceHashes'].items():
        if file_hash(ROOT/name)!=digest:raise RuntimeError('Frozen source changed: '+name)
    if file_hash(NODE)!=old_identity['nodeExecutableSha256']:raise RuntimeError('Pinned numeric runtime changed')
    original_dir=base/'neuronal-command-3803-cma-bias';source=json.loads((original_dir/'report.json').read_text(encoding='utf-8'))
    original=json.loads((original_dir/'best-actor.json').read_text(encoding='utf-8'))
    representation_file=base/'neuronal-command-readout-prepared/prepared.json';representation=json.loads(representation_file.read_text(encoding='utf-8'))
    if file_hash(representation_file)!=old_identity['representationSha256'] or file_hash(original_dir/'report.json')!=old_identity['sourceReportSha256']:raise RuntimeError('Frozen source representation/model changed')
    records=checkpoint['records'];iterations=checkpoint['iterations'];completed=len(iterations)
    if len(records)!=completed*16 or checkpoint['optimizerState']['optimizer']['generation']!=completed:raise RuntimeError('Only whole committed populations can resume')
    # Same numeric actors, even with the reduced process/thread profile.
    for record in records:
        actor=materialize(original,representation,record['genes'])
        # Match Path.write_text's platform newline conversion in the original
        # atomic writer: Windows files contain CRLF, not the in-memory LF text.
        serialized=json.dumps(actor,ensure_ascii=False,indent=2).replace('\n',os.linesep)
        digest=hashlib.sha256(serialized.encode('utf-8')).hexdigest()
        if digest!=record['actorSha256']:raise RuntimeError('Recovered numerical actor differs from committed evidence')
    out=base/args.tag;out.mkdir(exist_ok=False);started=time.monotonic();pipes=[];optimizer=None;phase='initializing';resources=[]
    recovery={'sourceCheckpointSha256':file_hash(checkpoint_file),'failedStateSha256':file_hash(failed_dir/'state.json'),'priorPidConfirmedAbsent':failed_state['pid'],
              'committedIterations':completed,'committedCandidates':len(records),'sourceReportedCandidatesAtFailure':failed_state['actualCandidateEvaluations'],
              'uncommittedReportedCandidatesNotImported':failed_state['actualCandidateEvaluations']-len(records),'workersBefore':4,'workersNow':2,'numpyThreads':1,
              'boundary':'No incomplete iteration scores imported. Retry starts from the last complete optimizer/RNG state; any uncommitted in-flight evaluations are repeated, so committed-record count is not an exclusive count of all physical attempts.'}
    identity={**old_identity,'pid':os.getpid(),'configuration':{**old_identity['configuration'],'tag':args.tag},'recovery':recovery,
              'backend':'two pinned Node24 physical processes, one NumPy thread; unchanged16candidate optimizer and numeric model',
              'sourceHashes':{**old_identity['sourceHashes'],**{f:file_hash(ROOT/f) for f in ['work/recover_neural_command_readout.py','work/neural-head-cma-resume.cjs']}}}
    def actor_file(genes,file):atomic_json(file,materialize(original,representation,genes))
    atomic_json(out/'identity.json',identity);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':phase,'recovery':recovery})
    try:
        config={'configuration':{'preparedFile':str(base/'projected-residual-3803-prepared/prepared.json')}}
        with ThreadPoolExecutor(max_workers=2) as pool:
            errors=[]
            for future in [pool.submit(Pipe,ROOT/'work/neural-command-env.cjs',config) for _ in range(2)]:
                try:pipes.append(future.result())
                except Exception as error:errors.append(error)
        if errors:raise errors[0]
        if any(p.metadata!=old_identity['environment'] for p in pipes):raise RuntimeError('Numeric environment differs')
        initial_actor=out/'initial-actor.json';actor_file([0]*18,initial_actor)
        requests=[pipes[0].send('evaluate',actorFile=str(initial_actor),mode='full'),pipes[1].send('evaluate',actorFile=str(initial_actor),mode='practice')]
        baseline,practice=[p.receive(r) for p,r in zip(pipes,requests)]
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [baseline,practice]) or any(baseline['result'][k]!=source['fullChampion']['result'][k] or practice['result'][k]!=baseline['result'][k] for k in KEYS) or baseline['actionTraceSha256']!=source['fullChampion']['actionTraceSha256']:raise RuntimeError('Fresh resumed baseline differs')
        best,best_genes=checkpoint['pendingBest'],checkpoint['bestGenes']
        optimizer=Pipe(ROOT/'work/neural-head-cma-resume.cjs',{'restored':checkpoint['optimizerState']})
        if optimizer.metadata['generation']!=completed:raise RuntimeError('Optimizer did not resume exactly')
        phase='search';atomic_json(out/'state.json',{'pid':os.getpid(),'phase':phase,'recovery':recovery})
        print('READOUT_RECOVERY_READY '+json.dumps({'recovery':recovery,'baseline':baseline['result'],'memory':memory()}),flush=True)
        for iteration in range(completed+1,old_identity['configuration']['iterations']+1):
            genes=optimizer.request('ask',elite=best_genes);fitness=[]
            for offset in range(0,16,2):
                phase=f'iteration-{iteration}-batch-{offset}'
                batch=genes[offset:offset+2];files=[out/f'actor-slot-{i}.json' for i in range(len(batch))]
                for x,file in zip(batch,files):actor_file(x,file)
                requests=[p.send('evaluate',actorFile=str(file),mode='practice') for p,file in zip(pipes,files)]
                for p,x,file,r in zip(pipes,batch,files,requests):
                    episode=p.receive(r)
                    if episode['censored'] or not episode['complete'] or episode['gasBrakeOverlapSteps']:raise RuntimeError('Actual uncensored complete fitness required')
                    fitness.append(episode['result']['fitness']);records.append({'iteration':iteration,'genes':x,'actorSha256':file_hash(file),'episode':episode})
                    if eligible(episode,best):best,best_genes=episode,x[:];actor_file(x,out/'pending-best-actor.json')
                resources.append({'phase':phase,**memory()})
            metrics=optimizer.request('tell',fitness=fitness)
            row={'iteration':iteration,'evaluations':len(records),'optimizer':metrics,'pendingPracticeBest':best['result'],'genes':best_genes,'resumedWallSeconds':time.monotonic()-started}
            iterations.append(row)
            atomic_json(out/'progress.json',{'identity':identity,'phase':'search','pendingBest':best,'bestGenes':best_genes,'iterations':iterations,'records':records,'optimizerState':optimizer.request('state'),'resources':resources})
            print('READOUT_RECOVERY_PROGRESS '+json.dumps(row),flush=True)
        phase='native-validation';atomic_json(out/'state.json',{'pid':os.getpid(),'phase':phase})
        best_actor=out/'best-actor.json';actor_file(best_genes,best_actor)
        requests=[p.send('evaluate',actorFile=str(best_actor),mode='full') for p in pipes]
        full,repeat=[p.receive(r) for p,r in zip(pipes,requests)]
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,repeat]) or any(full['result'][k]!=best['result'][k] or full['result'][k]!=repeat['result'][k] for k in KEYS) or full['actionTraceSha256']!=repeat['actionTraceSha256']:raise RuntimeError('Actual from-line recovery proof differs')
        numeric_file=out/'model.malecns-neuronal-command.json'
        node({'op':'export','preparedFile':str(base/'projected-residual-3803-prepared/prepared.json'),'actorFile':str(best_actor),'file':str(numeric_file),'episode':full,'provenance':{'identitySha256':file_hash(out/'identity.json'),'algorithm':identity['algorithm'],'plasticParameters':18,'committedCandidateEvaluations':len(records),'explicitRecovery':recovery}})
        with ThreadPoolExecutor(max_workers=2) as pool:native=list(pool.map(lambda _:node({'op':'verify','file':str(numeric_file)}),range(2)))
        report={'passed':True,'phase':'finished','identity':identity,'initialFull':baseline,'initialPractice':practice,'bestPractice':best,'bestGenes':best_genes,'fullChampion':full,'independentFullRepeat':repeat,
                'improved':eligible(full,baseline),'committedCandidateEvaluations':len(records),'newlyRecordedEpisodes':len(records)-recovery['committedCandidates'],'iterations':iterations,'records':records,'optimizerState':optimizer.request('state'),
                'resources':resources,'nativeVerifications':native,'exportedModelFile':str(numeric_file),'resumedWallSeconds':time.monotonic()-started,
                'boundary':'Explicit exact optimizer/RNG recovery from a terminal failed run,2workers and1NumPy thread. No uncommitted episode scores imported, no claim that256records are the exclusive physical-attempt total. Original failed evidence, active Windows apps, physics/rewards and release preserved. Warm-start V3/Monza only; actual laps remain separate.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')})
        print('READOUT_RECOVERY_DONE '+json.dumps({k:report[k] for k in ['passed','improved','committedCandidateEvaluations','newlyRecordedEpisodes','fullChampion','resumedWallSeconds']}),flush=True)
    except Exception as error:
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','lastStage':phase,'error':repr(error),'traceback':traceback.format_exc(),'recordedCandidates':len(records),'memory':memory()});raise
    finally:
        for p in pipes:p.close()
        if optimizer:optimizer.close()


if __name__=='__main__':main()
