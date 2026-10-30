"""Independent reconciliation of actual neuronal frontier search and promotion."""
import argparse
import hashlib
import json
from pathlib import Path
from neuronal_experiment_io import ROOT,NODE,file_hash,atomic_json
from train_neural_branch_repair import KEYS,clean_improves


def same(a,b):return all(a['result'][k]==b['result'][k] for k in KEYS)
def actual(e):return e['complete'] and not e['censored'] and not e.get('gasBrakeOverlapSteps',e.get('overlap',0))


def model(file):
    e=json.loads(Path(file).read_text(encoding='utf-8'))
    if e['format']!='male-cns-neuronal-frontier-chain-envelope' or hashlib.sha256(e['payloadJson'].encode('utf-8')).hexdigest()!=e['sha256']:raise RuntimeError('Distinct numeric chain checksum differs')
    d=json.loads(e['payloadJson'])
    for name,expected in d['sourceCompatibility'].items():
        p=(ROOT/name).resolve()
        if not p.is_relative_to(ROOT.resolve()) or file_hash(p)!=expected:raise RuntimeError('Listed native source/graph compatibility differs')
    return d


def main():
    parser=argparse.ArgumentParser();parser.add_argument('tag');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Private completed experiment tag required')
    base=ROOT/'.impeccable/review/neural-sacl';out=base/args.tag;report_file=out/'report.json';r=json.loads(report_file.read_text(encoding='utf-8'));identity=r['identity']
    if not r['passed'] or r['phase']!='finished' or not r['standaloneExportVerified'] or file_hash(NODE)!=identity['nodeExecutableSha256']:raise RuntimeError('Complete native-export-verified search required')
    for name,expected in identity['sourceHashes'].items():
        if file_hash(ROOT/name)!=expected:raise RuntimeError('Frozen search source differs: '+name)
    prepared=json.loads(Path(identity['preparedFile']).read_text(encoding='utf-8'))
    if file_hash(identity['preparedFile'])!=identity['preparationSha256']:raise RuntimeError('Preparation differs')
    initial=r['initialBranchFull'];practice=r['initialBranchPractice']
    if not actual(initial) or not actual(practice) or not same(initial,practice) or initial['actionTraceSha256']!=prepared['sourceFullTraceSha256'] or practice['actionTraceSha256']!=prepared['sourceCachedPracticeTraceSha256']:raise RuntimeError('Zero-correction full/suffix identities differ')
    records=r['records'];iterations=r['iterations']
    if len(records)!=r['actualCandidateEvaluations'] or len(records)!=16*len(iterations):raise RuntimeError('Complete actual16candidate batches required')
    old_genes=[0,0];old_episode=practice;best_clean=None;best_genes=None
    for i,row in enumerate(iterations):
        batch=records[i*16:(i+1)*16]
        if row['iteration']!=i+1 or row['evaluations']!=16*(i+1) or batch[0]['genes']!=old_genes or not same(batch[0]['episode'],old_episode) or batch[0]['episode']['actionTraceSha256']!=old_episode['actionTraceSha256']:raise RuntimeError('Actual protected elite reevaluation differs')
        if row['optimizer']['bestFitness']!=max(item['episode']['result']['fitness'] for item in batch):raise RuntimeError('Optimizer fitness is not the actual physical batch')
        for item in batch:
            if not actual(item['episode']) or item['episode']['validationMode']!='practice':raise RuntimeError('Fictitious/censored candidate cannot enter optimizer accounting')
            if clean_improves(item['episode'],best_clean['result'] if best_clean else r['protectedClean']):best_clean,best_genes=item['episode'],item['genes']
        old_genes=row['eliteGenes'];old_episode=next(item['episode'] for item in records[:16*(i+1)] if item['genes']==old_genes)
    if best_genes!=r['bestCleanGenes'] or bool(best_clean)!=r['improvedProtectedClean']:raise RuntimeError('Clean selection claim differs')
    native_report=json.loads(Path(r['nativeBranchReportFile']).read_text(encoding='utf-8'));exploration=model(native_report['modelFile'])
    if native_report['modelSha256']!=file_hash(native_report['modelFile']) or exploration['status']!='exploration-only' or exploration['stages'][-1]['genes']!=r['explorationGenes']:raise RuntimeError('Unsafe exploration must stay distinctly marked')
    for proofs in [r['explorationFullProofs'],r['nativeExplorationProofs']]:
        if len(proofs)!=2 or any(not actual(e) for e in proofs) or not same(proofs[0],proofs[1]) or proofs[0]['actionTraceSha256']!=proofs[1]['actionTraceSha256']:raise RuntimeError('Exact actual exploration proofs differ')
    if not same(r['explorationFullProofs'][0],r['nativeExplorationProofs'][0]) or r['explorationFullProofs'][0]['actionTraceSha256']!=r['nativeExplorationProofs'][0]['actionTraceSha256']:raise RuntimeError('Loaded exploration model differs from the full actual candidate')
    clean_hash=None
    if best_clean:
        data=model(r['cleanModelFile']);clean_hash=file_hash(r['cleanModelFile'])
        if data['status']!='clean-verified' or data['stages'][-1]['genes']!=best_genes:raise RuntimeError('Clean numeric model differs from selected coefficients')
        for proofs in [r['fullCleanProofs'],r['nativeCleanProofs']]:
            if len(proofs)!=2 or any(not actual(e) or not same(e,best_clean) for e in proofs) or proofs[0]['actionTraceSha256']!=proofs[1]['actionTraceSha256']:raise RuntimeError('Actual complete clean proofs differ')
        if r['nativeCleanProofs'][0]['actionTraceSha256']!=r['fullCleanProofs'][0]['actionTraceSha256'] or any(p['modelSha256']!=clean_hash or p['quality']!='clean-verified' for p in r['nativeCleanProofs']):raise RuntimeError('Clean independent loaded-model identity differs')
        result=best_clean['result']
        if len(result['lapTimes'])!=result['laps'] or any(not isinstance(t,(int,float)) or t<=0 for t in result['lapTimes']):raise RuntimeError('Actual lap accounting differs')
    verification={'passed':True,'reportSha256':file_hash(report_file),'cleanModelSha256':clean_hash,'actualCandidateEvaluations':len(records),'stageCount':identity['environment']['stageCount'],'newPlasticParameters':2,'improvedVsFixed3809Anchor':r['improvedProtectedClean'],'clean':best_clean['result'] if best_clean else None,'exploration':r['nativeExplorationProofs'][0]['result'],
                  'checks':['frozen source/runtime/preparation hashes','entire zero-correction full and real cached-suffix traces','every actual completed candidate and full16candidate batch','every protected elite freshly reevaluated','optimizer scores equal actual batch fitness','clean selection independent of farther crashes','two full and two fresh loaded-model exploration proofs','two full and two fresh clean-model proofs when selected','distinct exploration status normal loading rejection and listed-source compatibility','actual positive recorded lap times'],
                  'boundary':'Clean improvement in this report is relative to the fixed3809m anchor, not automatically the best across later searches. A global selector must preserve any stronger already verified clean model. Warm-start V3/Monza only, not app generations or all-model/circuit/cold-start convergence.'}
    atomic_json(out/'verification.json',verification);print('NEURAL_FRONTIER_CHAIN_VERIFIED '+json.dumps(verification),flush=True)


if __name__=='__main__':main()
