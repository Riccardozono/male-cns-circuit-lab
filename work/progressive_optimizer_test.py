"""Synthetic optimizer unit fixture, never a driving or reward demonstration."""
import unittest
from neuronal_experiment_io import ROOT, Pipe
from train_progressive_context import state_stopped

class Resumption(unittest.TestCase):
    def test_archive_and_rng_resume_exactly(self):
        configuration = {'dimensions': 12, 'binMetres': 25, 'maxProgress': 11586, 'population': 16}
        seed = {'weights': [0.] * 12, 'fitness': -100., 'progress': 100., 'laps': 0,
                'reason': 'unit-test-fixture', 'censored': False, 'overlap': 0}
        a = Pipe(ROOT / 'work/neural-progressive-optimizer.cjs', {'configuration': configuration, 'seed': 151216, 'seeds': [seed]})
        b = None
        try:
            a.request('ask')
            recorded = a.request('state')
            b = Pipe(ROOT / 'work/neural-progressive-optimizer.cjs', {'restored': recorded})
            self.assertEqual(recorded, b.request('state'))
            self.assertEqual(a.request('ask'), b.request('ask'))
            self.assertEqual(a.request('state'), b.request('state'))
        finally:
            a.close()
            if b:
                b.close()
        for process in [a, b]:
            self.assertIsNotNone(process.process.poll())
            self.assertTrue(all(stream.closed for stream in [process.process.stdin, process.process.stdout, process.process.stderr]))

    def test_a_stopped_checkpoint_does_not_invent_extra_search_iterations(self):
        self.assertTrue(state_stopped({'laps': 0}, 6, 3))
        self.assertFalse(state_stopped({'laps': 0}, 5, 3))
        self.assertTrue(state_stopped({'laps': 2}, 1, 1))

if __name__ == '__main__':
    unittest.main()
