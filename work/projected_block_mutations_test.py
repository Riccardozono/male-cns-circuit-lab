"""Synthetic unit fixtures only; never model demonstrations."""
import unittest
import numpy as np
from projected_block_mutations import propose

class Blocks(unittest.TestCase):
    def test_blocks_preserve_the_other_channel_and_protect_the_champion(self):
        champion = {'weights': [0.] * 18, 'progress': 100.}
        archive = {'champion': champion, 'cells': [champion]}
        rows = propose(archive, np.random.default_rng(151216))
        self.assertEqual(rows[0]['weights'], champion['weights'])
        self.assertEqual(len(rows), 16)
        for row in rows[1:]:
            self.assertTrue(all(np.isfinite(row['weights'])))
            self.assertTrue(all(abs(v) <= 8 for v in row['weights']))
            if row['block'] == 'longitudinal':
                self.assertEqual(row['weights'][0::2], row['parentWeights'][0::2])
            elif row['block'] == 'steering':
                self.assertEqual(row['weights'][1::2], row['parentWeights'][1::2])
        for i in range(1, 15, 2):
            self.assertTrue(np.array_equal(np.asarray(rows[i]['weights']), -np.asarray(rows[i + 1]['weights'])))
        self.assertEqual(champion['weights'], [0.] * 18)

    def test_numpy_state_reproduces_the_next_real_parameter_proposal_exactly(self):
        champion = {'weights': [.5] * 18, 'progress': 100.}
        archive = {'champion': champion, 'cells': [champion]}
        a, b = np.random.default_rng(1), np.random.default_rng(2)
        propose(archive, a)
        b.bit_generator.state = a.bit_generator.state
        self.assertEqual(propose(archive, a), propose(archive, b))

if __name__ == '__main__':
    unittest.main()
