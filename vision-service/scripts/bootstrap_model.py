from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path


TILEMIND_BASE = "https://raw.githubusercontent.com/zzijin/MahjongTool_TileMind/main"
DEFAULT_MODEL_URL = f"{TILEMIND_BASE}/Train/mahjong_model/yolo/yolov8n-fp32.onnx"
DEFAULT_YAML_URL = f"{TILEMIND_BASE}/X-AnyLabeling/models/yolov8n.yaml"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download a MIT Mahjong ONNX model for local testing.")
    parser.add_argument("--model-url", default=DEFAULT_MODEL_URL)
    parser.add_argument("--yaml-url", default=DEFAULT_YAML_URL)
    parser.add_argument("--out-dir", default="models")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    out_dir = (root / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    model_path = out_dir / "tilemind-yolov8n-fp32.onnx"
    yaml_path = out_dir / "tilemind-yolov8n.yaml"
    classes_path = out_dir / "classes.txt"
    model_env_path = out_dir / "model.env"
    env_path = out_dir / "set-model-env.ps1"

    download(args.model_url, model_path)
    download(args.yaml_url, yaml_path)
    classes = parse_classes(yaml_path.read_text(encoding="utf-8"))
    if not classes:
        raise RuntimeError(f"No classes found in {yaml_path}")

    classes_path.write_text("\n".join(classes) + "\n", encoding="utf-8")
    model_env_path.write_text(
        "\n".join([
            f"MAHJONG_YOLO_MODEL_PATH={model_path}",
            f"MAHJONG_YOLO_CLASSES_PATH={classes_path}",
            "MAHJONG_YOLO_IMAGE_SIZE=640",
            "MAHJONG_YOLO_CONFIDENCE=0.40",
            "MAHJONG_YOLO_IOU=0.50",
            "",
        ]),
        encoding="utf-8",
    )
    env_path.write_text(
        "\n".join([
            f"$env:MAHJONG_YOLO_MODEL_PATH = '{escape_powershell(model_path)}'",
            f"$env:MAHJONG_YOLO_CLASSES_PATH = '{escape_powershell(classes_path)}'",
            "$env:MAHJONG_YOLO_IMAGE_SIZE = '640'",
            "$env:MAHJONG_YOLO_CONFIDENCE = '0.40'",
            "$env:MAHJONG_YOLO_IOU = '0.50'",
            "$env:ALLOWED_ORIGIN = '*'",
            "",
        ]),
        encoding="utf-8",
    )

    print(f"Model:   {model_path}")
    print(f"Classes: {classes_path} ({len(classes)} classes)")
    print(f"Env:     {model_env_path}")
    print("\nThe service will auto-load models/model.env. Start or restart the server:")
    print("uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload")


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        print(f"exists: {path}")
        return
    print(f"download: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "mahjong-score-room-bootstrap"})
    with urllib.request.urlopen(request, timeout=120) as response:
        path.write_bytes(response.read())


def parse_classes(yaml_text: str) -> list[str]:
    classes: list[str] = []
    in_classes = False
    for raw_line in yaml_text.splitlines():
        stripped = raw_line.strip()
        if stripped == "classes:":
            in_classes = True
            continue
        if in_classes:
            if not stripped:
                continue
            if not stripped.startswith("-"):
                break
            classes.append(stripped.removeprefix("-").strip().strip('"\''))
    return classes


def escape_powershell(path: Path) -> str:
    return str(path).replace("'", "''")


if __name__ == "__main__":
    main()