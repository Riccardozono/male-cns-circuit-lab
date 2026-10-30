import importlib.util
import unittest
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('descending_fit', Path(__file__).with_name('fit-descending-readout-comparison.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DescendingComparisonTests(unittest.TestCase):
    def test_both_spaces_have_identical_requests_and_bounded_prefix(self):
        features = np.random.default_rng(7717).uniform(-.5, .5, (32, 4))
        data = {'nodes': [10, 20, 30, 40], 'oldNodes': [10, 30], 'parentSha256': 'test',
                'baseline': {'progressM': 31}, 'observations': [
                    {'progressM': i, 'features': row.tolist()} for i, row in enumerate(features)]}
        result = module.generate(data)
        self.assertEqual(len(result['variants']), 48)
        a = [v for v in result['variants'] if v['name'] == 'current64']
        b = [v for v in result['variants'] if v['name'] == 'allDescending']
        self.assertEqual([(v['fraction'], v['request']) for v in a], [(v['fraction'], v['request']) for v in b])
        for v in result['variants']:
            self.assertLessEqual(max(abs(w) for w in v['spec']['weights']), 8)
            self.assertLessEqual(v['actualPrefixLogitMax'], .001 + 1e-12)
            self.assertEqual(len(v['spec']['weights']), 2*(len(v['spec']['nodes'])+1))


if __name__ == '__main__':
    unittest.main()
