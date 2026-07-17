from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TileInfo:
    code: str
    label: str


SUIT_LABELS = {
    "m": "萬",
    "p": "筒",
    "s": "索",
}

HONOR_LABELS = {
    "east": "東",
    "south": "南",
    "west": "西",
    "north": "北",
    "red": "中",
    "green": "發",
    "white": "白",
}

Z_TO_HONOR = {
    "1z": "east",
    "2z": "south",
    "3z": "west",
    "4z": "north",
    "5z": "white",
    "6z": "green",
    "7z": "red",
}

ALIASES = {
    "east": "east",
    "honors-east": "east",
    "wind-east": "east",
    "south": "south",
    "honors-south": "south",
    "wind-south": "south",
    "west": "west",
    "honors-west": "west",
    "wind-west": "west",
    "north": "north",
    "honors-north": "north",
    "wind-north": "north",
    "red": "red",
    "dragon-red": "red",
    "honors-red": "red",
    "chun": "red",
    "green": "green",
    "dragon-green": "green",
    "honors-green": "green",
    "hatsu": "green",
    "white": "white",
    "dragon-white": "white",
    "honors-white": "white",
    "haku": "white",
    "wd-blank": "white",
    "wd-box": "white",
}

for value in range(1, 10):
    ALIASES[f"{value}m"] = f"{value}m"
    ALIASES[f"{value}man"] = f"{value}m"
    ALIASES[f"man{value}"] = f"{value}m"
    ALIASES[f"characters-{value}"] = f"{value}m"
    ALIASES[f"character{value}"] = f"{value}m"
    ALIASES[f"c{value}"] = f"{value}m"

    ALIASES[f"{value}p"] = f"{value}p"
    ALIASES[f"{value}pin"] = f"{value}p"
    ALIASES[f"{value}tong"] = f"{value}p"
    ALIASES[f"pin{value}"] = f"{value}p"
    ALIASES[f"tong{value}"] = f"{value}p"
    ALIASES[f"dots-{value}"] = f"{value}p"
    ALIASES[f"dot{value}"] = f"{value}p"
    ALIASES[f"d{value}"] = f"{value}p"

    ALIASES[f"{value}s"] = f"{value}s"
    ALIASES[f"{value}sou"] = f"{value}s"
    ALIASES[f"{value}sok"] = f"{value}s"
    ALIASES[f"sou{value}"] = f"{value}s"
    ALIASES[f"sok{value}"] = f"{value}s"
    ALIASES[f"bamboo-{value}"] = f"{value}s"
    ALIASES[f"bamboo{value}"] = f"{value}s"
    ALIASES[f"b{value}"] = f"{value}s"

for red_five in ("0m", "0p", "0s", "5man-richi", "5tong-richi", "5sok-richi"):
    if red_five.endswith("m") or "man" in red_five:
        ALIASES[red_five] = "5m"
    elif red_five.endswith("p") or "tong" in red_five:
        ALIASES[red_five] = "5p"
    else:
        ALIASES[red_five] = "5s"

for z_code, honor_code in Z_TO_HONOR.items():
    ALIASES[z_code] = honor_code

for value in range(1, 9):
    ALIASES[f"flower{value}"] = f"flower{value}"
    ALIASES[f"flower-{value}"] = f"flower{value}"
    ALIASES[f"bonus-{value}"] = f"flower{value}"


def normalize_tile_code(raw_label: str) -> str:
    key = str(raw_label or "").strip().lower().replace("_", "-").replace(" ", "-")
    return ALIASES.get(key, "")


def tile_label(code: str) -> str:
    if code in HONOR_LABELS:
        return HONOR_LABELS[code]
    if code.startswith("flower"):
        return f"花牌{code.removeprefix('flower')}"
    if len(code) == 2 and code[0].isdigit() and code[1] in SUIT_LABELS:
        return f"{code[0]}{SUIT_LABELS[code[1]]}"
    return code or "未知"


def tile_info(code: str) -> TileInfo:
    return TileInfo(code=code, label=tile_label(code))