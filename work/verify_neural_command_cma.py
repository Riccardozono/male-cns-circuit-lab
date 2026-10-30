"""Read-only evidence reconciliation for completed fitness-only experiments."""
import argparse
import copy
import hashlib
import json
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
import numpy as np
from neuronal_experiment_io import ROOT,NODE,file_hash,atomic_json
from neural_readout_coordinates import materialize


KEYS=['bestProgress','fitness','laps','reason','totalSimulationSeconds']
def core(episode):return {k:episode['result'][k] for k in KEYS}
def sha(text):return hashlib.sha256(text.encode('utf-8')).hexdigest()
def wire_hash(value):return sha(json.dumps(value,ensure_ascii=False,indent=2).replace('\n',os.linesep))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('tag',nargs='?',default='neuronal-command-3803-cma-bias');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Private completed experiment tag required')
    base=ROOT/'.impeccable/review/neural-sacl';out=base/args.tag
    report=json.loads((out/'report.json').read_text(encoding='utf-8'));identity=report['identity'];n=identity['plasticParameters']
    if not report['passed'] or report['phase']!='finished' or n not in [2,18]:raise RuntimeError('Completed actual search required')
    for name,digest in identity['sourceHashes'].items():
        if file_hash(ROOT/name)!=digest:raise RuntimeError('Immutable source mismatch: '+name)
    if file_hash(NODE)!=identity['nodeExecutableSha256']:raise RuntimeError('Numeric runtime mismatch')
    source_dir=base/('neuronal-command-3803-sac' if n==2 else 'neuronal-command-3803-cma-bias')
    source=json.loads((source_dir/'report.json').read_text(encoding='utf-8'));original=json.loads((source_dir/'best-actor.json').read_text(encoding='utf-8'))
    if file_hash(source_dir/'report.json')!=identity['sourceReportSha256']:raise RuntimeError('Frozen source report mismatch')
    if file_hash(out/'initial-actor.json')!=file_hash(source_dir/'best-actor.json'):raise RuntimeError('Initial numeric policy differs')
    if identity['environment']!=source['identity']['environment']:raise RuntimeError('Source physical/neural environment differs')
    prepared=None
    if n==18:
        file=base/'neuronal-command-readout-prepared/prepared.json';prepared=json.loads(file.read_text(encoding='utf-8'))
        if file_hash(file)!=identity['representationSha256']:raise RuntimeError('Representation changed')
    def actor(genes):
        if n==18:return materialize(original,prepared,genes)
        value=copy.deepcopy(original);value['layers'][2]['bias']=[float(np.float32(original['layers'][2]['bias'][k]+genes[k])) for k in range(2)];return value
    records=report['records'];iterations=report['iterations'];recorded=report.get('committedCandidateEvaluations',report.get('actualCandidateEvaluations'))
    if len(records)!=recorded or len(records)!=16*len(iterations):raise RuntimeError('Whole committed16candidate populations required')
    previous_genes=[0]*n;previous_episode=report['initialFull'];candidate_hashes=0
    for i,row in enumerate(iterations):
        batch=records[i*16:(i+1)*16]
        if row['iteration']!=i+1 or row['evaluations']!=16*(i+1):raise RuntimeError('Committed iteration order differs')
        for record in batch:
            e=record['episode']
            if not e['complete'] or e['censored'] or e['gasBrakeOverlapSteps'] or e['validationMode']!='practice':raise RuntimeError('Actual complete practice episode required')
            if wire_hash(actor(record['genes']))!=record['actorSha256']:raise RuntimeError('Reconstructed actor hash mismatch')
            candidate_hashes+=1
        if row['optimizer']['bestFitness']!=max(r['episode']['result']['fitness'] for r in batch):raise RuntimeError('Optimizer received a score inconsistent with the actual batch')
        if n==18 and (batch[0]['genes']!=previous_genes or core(batch[0]['episode'])!=core(previous_episode)):raise RuntimeError('Protected elite was not physically reevaluated exactly')
        previous_genes=row['genes'];previous_episode={'result':row['pendingPracticeBest']}
    full,repeat=report['fullChampion'],report['independentFullRepeat']
    if any(not e['complete'] or e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,repeat]) or core(full)!=core(repeat) or full['actionTraceSha256']!=repeat['actionTraceSha256']:raise RuntimeError('Independent full driving proofs differ')
    if any(s in full['result']['reason'] for s in ['urto','fuori pista','progresso non valido']):raise RuntimeError('Unsafe selected policy')
    expected=actor(report['bestGenes']);selected=json.loads((out/'best-actor.json').read_text(encoding='utf-8'))
    if expected!=selected:raise RuntimeError('Selected numeric policy differs from searched coordinates')
    envelope=json.loads(open(report['exportedModelFile'],encoding='utf-8').read());payload=json.loads(envelope['payloadJson'])
    if envelope['format']!='male-cns-private-neuronal-command-envelope' or sha(envelope['payloadJson'])!=envelope['sha256'] or payload['decoderRevision']!='neuronal-command-residual-v1' or payload['actor']!=selected:raise RuntimeError('Distinct numeric model integrity mismatch')
    native=report['nativeVerifications'];model_hash=file_hash(report['exportedModelFile'])
    if len(native)!=2 or any(not e['passed'] or e['overlap'] or e['modelSha256']!=model_hash or e['actionTraceSha256']!=full['actionTraceSha256'] or {k:e['result'][k] for k in KEYS}!=core(full) for e in native):raise RuntimeError('Fresh native model proofs differ')
    initial=report['initialFull']['result'];best=full['result']
    improved=best['fitness']>initial['fitness']+1e-6 and best['bestProgress']>=initial['bestProgress'] and best['laps']>=initial['laps']
    if improved!=report['improved']:raise RuntimeError('Improvement claim mismatch')
    verification={'passed':True,'sourceReportSha256':file_hash(out/'report.json'),'modelSha256':model_hash,'plasticParameters':n,'reconstructedExactActorHashes':candidate_hashes,'committedCandidateEvaluations':len(records),
                  'improved':improved,'initial':initial,'best':best,'progressDelta':best['bestProgress']-initial['bestProgress'],'fitnessDelta':best['fitness']-initial['fitness'],'actualLaps':best['laps'],
                  'recovery':identity.get('recovery'),'boundary':'Actual actor bytes, every committed complete candidate, exact reevaluated elite when used, and two full plus two fresh native proofs checked. Cached candidate count is not app generations. Recovery counts exclude uncommitted scores and are not an exclusive total of all physical attempts. Warm-start V3/Monza only; no all-model/track or convergence claim.'}
    atomic_json(out/'verification.json',verification);print('NEURAL_CMA_VERIFIED '+json.dumps(verification),flush=True)


if __name__=='__main__':main()
