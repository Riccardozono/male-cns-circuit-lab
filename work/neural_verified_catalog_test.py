"""Selection checks use existing actual verified models/collision observations."""
import json
import unittest
from neuronal_experiment_io import ROOT, file_hash
from select_neural_verified_catalog import refresh, dominates, entry

class CatalogTest(unittest.TestCase):
    def test_real_cross_family_improvement_cannot_rewrite_or_downgrade_the_windows_model(self):
        base = ROOT/'.impeccable/review/neural-sacl'
        frozen = base/'neuronal-clean-champion.json'
        before = file_hash(frozen)
        catalog = refresh(emit=False)
        current, b = catalog['selectedResearch'], catalog['frozenWindowsCompatible']
        a = entry(base/'neuronal-statehead-6584-cma-search/report.json', 'state-head')
        self.assertTrue(dominates(a['result'], b['result']))
        self.assertFalse(dominates(b['result'], a['result']))
        self.assertEqual(a['modelSha256'], '5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35')
        self.assertTrue(current['modelSha256'] == a['modelSha256'] or dominates(current['result'], a['result']))
        self.assertEqual(b['modelSha256'], '4a752dfb82c2268721f0ae100e550bd174be81a04e96ca7259b3e29814043d80')
        self.assertEqual(file_hash(frozen), before)
        study = json.loads((base/'neuronal-statehead-6584-cma-search/report.json').read_text(encoding='utf-8'))
        farther = study['farthestCachedExploration']['episode']['result']
        self.assertGreater(farther['bestProgress'], a['result']['bestProgress'])
        self.assertEqual(farther['reason'], 'urto')
        self.assertFalse(dominates(farther, a['result']))

if __name__ == '__main__':
    unittest.main()
