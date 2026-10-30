"""Actual exploration-command distribution, not ideal driving actions or a pilot."""
import argparse
import json
import math
import numpy as np
from neuronal_experiment_io import ROOT,file_hash,atomic_json


def main():
    parser=argparse.ArgumentParser();parser.add_argument('tag',nargs='?',default='neuronal-chain-5615-search');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Actual native branch tag required')
    base=ROOT/'.impeccable/review/neural-sacl';report_file=base/args.tag/'native-branch-report.json';r=json.loads(report_file.read_text(encoding='utf-8'));proof=r['proofs'][0]
    if not r['passed'] or not proof['passed'] or proof['censored'] or proof['overlap'] or file_hash(proof['trajectoryFile'])!=r['trajectorySha256']:raise RuntimeError('Actual fully verified branch data required')
    data=np.memmap(proof['trajectoryFile'],dtype='<f8',mode='r',shape=(proof['actualActorControls'],530));tail=data[-72:];longitudinal=tail[:,524]-tail[:,525]
    required=np.arctanh(np.abs(longitudinal)/2)
    result={'passed':True,'sourceReportSha256':file_hash(report_file),'trajectorySha256':r['trajectorySha256'],'actualLateControls':len(tail),'sourceResult':proof['result'],'longitudinalCommand':{'min':float(longitudinal.min()),'median':float(np.median(longitudinal)),'max':float(longitudinal.max()),'brakingControls':int((longitudinal<0).sum()),'throttleControls':int((longitudinal>0).sum())},
            'optimisticFullContextCoefficientToReachNeutral':{'medianAbsolute':float(np.median(required)),'maxAbsolute':float(required.max()),'greaterThanTwoInitialStd015':int((required>.3).sum()),'meanOneSidedGaussianReachProbabilityStd015':float(np.mean([.5*math.erfc(x/(.15*math.sqrt(2))) for x in required])),'meanOneSidedGaussianReachProbabilityStd060':float(np.mean([.5*math.erfc(x/(.6*math.sqrt(2))) for x in required]))},'sourceSha256':file_hash(__file__),
            'boundary':'Actual recorded parent commands only. Neutral is a motor-range diagnostic, NOT an ideal action label, forced brake release or a claim about a physical brake defect. Full context is optimistic; partial activation has less authority. Gaussian probabilities describe initial mutation coverage, not learned driving, successful laps or the whole adaptive optimizer distribution.'}
    file=base/args.tag/'late-mutation-authority.json';atomic_json(file,result);print('LATE_MUTATION_AUTHORITY '+json.dumps(result))


if __name__=='__main__':main()
