from __future__ import annotations

from typing import Any


MIN_WINNING_TILES = 14
MAX_WINNING_TILES = 18


def select_winning_hand_detections(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tiles = [item for item in detections if item.get("code")]
    if len(tiles) <= MAX_WINNING_TILES:
        return sorted(tiles, key=_center_x)

    candidates = _candidate_lower_half(tiles)
    if len(candidates) < MIN_WINNING_TILES:
        candidates = tiles[:]

    fitted = _fit_line_inliers(candidates)
    if len(fitted) < MIN_WINNING_TILES:
        fitted = candidates

    fitted = sorted(fitted, key=_center_x)
    if len(fitted) > MAX_WINNING_TILES:
        fitted = sorted(fitted, key=lambda item: (_line_error(item, fitted), -float(item.get("confidence", 0))))[:MAX_WINNING_TILES]
        fitted = sorted(fitted, key=_center_x)
    return fitted


def _candidate_lower_half(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for threshold in (0.5, 0.35, 0.0):
        filtered = [item for item in detections if _center_y(item) >= threshold]
        if len(filtered) >= MIN_WINNING_TILES:
            return filtered
    return detections


def _fit_line_inliers(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    active = detections[:]
    while len(active) > MAX_WINNING_TILES:
        slope, intercept = _least_squares_line(active)
        worst = max(active, key=lambda item: abs(_center_y(item) - (slope * _center_x(item) + intercept)))
        active.remove(worst)

    slope, intercept = _least_squares_line(active)
    errors = [abs(_center_y(item) - (slope * _center_x(item) + intercept)) for item in active]
    threshold = max(0.035, (sum(errors) / len(errors) if errors else 0) * 2.4)
    return [item for item in active if abs(_center_y(item) - (slope * _center_x(item) + intercept)) <= threshold]


def _least_squares_line(detections: list[dict[str, Any]]) -> tuple[float, float]:
    xs = [_center_x(item) for item in detections]
    ys = [_center_y(item) for item in detections]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return 0.0, mean_y
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    intercept = mean_y - slope * mean_x
    return slope, intercept


def _line_error(item: dict[str, Any], group: list[dict[str, Any]]) -> float:
    slope, intercept = _least_squares_line(group)
    return abs(_center_y(item) - (slope * _center_x(item) + intercept))


def _center_x(item: dict[str, Any]) -> float:
    box = item.get("box") or [0, 0, 0, 0]
    return float(box[0]) + float(box[2]) / 2


def _center_y(item: dict[str, Any]) -> float:
    box = item.get("box") or [0, 0, 0, 0]
    return float(box[1]) + float(box[3]) / 2