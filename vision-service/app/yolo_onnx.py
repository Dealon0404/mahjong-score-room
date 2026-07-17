from __future__ import annotations

from pathlib import Path
from typing import Any

from .tile_mapping import normalize_tile_code, tile_label


class YoloOnnxDetector:
    def __init__(self, model_path: str, classes_path: str, *, image_size: int = 640, confidence: float = 0.3, iou: float = 0.45) -> None:
        import numpy as np
        import onnxruntime as ort

        self.np = np
        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.classes = _read_classes(classes_path)
        self.image_size = image_size
        self.confidence = confidence
        self.iou = iou

    def detect(self, image: Any) -> list[dict[str, Any]]:
        array, scale, pad_x, pad_y, original_width, original_height = self._preprocess(image)
        output = self.session.run(None, {self.input_name: array})[0]
        rows = self._rows(output)
        detections = []
        for row in rows:
            scores = row[4:]
            class_id = int(scores.argmax())
            score = float(scores[class_id])
            if score < self.confidence:
                continue
            cx, cy, width, height = [float(value) for value in row[:4]]
            left = (cx - width / 2 - pad_x) / scale
            top = (cy - height / 2 - pad_y) / scale
            box_width = width / scale
            box_height = height / scale
            left = max(0.0, min(original_width, left))
            top = max(0.0, min(original_height, top))
            box_width = max(0.0, min(original_width - left, box_width))
            box_height = max(0.0, min(original_height - top, box_height))
            raw_label = self.classes[class_id] if class_id < len(self.classes) else str(class_id)
            code = normalize_tile_code(raw_label)
            detections.append({
                "code": code,
                "label": tile_label(code),
                "rawLabel": raw_label,
                "confidence": score,
                "box": [left / original_width, top / original_height, box_width / original_width, box_height / original_height],
            })
        return self._nms(detections)

    def _preprocess(self, image: Any) -> tuple[Any, float, float, float, int, int]:
        np = self.np
        image = image.convert("RGB")
        original_width, original_height = image.size
        scale = min(self.image_size / original_width, self.image_size / original_height)
        resized_width = int(original_width * scale)
        resized_height = int(original_height * scale)
        resized = image.resize((resized_width, resized_height))
        canvas = np.zeros((self.image_size, self.image_size, 3), dtype=np.uint8)
        pad_x = (self.image_size - resized_width) // 2
        pad_y = (self.image_size - resized_height) // 2
        canvas[pad_y:pad_y + resized_height, pad_x:pad_x + resized_width] = np.asarray(resized)
        array = canvas.astype(np.float32) / 255.0
        array = np.transpose(array, (2, 0, 1))[None, :, :, :]
        return array, scale, float(pad_x), float(pad_y), original_width, original_height

    def _rows(self, output: Any) -> Any:
        np = self.np
        output = np.asarray(output)
        if output.ndim == 3:
            output = output[0]
        if output.shape[0] < output.shape[1]:
            output = output.transpose()
        return output

    def _nms(self, detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        for detection in sorted(detections, key=lambda item: float(item["confidence"]), reverse=True):
            if all(_iou(detection["box"], item["box"]) <= self.iou for item in selected):
                selected.append(detection)
        return selected


def create_detector_from_env(env: dict[str, str]) -> YoloOnnxDetector | None:
    model_path = env.get("MAHJONG_YOLO_MODEL_PATH", "").strip()
    classes_path = env.get("MAHJONG_YOLO_CLASSES_PATH", "").strip()
    if not model_path or not classes_path:
        return None
    if not Path(model_path).is_file():
        raise FileNotFoundError(f"MAHJONG_YOLO_MODEL_PATH not found: {model_path}")
    if not Path(classes_path).is_file():
        raise FileNotFoundError(f"MAHJONG_YOLO_CLASSES_PATH not found: {classes_path}")
    image_size = int(env.get("MAHJONG_YOLO_IMAGE_SIZE", "640"))
    confidence = float(env.get("MAHJONG_YOLO_CONFIDENCE", "0.3"))
    iou = float(env.get("MAHJONG_YOLO_IOU", "0.45"))
    return YoloOnnxDetector(model_path, classes_path, image_size=image_size, confidence=confidence, iou=iou)


def _read_classes(path: str) -> list[str]:
    return [line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def _iou(first: list[float], second: list[float]) -> float:
    ax1, ay1, aw, ah = first
    bx1, by1, bw, bh = second
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh
    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_w, inter_h = max(0.0, inter_x2 - inter_x1), max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h
    union = aw * ah + bw * bh - intersection
    return intersection / union if union else 0.0