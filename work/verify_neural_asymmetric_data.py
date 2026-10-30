"""Reconcile every complete actual binary episode against its original evaluation."""
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,NODE,file_hash,atomic_json
from neural_transition_dataset import load_episode,complete_returns
from neural_readout_coordinates import materialize


def main():
    base=ROOT/'.impeccable/review/neural-sacl';out=base/'neuronal-command-3809-asymmetric-data';report_file=out/'report.json';r=json.loads(report_file.read_text(encoding='utf-8'))
    if not r['passed'] or r['phase']!='finished':raise RuntimeError('Complete dataset required')
    source_file=base/'neuronal-command-3809-cma-readout-recovered/report.json';source=json.loads(source_file.read_text(encoding='utf-8'))
    if file_hash(source_file)!=r['identity']['sourceReportSha256'] or file_hash(source_file.with_name('verification.json'))!=r['identity']['sourceVerificationSha256'] or file_hash(NODE)!=r['identity']['nodeExecutableSha256']:raise RuntimeError('Source or runtime provenance differs')
    for file,expected in r['identity']['sourceHashes'].items():
        if file_hash(ROOT/file)!=expected:raise RuntimeError('Collected-source checksum differs: '+file)
    original_file=base/'neuronal-command-3803-cma-bias/best-actor.json';original=json.loads(original_file.read_text(encoding='utf-8'))
    representation_file=base/'neuronal-command-readout-prepared/prepared.json';representation=json.loads(representation_file.read_text(encoding='utf-8'))
    if file_hash(original_file)!=r['identity']['sourceActorSha256'] or file_hash(representation_file)!=r['identity']['representationSha256']:raise RuntimeError('Readout source differs')
    transitions=0
    for row in r['records']:
        prior=source['records'][row['sourceRecord']]
        for file in [row['actorFile'],row['rollout']['dataFile']]:
            if not Path(file).resolve().is_relative_to(out.resolve()):raise RuntimeError('Private bounded dataset path required')
        if row['genes']!=prior['genes'] or row['actorSha256']!=prior['actorSha256'] or file_hash(row['actorFile'])!=row['actorSha256'] or json.loads(Path(row['actorFile']).read_text(encoding='utf-8'))!=materialize(original,representation,row['genes']):raise RuntimeError('Recorded actual actor differs')
        if row['rollout']['actionTraceSha256']!=prior['episode']['actionTraceSha256'] or row['rollout']['result']!=prior['episode']['result']:raise RuntimeError('Actual physical replay differs from source')
        data=load_episode(row);returns=complete_returns(data)
        if [float(returns.min()),float(returns.max())]!=row['discountedReturnRange'] or float(returns[0])!=row['initialDiscountedReturn']:raise RuntimeError('Actual returns differ')
        transitions+=len(data)
    if len(r['records'])!=r['completeEpisodes'] or transitions!=r['actualTransitions']:raise RuntimeError('Real episode/transition accounting differs')
    result={'passed':True,'reportSha256':file_hash(report_file),'completeEpisodes':len(r['records']),'actualTransitions':transitions,'checks':['frozen source and runtime hashes','all controller coefficients reconstructed from recorded real genes','all whole command traces and physical episode results identical','all binary checksums lengths bounds continuity and true terminations','all actual reward sums and discounted returns','critic-only physical columns separated from521actor columns'],'boundary':'Dataset provenance, not completed laps, learned driving improvement or all-track validation.'}
    atomic_json(out/'verification.json',result);print(json.dumps(result))


if __name__=='__main__':main()
