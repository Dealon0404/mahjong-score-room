from __future__ import annotations

import base64
import io
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from .hand_grouping import select_winning_hand_detections
from .scoring import score_hong_kong_hand
from .tile_mapping import tile_label
from .yolo_onnx import create_detector_from_env

MAX_IMAGE_DATA_URL_LENGTH = 10 * 1024 * 1024

app = FastAPI(title="Mahjong Vision Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGIN", "*")],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

_detector = None
_detector_error = ""


@app.middleware("http")
async def add_private_network_cors_header(request: Request, call_next: Any) -> Any:
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.get("/health")
def health() -> dict[str, Any]:
    detector = _get_detector()
    return {
        "ok": True,
        "source": "yolo-vision",
        "modelConfigured": detector is not None,
        "modelError": _detector_error,
    }


@app.post("/api/analyze-tiles")
async def analyze_tiles(request: Request) -> dict[str, Any]:
    payload = await request.json()
    image_data_url = str(payload.get("image") or "")
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    image = _decode_image(image_data_url)

    warnings = []
    detector = _get_detector()
    if detector is None:
        detections: list[dict[str, Any]] = []
        warnings.append(_detector_error or "未設定 MAHJONG_YOLO_MODEL_PATH / MAHJONG_YOLO_CLASSES_PATH，暫時未能由相片偵測牌面。")
    else:
        detections = detector.detect(image)

    winning_hand = select_winning_hand_detections(detections)
    tile_codes = [item["code"] for item in winning_hand if item.get("code")]
    analysis = score_hong_kong_hand(tile_codes, context)
    analysis["warnings"] = warnings + analysis["warnings"]
    analysis["tiles"] = [
        {
            "code": item["code"],
            "label": item.get("label") or tile_label(item["code"]),
            "confidence": _confidence_label(float(item.get("confidence", 0))),
            "box": item.get("box"),
            "rawLabel": item.get("rawLabel"),
        }
        for item in winning_hand
    ]
    if not analysis["tiles"]:
        analysis["confidence"] = "待接模型" if detector is None else analysis["confidence"]
    return analysis


def _get_detector() -> Any:
    global _detector, _detector_error
    if _detector or _detector_error:
        return _detector
    try:
        _detector = create_detector_from_env(os.environ)
    except Exception as error:
        _detector_error = f"YOLO model 載入失敗：{error}"
        _detector = None
    return _detector


def _decode_image(data_url: str) -> Image.Image:
    if not data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Expected image as a data:image/* base64 data URL.")
    if len(data_url) > MAX_IMAGE_DATA_URL_LENGTH:
        raise HTTPException(status_code=413, detail="Image is too large. Try a clearer cropped photo.")
    try:
        _, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded)
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Invalid image data URL: {error}") from error


def _confidence_label(value: float) -> str:
    if value >= 0.75:
        return "high"
    if value >= 0.45:
        return "medium"
    return "low"