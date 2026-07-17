import unittest

from app.hand_grouping import select_winning_hand_detections
from app.scoring import score_hong_kong_hand
from app.tile_mapping import normalize_tile_code


class TileMappingTests(unittest.TestCase):
    def test_normalizes_common_dataset_labels(self):
        self.assertEqual(normalize_tile_code("characters-1"), "1m")
        self.assertEqual(normalize_tile_code("dots-9"), "9p")
        self.assertEqual(normalize_tile_code("bamboo-5"), "5s")
        self.assertEqual(normalize_tile_code("一万"), "1m")
        self.assertEqual(normalize_tile_code("九筒"), "9p")
        self.assertEqual(normalize_tile_code("1z"), "east")
        self.assertEqual(normalize_tile_code("7z"), "red")
        self.assertEqual(normalize_tile_code("红中"), "red")


class HandGroupingTests(unittest.TestCase):
    def test_selects_lower_winning_hand_row(self):
        lower_row = [
            {"code": "1m", "confidence": 0.9, "box": [index * 0.055, 0.72 + (index % 2) * 0.004, 0.04, 0.08]}
            for index in range(14)
        ]
        outliers = [
            {"code": "9p", "confidence": 0.95, "box": [index * 0.06, 0.18, 0.04, 0.08]}
            for index in range(8)
        ]
        selected = select_winning_hand_detections(outliers + lower_row)
        self.assertEqual(len(selected), 14)
        self.assertTrue(all(item["code"] == "1m" for item in selected))


class HongKongScoringTests(unittest.TestCase):
    def pattern_names(self, codes, context=None):
        result = score_hong_kong_hand(codes, context or {})
        return {pattern["name"] for pattern in result["patterns"]}, result

    def test_scores_pure_one_suit(self):
        codes = ["1m", "2m", "3m", "2m", "3m", "4m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "9m"]
        names, result = self.pattern_names(codes)
        self.assertIn("清一色", names)
        self.assertGreaterEqual(result["faan"], 7)

    def test_scores_big_three_dragons(self):
        codes = ["red", "red", "red", "green", "green", "green", "white", "white", "white", "1m", "2m", "3m", "east", "east"]
        names, result = self.pattern_names(codes)
        self.assertIn("大三元", names)
        self.assertGreaterEqual(result["faan"], 8)

    def test_adds_self_draw_from_context(self):
        codes = ["1p", "2p", "3p", "2p", "3p", "4p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "9p"]
        names, _ = self.pattern_names(codes, {"winType": "自摸"})
        self.assertIn("自摸", names)


if __name__ == "__main__":
    unittest.main()