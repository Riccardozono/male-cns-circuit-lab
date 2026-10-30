"""Verify completed training, actor isolation, numeric model and native evidence."""
import io
import json
import hashlib
import zipfile
import torch
from neuronal_experiment_io import ROOT,NODE,file_hash,atomic_json
from train_neural_command_readout import KEYS,eligible


def checkpoint(file):
    # Only exact local artifacts produced by this private experiment. No
    # arbitrary third-party executable pickle or checkpoint is accepted.
    with zipfile.ZipFile(file) as archive:return torch.load(io.BytesIO(archive.read('policy.pth')),map_location='cpu',weights_only=True)


def main():
    base=ROOT/'.impeccable/review/neural-sacl';out=base/'neuronal-command-3809-asymmetric-td3';file=out/'report.json';r=json.loads(file.read_text(encoding='utf-8'));identity=r['identity']
    if not r['passed'] or r['phase']!='finished':raise RuntimeError('Only completed experiments can be verified')
    for f,expected in identity['sourceHashes'].items():
        if file_hash(ROOT/f)!=expected:raise RuntimeError('Frozen experiment source differs: '+f)
    if file_hash(NODE)!=identity['nodeExecutableSha256'] or file_hash(base/'neuronal-command-3809-asymmetric-data/report.json')!=identity['dataReportSha256']:raise RuntimeError('Runtime or dataset differs')
    if any(not identity['gpu'][k].startswith('cuda') for k in ['actorDevice','criticDevice']):raise RuntimeError('Actual CUDA actor/critic evidence required')
    if identity['environment']['actorObservationLength']!=521 or identity['environment']['criticObservationLength']!=557:raise RuntimeError('Explicit asymmetric input boundary required')
    source=json.loads((base/'neuronal-command-3803-cma-bias/report.json').read_text(encoding='utf-8'))
    if file_hash(base/'neuronal-command-3803-cma-bias/report.json')!=identity['sourceReportSha256'] or any(r['initialFull']['result'][k]!=source['fullChampion']['result'][k] for k in KEYS) or r['initialFull']['actionTraceSha256']!=source['fullChampion']['actionTraceSha256']:raise RuntimeError('Original complete actual trajectory differs')
    if len({file_hash(f) for f in [out/'initial-actor.json',out/'after-critic-prefit-actor.json',base/'neuronal-command-3803-cma-bias/best-actor.json']})!=1:raise RuntimeError('Critic preparation must preserve numeric actor exactly')
    prefit=r['criticPrefit']
    if not prefit['actorExactlyUnchanged'] or prefit['updates']!=2000 or prefit['actualReplayPrefillTransitions']!=9346 or prefit['final']['heldOutEpisodeMSESum']>=prefit['initial']['heldOutEpisodeMSESum']:raise RuntimeError('Actual-return critic preparation evidence differs')
    for row in r['evaluations']:
        if file_hash(out/f"actor-{row['steps']:07d}.json")!=row['actorSha256'] or row['actorGradientUpdates']!=row['criticGradientUpdates']//2:raise RuntimeError('Evaluation actor/count provenance differs')
    initial=checkpoint(out/'initial-own-model.zip');final=checkpoint(out/'final-own-model.zip')
    changed_actor=changed_critic=0
    for key,value in initial.items():
        if key not in final or value.shape!=final[key].shape:raise RuntimeError('Same learned network shapes required')
        changes=int(torch.count_nonzero(value!=final[key]));changed_actor+=changes if key.startswith('actor.') else 0;changed_critic+=changes if key.startswith('critic.') else 0
    if not changed_actor or not changed_critic or r['criticGradientUpdates']!=r['actualSteps'] or r['actorGradientUpdates']!=r['criticGradientUpdates']//2:raise RuntimeError('Actual changed actor/critic coefficients and updates required')
    model_file=r['exportedModelFile'];envelope=json.loads(open(model_file,encoding='utf-8').read());payload=json.loads(envelope['payloadJson']);actor=json.loads((out/'best-actor.json').read_text(encoding='utf-8'))
    if envelope['format']!='male-cns-private-neuronal-command-envelope' or hashlib.sha256(envelope['payloadJson'].encode('utf-8')).hexdigest()!=envelope['sha256'] or payload['actor']!=actor or actor['dimensions']!=[521,64,64,2] or len(actor['layers'][0]['weights'][0])!=521:raise RuntimeError('Strict neuronal-only numeric export integrity differs')
    full=r['best'];repeat=r['independentBestRepeat']
    if any(not e['complete'] or e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,repeat]) or full['actionTraceSha256']!=repeat['actionTraceSha256'] or any(full['result'][k]!=repeat['result'][k] for k in KEYS):raise RuntimeError('Complete independent from-line proofs differ')
    native=r['nativeVerifications']
    if len(native)!=2 or any(not e['passed'] or e['overlap'] or e['modelSha256']!=file_hash(model_file) or e['actionTraceSha256']!=full['actionTraceSha256'] or any(e['result'][k]!=full['result'][k] for k in KEYS) for e in native):raise RuntimeError('Two fresh standalone native export proofs required')
    if r['improved']!=eligible(full,r['initialFull']):raise RuntimeError('Physical improvement claim differs')
    result={'passed':True,'reportSha256':file_hash(file),'modelSha256':file_hash(model_file),'actualNewTrainingTransitions':r['actualSteps'],'actualReplayPrefillTransitions':prefit['actualReplayPrefillTransitions'],'criticPrefitUpdates':2000,'criticGradientUpdates':r['criticGradientUpdates'],'actorGradientUpdates':r['actorGradientUpdates'],'changedActorCoefficients':changed_actor,'changedCriticCoefficients':changed_critic,'best':full['result'],'final':r['final']['result'],'improved':r['improved'],
            'checks':['all immutable experiment runtime and dataset hashes','actual CUDA actor and critic','exact learned source actor and whole initial native trajectory','unchanged actor during critic preparation','actual changed actor and critic coefficients and update accounting','all candidate numeric actor hashes','exported actor has exactly521neuronal inputs and no critic signals','two complete and two fresh standalone numeric native proofs','physical improvement independently reconciled'],
            'boundary':'Updates and value loss are not physical driving improvement. Complete warm-start V3/Monza only; no all-track/model/cold-start convergence or app installation claim.'}
    atomic_json(out/'verification.json',result);print('ASYMMETRIC_TD3_VERIFIED '+json.dumps(result))


if __name__=='__main__':main()
