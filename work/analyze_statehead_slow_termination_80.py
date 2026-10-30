"""Measure recent real progress and pedal commands before slow-pace stops."""
import collections
import gzip
import json
from pathlib import Path

import numpy as np

from neuronal_experiment_io import ROOT, file_hash

BASE = ROOT / '.impeccable/review/learning-ml'
RUN = BASE / 'statehead-frontier-causalcritic-16ep-gae1-distance5-ppo-4up-20261026-79'
OUT = BASE / 'statehead-slow-termination-tail-analysis-20261026-80'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
EXPECTED_SAVE = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
SLOW = 'troppo lenta / senza progresso'


def summarize(rows):
    if not rows:
        return {'episodes': 0}
    last80 = np.asarray([x['progressLast80Controls'] for x in rows])
    last10 = np.asarray([x['progressLast10Controls'] for x in rows])
    return {'episodes': len(rows),
            'last80Median': float(np.median(last80)), 'last80Maximum': float(last80.max()),
            'last80Over1m': int((last80 > 1).sum()), 'last80Over5m': int((last80 > 5).sum()),
            'last10Median': float(np.median(last10)), 'last10Over01m': int((last10 > .1).sum()),
            'finalThrottleOver005': sum(x['finalCommands'][1] > .05 for x in rows),
            'finalBrakeOver005': sum(x['finalCommands'][2] > .05 for x in rows)}


def main():
    if OUT.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing output or original save identity prevents this analysis')
    report_file, verification_file = RUN / 'report.json', RUN / 'verification.json'
    report = json.loads(report_file.read_text(encoding='utf-8'))
    verification = json.loads(verification_file.read_text(encoding='utf-8'))
    if (not report['passed'] or report['learningSucceeded'] or not verification['passed']
            or verification['reportSha256'] != file_hash(report_file)):
        raise RuntimeError('Expected the independently verified non-promoted research run')
    findings, hashes, reason_counts = [], {}, collections.Counter()
    for event in report['events']:
        for summary in event['episodeSummaries']:
            archive = RUN / summary['privateArchiveFile']
            digest = file_hash(archive)
            if digest != summary['privateArchiveSha256']:
                raise RuntimeError('An episode archive hash differs from its manifest')
            hashes[archive.name] = digest
            reason = summary['result']['reason']
            reason_counts[reason] += 1
            if reason != SLOW:
                continue
            with gzip.open(archive, 'rt', encoding='utf-8') as stream:
                episode = json.load(stream)
            if (episode['result'] != summary['result'] or episode['traceSha256'] != summary['traceSha256']
                    or episode['progressShapingPerMeter'] != 5 or len(episode['rows']) != episode['controls']):
                raise RuntimeError('Slow episode does not match the recorded manifest')
            rows = episode['rows']
            recent = lambda n: sum(float(row['rewardProgressBonus']) / 5. for row in rows[-n:])
            if abs(recent(len(rows)) - episode['progressAfterReset']) > 1e-7:
                raise RuntimeError('Progress shaping ledger does not reconcile')
            tail = np.asarray([r['commands'] for r in rows[-30:]], dtype=float)
            findings.append({
                'seed': episode['seed'], 'sign': episode['sign'], 'traceSha256': episode['traceSha256'],
                'controls': len(rows), 'simulationSeconds': episode['result']['totalSimulationSeconds'],
                'bestProgress': episode['result']['bestProgress'],
                'progressLast80Controls': recent(80), 'progressLast10Controls': recent(10),
                'meanLast30Commands': tail.mean(axis=0).tolist(),
                'finalCommands': rows[-1]['commands'],
            })
    early = [x for x in findings if x['bestProgress'] < 50]
    later = [x for x in findings if x['bestProgress'] >= 50]
    if len(hashes) != 64 or len(findings) != reason_counts[SLOW]:
        raise RuntimeError('Expected all 64 verified episodes')
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during analysis')
    output = {
        'format': 'statehead-slow-termination-tail-analysis-v1', 'completed': True,
        'learningSucceeded': False, 'approvedForApp': False,
        'sourceReportSha256': file_hash(report_file), 'sourceVerificationSha256': file_hash(verification_file),
        'archiveCount': len(hashes), 'archiveSha256': hashes, 'reasonCounts': dict(reason_counts),
        'slowSummary': summarize(findings), 'earlyUnder50m': summarize(early),
        'laterAtLeast50m': summarize(later), 'slowEpisodes': findings,
        'sourceSha256': file_hash(Path(__file__)), 'originalSaveSha256': file_hash(SAVE),
        'boundary': 'Recorded high-water progress in the last 80 controls (approximately 8 simulated seconds) and actual commands. This is not direct speed or proof that continuing would recover, and is limited to one research policy on Monza.',
    }
    OUT.mkdir(parents=True, exist_ok=False)
    path = OUT / 'report.json'
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('SLOW_TERMINATION_ANALYSIS ' + json.dumps({'report': str(path), 'sha256': file_hash(path),
          'reasonCounts': dict(reason_counts), 'slowSummary': output['slowSummary'],
          'earlyUnder50m': output['earlyUnder50m'], 'laterAtLeast50m': output['laterAtLeast50m']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
