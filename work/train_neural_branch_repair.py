"""Actual late-neuronal fitness refinement; exploration branch != clean champion."""
import os
os.environ['OMP_NUM_THREADS']='1';os.environ['OPENBLAS_NUM_THREADS']='1'
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import time
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json

KEYS=['bestProgress','fitness','laps','reason','totalSimulationSeconds']


def clean_improves(episode,best_result):
    a=episode['result']
    return (episode['complete'] and not episode['censored'] and not episode['gasBrakeOverlapSteps']
            and not any(s in a['reason'] for s in ['urto','fuori pista','progresso non valido'])
            and a['fitness']>best_result['fitness']+1e-6 and a['bestProgress']>=best_result['bestProgress'] and a['laps']>=best_result['laps'])


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='neuronal-command-4013-local-repair');parser.add_argument('--iterations',type=int,default=8);args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1<=args.iterations<=40:raise ValueError('Bounded isolated fitness refinement required')
    base=ROOT/'.impeccable/review/neural-sacl';prepared_file=base/'neuronal-command-4013-repair-context/prepared.json';prepared=json.loads(prepared_file.read_text(encoding='utf-8'))
    branch_file=base/'neuronal-command-4013-branch-prepared/report.json';branch=json.loads(branch_file.read_text(encoding='utf-8'))
    clean_file=base/'neuronal-command-3803-cma-bias/report.json';clean_source=json.loads(clean_file.read_text(encoding='utf-8'));protected_clean=clean_source['fullChampion']['result']
    if not branch['passed'] or branch['phase']!='finished' or not clean_source['passed'] or clean_source['phase']!='finished':raise RuntimeError('Completed actual branch and clean baseline required')
    out=base/args.tag;out.mkdir(exist_ok=False);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'initializing','configuration':vars(args)})
    pipes=[];optimizer=None;started=time.monotonic();records=[];iterations=[];best_clean=None;best_clean_genes=None
    try:
        errors=[]
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(Pipe,ROOT/'work/neural-branch-repair-env.cjs',{'configuration':{'preparedFile':str(prepared_file)}}) for _ in range(2)]
            for future in futures:
                try:pipes.append(future.result())
                except Exception as error:errors.append(error)
        if errors:raise errors[0]
        if pipes[0].metadata!=pipes[1].metadata or pipes[0].metadata['protectedControls']!=prepared['firstActivatedControl']:raise RuntimeError('Actual late context engines differ')
        requests=[pipes[0].send('evaluate',genes=[0,0],mode='full'),pipes[1].send('evaluate',genes=[0,0],mode='practice')]
        full,practice=[p.receive(r) for p,r in zip(pipes,requests)]
        if any(not e['complete'] or e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,practice]) or any(full['result'][k]!=prepared['sourceFullResult'][k] or practice['result'][k]!=full['result'][k] for k in KEYS) or full['actionTraceSha256']!=prepared['sourceFullTraceSha256'] or practice['actionTraceSha256']!=prepared['sourceCachedPracticeTraceSha256']:raise RuntimeError('Zero correction must repeat the full original exploration branch and the exact actual cached suffix')
        optimizer=Pipe(ROOT/'work/neural-head-cma-transport.cjs',{'mean':[0,0],'sigma':.15,'population':16,'seed':15102113})
        files=['work/train_neural_branch_repair.py','work/neural-branch-repair-env.cjs','work/prepare-neural-branch-context.cjs','work/neural-context-readout.cjs','work/neural-context-stack.cjs','work/neural-head-cma-transport.cjs','work/neural-cma.cjs','work/neuronal_experiment_io.py','work/neural-command-state.cjs','work/neural-command-residual.cjs','work/neural-projected-residual.cjs']
        identity={'pid':os.getpid(),'configuration':vars(args),'environment':pipes[0].metadata,'nodeExecutableSha256':file_hash(NODE),'preparedFile':str(prepared_file),'preparationSha256':file_hash(prepared_file),'branchReportSha256':file_hash(branch_file),'protectedCleanReportSha256':file_hash(clean_file),'sourceHashes':{f:file_hash(ROOT/f) for f in files},'plasticParameters':2,'population':16,'workers':2,'initialSigma':.15,'seed':15102113,
                  'boundary':'Fitness-only optimization of two late neuronal coefficients. Actual previously reached state and full neural memories cached, not invented states or a route. Frozen farther branch remains exploratory despite its crash. The protected clean3809m model is not replaced by a higher-distance crash or cached-only result. No GPU-gradient claim.'}
        atomic_json(out/'identity.json',identity);atomic_json(out/'preflight.json',{'passed':True,'full':full,'practice':practice,'protectedClean':protected_clean,'entireFullTraceExactlyMatchesSource':True,'entireActualSuffixExactlyMatchesSource':True})
        print('NEURAL_BRANCH_REPAIR_READY '+json.dumps({'branch':full['result'],'protectedClean':protected_clean,'protectedControls':prepared['firstActivatedControl'],'actualCachedSuffixControls':practice['actualActorControls']}),flush=True)
        elite,elite_genes=practice,[0,0]
        for iteration in range(1,args.iterations+1):
            genes=optimizer.request('ask',elite=elite_genes);scores=[]
            for offset in range(0,16,2):
                batch=genes[offset:offset+2];requests=[p.send('evaluate',genes=x,mode='practice') for p,x in zip(pipes,batch)]
                for p,x,request in zip(pipes,batch,requests):
                    episode=p.receive(request)
                    if not episode['complete'] or episode['censored'] or episode['gasBrakeOverlapSteps']:raise RuntimeError('Only complete actual physical fitness may be sent to the optimizer')
                    records.append({'iteration':iteration,'genes':x,'episode':episode});scores.append(episode['result']['fitness'])
                    if episode['result']['fitness']>elite['result']['fitness']+1e-6:elite,elite_genes=episode,x[:]
                    if clean_improves(episode,best_clean['result'] if best_clean else protected_clean):best_clean,best_clean_genes=episode,x[:]
            metrics=optimizer.request('tell',fitness=scores);row={'iteration':iteration,'evaluations':len(records),'optimizer':metrics,'searchElite':elite['result'],'eliteGenes':elite_genes,'pendingCleanImprovement':best_clean['result'] if best_clean else None,'pendingCleanGenes':best_clean_genes,'wallSeconds':time.monotonic()-started};iterations.append(row)
            atomic_json(out/'progress.json',{'pid':os.getpid(),'phase':'search','identity':identity,'records':records,'iterations':iterations,'optimizerState':optimizer.request('state')});print('NEURAL_BRANCH_REPAIR_PROGRESS '+json.dumps(row),flush=True)
            if best_clean and best_clean['result']['laps']==2:break
        full_proofs=[]
        if best_clean:
            requests=[p.send('evaluate',genes=best_clean_genes,mode='full') for p in pipes];full_proofs=[p.receive(r) for p,r in zip(pipes,requests)]
            if any(not clean_improves(e,protected_clean) or any(e['result'][k]!=best_clean['result'][k] for k in KEYS) for e in full_proofs) or full_proofs[0]['actionTraceSha256']!=full_proofs[1]['actionTraceSha256']:raise RuntimeError('Cached candidate must improve the protected clean baseline in two exact complete from-line episodes')
        report={'passed':True,'phase':'finished','identity':identity,'initialBranchFull':full,'initialBranchPractice':practice,'protectedClean':protected_clean,'actualCandidateEvaluations':len(records),'records':records,'iterations':iterations,'searchElite':elite,'searchEliteGenes':elite_genes,'bestCleanPractice':best_clean,'bestCleanGenes':best_clean_genes,'fullCleanProofs':full_proofs,'improvedProtectedClean':bool(full_proofs),'optimizerState':optimizer.request('state'),'wallSeconds':time.monotonic()-started,'standaloneExportVerified':False,
                'boundary':'Actual fitness-only local neural refinement, with exact zero-correction full/suffix preflight and only real complete candidate episodes. A candidate is a clean improvement only after two full from-line pinned Node24 repetitions. Standalone numeric packaging, independent loaded-model proof and Windows integration remain pending even if this stage improves. No standard save, app/release or all-model/circuit/cold-start change.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')});print('NEURAL_BRANCH_REPAIR_DONE '+json.dumps({k:report[k] for k in ['passed','actualCandidateEvaluations','improvedProtectedClean','bestCleanGenes','fullCleanProofs','wallSeconds','standaloneExportVerified']}),flush=True)
    except Exception as error:atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error),'actualCandidateEvaluations':len(records)});raise
    finally:
        for p in pipes:p.close()
        if optimizer:optimizer.close()


if __name__=='__main__':main()
