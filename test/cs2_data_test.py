import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cs2_data', Path(__file__).resolve().parents[1] / 'server' / 'cs2_data.py')
cs2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs2)


class Cs2DataTests(unittest.TestCase):
    def setUp(self):
        cs2._CACHE.clear()

    def test_empty_provider_never_becomes_demo_games(self):
        with patch.object(cs2, '_load_supabase_matches', return_value=[]):
            result = cs2.get_cs2_scoreboard()
        self.assertEqual(result['games'], [])
        self.assertEqual(result['meta']['source'], 'empty')

    def test_provider_failure_is_explicit_and_not_cached_as_success(self):
        with patch.object(cs2, '_load_supabase_matches', side_effect=[None, []]) as load:
            result = cs2.get_cs2_scoreboard()
            self.assertIn('error', result)
            self.assertEqual(result['games'], [])
            self.assertNotIn('error', cs2.get_cs2_scoreboard())
            self.assertEqual(load.call_count, 2)

    def test_real_rows_are_retained_and_limits_have_separate_cache_keys(self):
        rows = [{'id': str(i), 'teamA': {'name': 'Team A'}, 'teamB': {'name': 'Team B'}} for i in range(3)]
        with patch.object(cs2, '_load_supabase_matches', return_value=rows):
            self.assertEqual(len(cs2.get_cs2_scoreboard(1)['games']), 1)
            result = cs2.get_cs2_scoreboard(3)
        self.assertEqual(len(result['games']), 3)
        self.assertEqual(result['meta']['source'], 'stored')


if __name__ == '__main__':
    unittest.main()
