import unittest
from neuronal_coordinate_search import Search

class Tests(unittest.TestCase):
    def test_opposed_single_axis_and_bounded_credit(self):
        s = Search([0]*18)
        rows = s.ask([0, 1])
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[1]['genes'][0], -rows[2]['genes'][0])
        for row in rows[1:]:
            self.assertEqual(sum(x != 0 for x in row['genes']), 1)
        s.finish_cycle(True)
        self.assertEqual(s.radius, .03)
        s.finish_cycle(False)
        self.assertEqual(s.radius, .015)

    def test_failed_or_incomplete_episode_cannot_become_champion(self):
        reference = {'fitness': 4061, 'bestProgress': 6600, 'laps': 1}
        def row(reason, complete=True):
            return {'genes': [.1]*18, 'episode': {'complete': complete, 'censored': not complete, 'overlap': 0, 'result': {'fitness': 9999, 'bestProgress': 7000, 'laps': 1, 'reason': reason}}}
        s = Search([0]*18)
        self.assertIsNone(s.tell([row('urto'), row('', False)], reference))
        self.assertEqual(s.genes, [0]*18)

if __name__ == '__main__':
    unittest.main()
