import unittest
from neuronal_memory_archive import Archive

def row(progress, score, reason='ferma / senza progresso'):
    return {'genes': [0]*6+[4]*3, 'episode': {'complete': True, 'censored': False, 'overlap': 0, 'result': {'bestProgress': progress, 'fitness': score, 'laps': 1, 'reason': reason}}}

class Tests(unittest.TestCase):
    def test_unsafe_parent_does_not_replace_champion(self):
        a = Archive(row(6599, 4061))
        bad = row(6624, 2209, 'urto')
        bad['genes'][0] = .1
        a.offer(bad)
        self.assertEqual(a.champion['episode']['result']['bestProgress'], 6599)
        asked = a.ask()
        self.assertEqual(asked[0]['genes'][0], 0)
        self.assertEqual(asked[1]['genes'][0], .1)
        self.assertTrue(any(r.get('parentProgress') == 6624 for r in asked))
        self.assertEqual(len(asked), 16)

    def test_exact_rng_replay_and_completed_evidence(self):
        a, b = Archive(row(6599, 4061)), Archive(row(6599, 4061))
        for _ in range(5):
            self.assertEqual(a.ask(), b.ask())
        self.assertEqual(a.snapshot(), b.snapshot())
        incomplete = row(7000, 9999)
        incomplete['episode']['censored'] = True
        with self.assertRaises(ValueError):
            a.offer(incomplete)
        a.offer(row(6600, 4062))
        self.assertEqual(a.champion['episode']['result']['bestProgress'], 6600)

if __name__ == '__main__':
    unittest.main()
