from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune a YOLO model for Mahjong tile detection and export ONNX.")
    parser.add_argument("--data", default="datasets/mahjong-custom/data.yaml")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--project", default="runs/mahjong-yolo")
    parser.add_argument("--name", default="custom")
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit("Install training requirements first: pip install -r requirements-training.txt") from error

    root = Path(__file__).resolve().parents[1]
    data_path = (root / args.data).resolve() if not Path(args.data).is_absolute() else Path(args.data)
    project_path = (root / args.project).resolve() if not Path(args.project).is_absolute() else Path(args.project)

    model = YOLO(args.model)
    result = model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=str(project_path),
        name=args.name,
    )

    save_dir = Path(getattr(result, "save_dir", project_path / args.name))
    best_pt = save_dir / "weights" / "best.pt"
    print(f"Best model: {best_pt}")

    if not args.no_export and best_pt.exists():
        exported = YOLO(str(best_pt)).export(format="onnx", imgsz=args.imgsz, opset=12, dynamic=True)
        print(f"ONNX export: {exported}")
        print("\nUse this ONNX model with the FastAPI service:")
        print(f"$env:MAHJONG_YOLO_MODEL_PATH = '{exported}'")
        print(f"$env:MAHJONG_YOLO_CLASSES_PATH = '{data_path.parent / 'classes.txt'}'")


if __name__ == "__main__":
    main()
