"""Package/independently replay the actual farther branch; never install a crash."""
import os
os.environ['OMP_NUM_THREADS']='1';os.environ['OPENBLAS_NUM_THREADS']='1'
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import subprocess
from neuronal_experiment_io import ROOT,NODE,file_hash,atomic_json


def node(config):
    result=subprocess.run([str(NODE),str(ROOT/'work/frontier-chain-io.cjs'),json.dumps(config)],cwd=ROOT,text=True,encoding='utf-8',capture_output=True,timeout=240,creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:raise RuntimeError(result.stderr+'\n'+result.stdout)
    return json.loads(result.stdout)


def main():
    base=ROOT/'.impeccable/review/neural-sacl';source_file=base/'neuronal-command-4013-local-repair/report.json';source=json.loads(source_file.read_text(encoding='utf-8'))
    if not source['passed'] or source['phase']!='finished':raise RuntimeError('Complete actual local refinement required')
    for file,expected in source['identity']['sourceHashes'].items():
        if file_hash(ROOT/file)!=expected:raise RuntimeError('Source experiment changed: '+file)
    out=base/'neuronal-command-4287-branch-native';out.mkdir(exist_ok=False);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'native-proof'})
    prep=json.loads((base/'neuronal-command-4013-repair-context/prepared.json').read_text(encoding='utf-8'));actor=json.loads((base/'neuronal-command-4013-branch-prepared/branch-actor.json').read_text(encoding='utf-8'));anchor=json.loads((base/'neuronal-command-3803-cma-bias/model.malecns-neuronal-command.json').read_text(encoding='utf-8'))
    data={'format':'male-cns-neuronal-frontier-chain-model','schema':1,'appVersion':'5.6.0','numericRuntime':'24.19.0','modelId':'v3','circuitId':'monza','status':'exploration-only','sourceCompatibility':node({'op':'compatibility'}),'anchorEnvelope':anchor,'branchActor':actor,'stages':[{'basis':prep['basis'],'genes':source['searchEliteGenes']}],'expectedResult':source['searchElite']['result'],'fullTraceSha256':None,
          'provenance':{'sourceRefinementReportSha256':file_hash(source_file),'actualCandidateEvaluations':source['actualCandidateEvaluations'],'branchActorSha256':file_hash(base/'neuronal-command-4013-branch-prepared/branch-actor.json'),'contextPreparationSha256':file_hash(base/'neuronal-command-4013-repair-context/prepared.json')},
          'boundary':'Exploration-only learned branch, not a clean champion. Later normal loading must reject this status. Neuronal context and learned coefficients only; no driving tape, route, progress/time inputs or external teacher.'}
    payload=json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False);file=out/'branch.malecns-frontier-chain.json';atomic_json(file,{'format':'male-cns-neuronal-frontier-chain-envelope','schema':1,'payloadJson':payload,'sha256':hashlib.sha256(payload.encode('utf-8')).hexdigest()})
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(node,{'op':'collect','file':str(file),'allowExploration':True,'trajectoryFile':str(out/'actual-full-trajectory.f64')}),pool.submit(node,{'op':'verify','file':str(file),'allowExploration':True})]
            proofs=[f.result() for f in futures]
        if any(not p['passed'] or not p['complete'] or p['censored'] or p['overlap'] for p in proofs) or proofs[0]['actionTraceSha256']!=proofs[1]['actionTraceSha256']:raise RuntimeError('The actual loaded branch must match in two fresh native processes')
        report={'passed':True,'phase':'finished','format':'male-cns-actual-neuronal-chain-native-branch-v1','sourceRefinementReportSha256':file_hash(source_file),'modelFile':str(file),'modelSha256':file_hash(file),'proofs':proofs,'trajectorySha256':file_hash(proofs[0]['trajectoryFile']),'nodeExecutableSha256':file_hash(NODE),'sourceHashes':{f:file_hash(ROOT/f) for f in ['work/export_neural_frontier_branch.py','work/frontier-chain-io.cjs','work/neural-frontier-chain.cjs']},'promoted':False,'boundary':'Two actual standalone numeric from-line proofs confirm the farther branch. It still crashes; not a clean3809m replacement, app install, standard save, release or convergence claim. The raw neuronal trace may supply another learning context, never a driving tape.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')});print('NEURAL_CHAIN_BRANCH_NATIVE '+json.dumps({k:report[k] for k in ['passed','modelSha256','proofs','promoted']}),flush=True)
    except Exception as error:atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error)});raise


if __name__=='__main__':main()
