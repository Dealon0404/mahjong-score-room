from __future__ import annotations

import argparse
import csv
import random
import urllib.request
import zipfile
from pathlib import Path

try:
    from PIL import Image, ImageEnhance, ImageFilter
except ImportError as error:
    raise SystemExit("Install vision-service requirements first: pip install -r requirements.txt") from error


CAMERASH_TRAIN_ZIP_URL = "https://github.com/Camerash/mahjong-dataset/raw/master/train.zip"

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

CAMERASH_LABELS = {
    **{f"dots-{value}": f"{value}p" for value in range(1, 10)},
    **{f"bamboo-{value}": f"{value}s" for value in range(1, 10)},
    **{f"characters-{value}": f"{value}m" for value in range(1, 10)},
    "honors-east": "east",
    "honors-south": "south",
    "honors-west": "west",
    "honors-north": "north",
    "honors-red": "red",
    "honors-green": "green",
    "honors-white": "white",
    "bonus-spring": "flower1",
    "bonus-summer": "flower2",
    "bonus-autumn": "flower3",
    "bonus-winter": "flower4",
    "bonus-plum": "flower5",
    "bonus-orchid": "flower6",
    "bonus-chrysanthemum": "flower7",
    "bonus-bamboo": "flower8",
}

INDEX_TO_CAMERASH = {index + 1: label for index, label in enumerate(CAMERASH_LABELS)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an open-license synthetic Mahjong YOLO seed dataset.")
    parser.add_argument("--samples", type=int, default=600, help="Number of synthetic hand images to generate.")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=20260718)
    parser.add_argument("--out-dir", default="datasets/mahjong-open-seed")
    parser.add_argument("--download-dir", default="downloads/camerash-mahjong-dataset")
    args = parser.parse_args()

    random.seed(args.seed)
    root = Path(__file__).resolve().parents[1]
    download_dir = (root / args.download_dir).resolve()
    out_dir = (root / args.out_dir).resolve()

    train_zip = download_dir / "train.zip"
    download_dir.mkdir(parents=True, exist_ok=True)
    download(CAMERASH_TRAIN_ZIP_URL, train_zip)
    extracted = extract(train_zip, download_dir / "train")
    tile_items = load_camerash_tiles(extracted)
    if len(tile_items) < 100:
        raise RuntimeError(f"Expected at least 100 labelled tiles, found {len(tile_items)}")

    prepare_yolo_dirs(out_dir)
    write_dataset_files(out_dir)
    generate_synthetic_hands(tile_items, out_dir, args.samples, args.val_ratio)

    print(f"Open seed dataset: {out_dir}")
    print(f"Source tiles:      {len(tile_items)} from Camerash/mahjong-dataset MIT")
    print(f"Synthetic images: {args.samples}")
    print(f"YOLO data file:   {out_dir / 'data.yaml'}")
    print("\nTrain baseline:")
    print(f"python scripts/train_yolo.py --data {out_dir.relative_to(root).as_posix()}/data.yaml --model yolov8n.pt --epochs 40 --imgsz 960")


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        print(f"exists: {path}")
        return
    print(f"download: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "mahjong-score-room-open-seed"})
    with urllib.request.urlopen(request, timeout=180) as response:
        path.write_bytes(response.read())


def extract(zip_path: Path, out_dir: Path) -> Path:
    marker = out_dir / ".extracted"
    if marker.exists():
        return out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(out_dir)
    marker.write_text("ok\n", encoding="utf-8")
    return out_dir


def load_camerash_tiles(root: Path) -> list[dict[str, Path | str]]:
    data_csv = next(root.rglob("data.csv"), None)
    if not data_csv:
        raise RuntimeError(f"Cannot find data.csv under {root}")
    images_dir = data_csv.parent / "images"
    if not images_dir.exists():
        images_dir = next((path for path in root.rglob("images") if path.is_dir()), None)
    if not images_dir:
        raise RuntimeError(f"Cannot find images folder under {root}")

    items: list[dict[str, Path | str]] = []
    with data_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if len(row) < 2 or row[0].lower().startswith("image"):
                continue
            image_name = row[0].strip()
            label = label_to_code(row)
            if not label:
                continue
            image_path = images_dir / image_name
            if image_path.exists():
                items.append({"path": image_path, "code": label})
    return items


def label_to_code(row: list[str]) -> str:
    for value in row[1:]:
        normalized = CAMERASH_LABELS.get(value.strip())
        if normalized:
            return normalized
    try:
        index = int(row[1])
    except ValueError:
        return ""
    return CAMERASH_LABELS.get(INDEX_TO_CAMERASH.get(index, ""), "")


def prepare_yolo_dirs(out_dir: Path) -> None:
    for split in ("train", "val"):
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)


def write_dataset_files(out_dir: Path) -> None:
    (out_dir / "classes.txt").write_text("\n".join(TILE_CLASSES) + "\n", encoding="utf-8")
    names = "\n".join(f"  {index}: {name}" for index, name in enumerate(TILE_CLASSES))
    (out_dir / "data.yaml").write_text(
        "\n".join([
            f"path: {out_dir.as_posix()}",
            "train: images/train",
            "val: images/val",
            "names:",
            names,
            "",
        ]),
        encoding="utf-8",
    )
    (out_dir / "SOURCE.md").write_text(
        "\n".join([
            "# Open Seed Dataset Source",
            "",
            "Synthetic hand-row images generated from Camerash/mahjong-dataset.",
            "",
            "- Source: https://github.com/Camerash/mahjong-dataset",
            "- License: MIT",
            "- Note: source tiles were originally scraped by that project; keep this as a baseline seed and validate before production.",
            "",
        ]),
        encoding="utf-8",
    )


def generate_synthetic_hands(items: list[dict[str, Path | str]], out_dir: Path, samples: int, val_ratio: float) -> None:
    by_code: dict[str, list[Path]] = {}
    for item in items:
        by_code.setdefault(str(item["code"]), []).append(Path(item["path"]))

    suited_codes = [code for code in by_code if code in TILE_CLASSES and not code.startswith("flower")]
    for index in range(samples):
        split = "val" if random.random() < val_ratio else "train"
        image, labels = make_hand_image(by_code, suited_codes)
        stem = f"open_seed_{index + 1:05d}"
        image.save(out_dir / "images" / split / f"{stem}.jpg", quality=88)
        (out_dir / "labels" / split / f"{stem}.txt").write_text("\n".join(labels) + "\n", encoding="utf-8")


def make_hand_image(by_code: dict[str, list[Path]], codes: list[str]) -> tuple[Image.Image, list[str]]:
    tile_count = random.choice([13, 14, 14, 14, 15, 16])
    tile_width = random.randint(54, 72)
    tile_height = int(tile_width * random.uniform(1.28, 1.42))
    gap = random.randint(3, 9)
    margin_x = random.randint(28, 54)
    margin_y = random.randint(34, 70)
    canvas_width = margin_x * 2 + tile_count * tile_width + (tile_count - 1) * gap
    canvas_height = margin_y * 2 + tile_height + random.randint(35, 90)
    canvas = make_background(canvas_width, canvas_height)
    labels: list[str] = []
    base_y = random.randint(margin_y, max(margin_y, canvas_height - margin_y - tile_height))

    hand_codes = random_hand_codes(codes, tile_count)
    for position, code in enumerate(hand_codes):
        tile = load_tile(random.choice(by_code[code]), tile_width, tile_height)
        angle = random.uniform(-4.5, 4.5)
        tile = tile.rotate(angle, expand=True, fillcolor=(245, 242, 232))
        x = margin_x + position * (tile_width + gap) + random.randint(-2, 2)
        y = base_y + random.randint(-7, 7)
        canvas.paste(tile, (x, y))
        bbox_width, bbox_height = tile.size
        labels.append(yolo_label(code, x, y, bbox_width, bbox_height, canvas_width, canvas_height))

    if random.random() < 0.25:
        canvas = canvas.filter(ImageFilter.SMOOTH_MORE)
    return canvas, labels


def random_hand_codes(codes: list[str], tile_count: int) -> list[str]:
    suit = random.choice(["m", "p", "s", "mixed"])
    if suit == "mixed":
        pool = codes
    else:
        pool = [code for code in codes if code.endswith(suit)] + [code for code in codes if code in {"east", "south", "west", "north", "red", "green", "white"}]
    return [random.choice(pool) for _ in range(tile_count)]


def load_tile(path: Path, width: int, height: int) -> Image.Image:
    image = Image.open(path).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    if random.random() < 0.65:
        image = ImageEnhance.Brightness(image).enhance(random.uniform(0.82, 1.22))
    if random.random() < 0.65:
        image = ImageEnhance.Contrast(image).enhance(random.uniform(0.85, 1.22))
    return image


def make_background(width: int, height: int) -> Image.Image:
    base = random.choice([(42, 105, 82), (35, 92, 78), (80, 72, 58), (110, 96, 78)])
    image = Image.new("RGB", (width, height), base)
    pixels = image.load()
    for _ in range(width * height // 90):
        x = random.randrange(width)
        y = random.randrange(height)
        delta = random.randint(-14, 14)
        pixels[x, y] = tuple(max(0, min(255, channel + delta)) for channel in base)
    return image


def yolo_label(code: str, x: int, y: int, width: int, height: int, canvas_width: int, canvas_height: int) -> str:
    class_id = TILE_CLASSES.index(code)
    x_center = (x + width / 2) / canvas_width
    y_center = (y + height / 2) / canvas_height
    return f"{class_id} {x_center:.6f} {y_center:.6f} {width / canvas_width:.6f} {height / canvas_height:.6f}"


if __name__ == "__main__":
    main()
