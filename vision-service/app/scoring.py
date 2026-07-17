from __future__ import annotations

from collections import Counter
from typing import Any

from .tile_mapping import tile_label


TERMINALS_AND_HONORS = {
    "1m", "9m", "1p", "9p", "1s", "9s",
    "east", "south", "west", "north", "red", "green", "white",
}
DRAGONS = {"red", "green", "white"}
WINDS = {"east", "south", "west", "north"}
SEAT_MAP = {"東": "east", "南": "south", "西": "west", "北": "north"}


def score_hong_kong_hand(tile_codes: list[str], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    clean_codes = [code for code in tile_codes if code and not code.startswith("flower")]
    counts = Counter(clean_codes)
    patterns: list[dict[str, Any]] = []
    warnings: list[str] = []

    if len(clean_codes) < 14:
        warnings.append(f"只認到 {len(clean_codes)} 隻牌，未夠 14 隻；番數只可當初步估計。")
    elif len(clean_codes) > 18:
        warnings.append(f"認到 {len(clean_codes)} 隻牌，可能包含其他玩家/棄牌；已用相片中最似食糊手牌嗰行。")

    partition = find_standard_partition(counts.copy())
    is_seven_pairs = len(clean_codes) == 14 and sum(1 for count in counts.values() if count == 2) == 7
    is_thirteen_orphans = _is_thirteen_orphans(counts, len(clean_codes))

    if is_thirteen_orphans:
        _add_pattern(patterns, "十三么", 13, "十三隻么九字牌齊，再加其中一對。")
    elif _is_all_honors(clean_codes):
        _add_pattern(patterns, "字一色", 10, "全副牌都係風牌或三元牌。")
    else:
        if is_seven_pairs:
            _add_pattern(patterns, "七對子", 4, "14 隻牌組成 7 對。")
        if partition:
            _score_partition_patterns(patterns, partition, counts, context)
        else:
            warnings.append("未能穩定拆成 4 組牌加 1 對眼；請手動確認番型。")
        _score_color_patterns(patterns, clean_codes)

    if context.get("winType") in {"自摸", "包自摸"}:
        _add_pattern(patterns, "自摸", 1, "今鋪食糊方式係自摸。")

    faan = min(13, sum(int(pattern["faan"]) for pattern in patterns))
    if not patterns:
        warnings.append("未認到明確番型；請用手動番數作最後確認。")

    reasons = [f"{pattern['name']}：{pattern['reason']}" for pattern in patterns]
    return {
        "source": "yolo-vision",
        "confidence": _confidence(clean_codes, warnings),
        "faan": faan,
        "patterns": patterns,
        "reasons": reasons or ["暫時未能由相片穩定推斷番型。"],
        "warnings": warnings,
    }


def find_standard_partition(counts: Counter[str]) -> dict[str, Any] | None:
    for pair_code, count in list(counts.items()):
        if count < 2:
            continue
        counts[pair_code] -= 2
        sets = _extract_sets(counts)
        counts[pair_code] += 2
        if sets is not None:
            return {"pair": pair_code, "sets": sets}
    return None


def _extract_sets(counts: Counter[str]) -> list[dict[str, Any]] | None:
    remaining = sum(counts.values())
    if remaining == 0:
        return []
    code = next((item for item, count in sorted(counts.items(), key=_tile_sort_key) if count > 0), "")
    if not code:
        return []

    if counts[code] >= 3:
        counts[code] -= 3
        rest = _extract_sets(counts)
        counts[code] += 3
        if rest is not None:
            return [{"type": "triplet", "tiles": [code, code, code]}] + rest

    sequence = _sequence_from(code)
    if sequence and all(counts[item] > 0 for item in sequence):
        for item in sequence:
            counts[item] -= 1
        rest = _extract_sets(counts)
        for item in sequence:
            counts[item] += 1
        if rest is not None:
            return [{"type": "sequence", "tiles": sequence}] + rest

    return None


def _sequence_from(code: str) -> list[str] | None:
    if len(code) != 2 or code[1] not in {"m", "p", "s"}:
        return None
    value = int(code[0])
    if value > 7:
        return None
    return [f"{value}{code[1]}", f"{value + 1}{code[1]}", f"{value + 2}{code[1]}"]


def _score_partition_patterns(patterns: list[dict[str, Any]], partition: dict[str, Any], counts: Counter[str], context: dict[str, Any]) -> None:
    sets = partition["sets"]
    if sets and all(item["type"] == "triplet" for item in sets):
        _add_pattern(patterns, "對對糊", 3, "四組牌都係刻子/槓子。")
    if sets and all(item["type"] == "sequence" for item in sets) and partition["pair"] not in DRAGONS and partition["pair"] not in WINDS:
        _add_pattern(patterns, "平糊", 1, "四組順子加一對非字牌眼。")

    dragon_triplets = {item["tiles"][0] for item in sets if item["type"] == "triplet" and item["tiles"][0] in DRAGONS}
    if dragon_triplets == DRAGONS:
        _add_pattern(patterns, "大三元", 8, "中、發、白三副都係刻子/槓子。")
    elif len(dragon_triplets) == 2 and partition["pair"] in DRAGONS - dragon_triplets:
        _add_pattern(patterns, "小三元", 5, "中、發、白其中兩副刻子，餘下一款做眼。")

    for wind_label, pattern_name in ((context.get("roundWind"), "圈風"), (context.get("winnerSeat"), "門風")):
        wind_code = SEAT_MAP.get(str(wind_label or ""), "")
        if wind_code and counts[wind_code] >= 3:
            _add_pattern(patterns, pattern_name, 1, f"有 {tile_label(wind_code)} 風刻子。")


def _score_color_patterns(patterns: list[dict[str, Any]], codes: list[str]) -> None:
    suits = {code[1] for code in codes if len(code) == 2 and code[1] in {"m", "p", "s"}}
    has_honor = any(code in WINDS or code in DRAGONS for code in codes)
    if len(suits) == 1 and not has_honor:
        _add_pattern(patterns, "清一色", 7, "全副牌都係同一門數牌，無字牌。")
    elif len(suits) == 1 and has_honor:
        _add_pattern(patterns, "混一色", 3, "一門數牌加字牌。")


def _is_all_honors(codes: list[str]) -> bool:
    return len(codes) >= 14 and all(code in WINDS or code in DRAGONS for code in codes)


def _is_thirteen_orphans(counts: Counter[str], tile_count: int) -> bool:
    return tile_count == 14 and TERMINALS_AND_HONORS.issubset(counts) and any(counts[code] >= 2 for code in TERMINALS_AND_HONORS)


def _add_pattern(patterns: list[dict[str, Any]], name: str, faan: int, reason: str) -> None:
    if any(pattern["name"] == name for pattern in patterns):
        return
    patterns.append({"name": name, "faan": faan, "reason": reason})


def _confidence(codes: list[str], warnings: list[str]) -> str:
    if len(codes) >= 14 and not warnings:
        return "medium"
    if len(codes) >= 14:
        return "low"
    return "待確認"


def _tile_sort_key(code: str) -> tuple[int, int]:
    if len(code) == 2 and code[1] in {"m", "p", "s"}:
        return ({"m": 0, "p": 1, "s": 2}[code[1]], int(code[0]))
    honor_order = {"east": 3, "south": 4, "west": 5, "north": 6, "white": 7, "green": 8, "red": 9}
    return (honor_order.get(code, 99), 0)