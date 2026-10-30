"""Record an already learned farther exploration branch, never promote its crash."""
import os
os.environ['OMP_NUM_THREADS']='1';os.environ['OPENBLAS_NUM_THREADS']='1'
import json
import time
import numpy as np
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json
from neural_readout_coordinates import materialize

KEYS=['bestProgress','fitness','laps','reason','totalSimulationSeconds']


def main():
    base=ROOT/'.impeccable/review/neural-sacl';source_file=base/'neuronal-command-3809-cma-readout-recovered/report.json';source=json.loads(source_file.read_text(encoding='utf-8'))
    verification=json.loads(source_file.with_name('verification.json').read_text(encoding='utf-8'))
    if not source['passed'] or source['phase']!='finished' or not verification['passed'] or verification['sourceReportSha256']!=file_hash(source_file):raise RuntimeError('Verified actual source required')
    index,record=max(enumerate(source['records']),key=lambda pair:(pair[1]['episode']['result']['laps'],pair[1]['episode']['result']['bestProgress']))
    if not record['episode']['complete'] or record['episode']['censored'] or record['episode']['gasBrakeOverlapSteps']:raise RuntimeError('Genuinely completed recorded branch required')
    original_file=base/'neuronal-command-3803-cma-bias/best-actor.json';original=json.loads(original_file.read_text(encoding='utf-8'))
    representation_file=base/'neuronal-command-readout-prepared/prepared.json';representation=json.loads(representation_file.read_text(encoding='utf-8'))
    out=base/'neuronal-command-4013-branch-prepared';out.mkdir(exist_ok=False);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'collecting','sourceRecord':index,'branchResult':record['episode']['result']})
    actor_file=out/'branch-actor.json';atomic_json(actor_file,materialize(original,representation,record['genes']))
    if file_hash(actor_file)!=record['actorSha256']:raise RuntimeError('Exact source exploration actor required')
    pipe=None;started=time.monotonic()
    try:
        prepared_file=base/'projected-residual-3803-prepared/prepared.json';pipe=Pipe(ROOT/'work/neural-branch-trajectory.cjs',{'configuration':{'preparedFile':str(prepared_file)}})
        if pipe.metadata!=source['identity']['environment']:raise RuntimeError('Only collection may change, not physical or neural engine')
        full=pipe.request('collect',actorFile=str(actor_file),file=str(out/'actual-full-trajectory.f64'))
        practice=pipe.request('evaluate',actorFile=str(actor_file),mode='practice')
        if any(not e['complete'] or e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,practice]) or any(full['result'][k]!=record['episode']['result'][k] or practice['result'][k]!=full['result'][k] for k in KEYS) or practice['actionTraceSha256']!=record['episode']['actionTraceSha256']:raise RuntimeError('Fresh full/practice branch must match actual recorded source, including the practice command trace')
        data=np.memmap(full['file'],mode='r',dtype='<f8',shape=(full['actualActorControls'],530))
        if data.nbytes!=os.path.getsize(full['file']) or not np.isfinite(data).all() or np.max(np.abs(data[:,:526]))>1 or np.any(data[:-1,529]) or data[-1,529]!=1:raise RuntimeError('Finite bounded correctly terminated actual neural trajectory required')
        report={'passed':True,'phase':'finished','format':'male-cns-actual-learned-neuronal-exploration-branch-v1','environment':pipe.metadata,'sourceReportSha256':file_hash(source_file),'sourceVerificationSha256':file_hash(source_file.with_name('verification.json')),'sourceRecord':index,'sourceGenes':record['genes'],'sourceActorSha256':record['actorSha256'],'actorFile':str(actor_file),'full':full,'practice':practice,'trajectorySha256':file_hash(full['file']),'nodeExecutableSha256':file_hash(NODE),
                'sourceHashes':{f:file_hash(ROOT/f) for f in ['work/prepare_neural_branch.py','work/neural-branch-trajectory.cjs','work/neural_readout_coordinates.py','work/neural-command-env.cjs','work/neural-command-state.cjs','work/neural-command-live.cjs','work/neural-command-residual.cjs','work/neural-projected-residual.cjs']},
                'binaryLayout':{'columns':530,'dtype':'little-endian-float64','actualPreNeuronalControllerObservation':[0,521],'actualNeuralAction':[521,523],'actualMotorCommands':[523,526],'diagnosticPostBestProgress':526,'diagnosticPostSimulationSeconds':527,'diagnosticPostFitness':528,'actualTermination':529},'wallSeconds':time.monotonic()-started,
                'boundary':'The branch was selected for exploration by actual farther progress, despite its crash and worse fitness. It is NOT the protected clean champion, a teacher, a route or installed model. Only raw neuronal columns may define an inference context. Diagnostic progress/time/fitness are training/validation metadata, never driving inputs. Full independent validation remains mandatory before promotion.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')});print('NEURAL_BRANCH_PREPARED '+json.dumps({k:report[k] for k in ['passed','sourceRecord','full','practice','wallSeconds']}),flush=True)
    except Exception as error:atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error)});raise
    finally:
        if pipe:pipe.close()


if __name__=='__main__':main()
