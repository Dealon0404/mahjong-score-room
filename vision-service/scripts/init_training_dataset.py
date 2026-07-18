from __future__ import annotations

import argparse
from pathlib import Path


TILE_CLASSES = [
    *[f"{value}m" for value in range(1, 10)],
    *[f"{value}p" for value in range(1, 10)],
    *[f"{value}s" for value in range(1, 10)],
    "east",
    "south",
    "west",
    "north",
    "red",
    "green",
    "white",
    *[f"flower{value}" for value in range(1, 9)],
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a YOLO dataset skeleton for Mahjong tile training.")
    parser.add_argument("--out-dir", default="datasets/mahjong-custom")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    out_dir = (root / args.out_dir).resolve()

    for split in ("train", "val"):
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    (out_dir / "classes.txt").write_text("\n".join(TILE_CLASSES) + "\n", encoding="utf-8")
    (out_dir / "data.yaml").write_text(build_data_yaml(out_dir), encoding="utf-8")
    (out_dir / "README.md").write_text(build_readme(), encoding="utf-8")

    print(f"Dataset skeleton: {out_dir}")
    print(f"Classes: {len(TILE_CLASSES)}")
    print(f"YOLO data file: {out_dir / 'data.yaml'}")


def build_data_yaml(out_dir: Path) -> str:
    names = "\n".join(f"  {index}: {name}" for index, name in enumerate(TILE_CLASSES))
    return "\n".join([
        f"path: {out_dir.as_posix()}",
        "train: images/train",
        "val: images/val",
        "names:",
        names,
        "",
    ])


def build_readme() -> str:
    return """# Mahjong Custom YOLO Dataset

Put labelled images here in YOLO detection format:

- images/train/*.jpg
- images/val/*.jpg
- labels/train/*.txt
- labels/val/*.txt

Each label row format:

```text
class_id x_center y_center width height
```

Coordinates are normalized 0..1. Class ids follow `classes.txt` / `data.yaml`.
"""


if __name__ == "__main__":
    main()
