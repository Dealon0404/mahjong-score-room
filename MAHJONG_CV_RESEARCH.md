# 影相計番：Mahjong CV / YOLO GitHub Research

目標：搵現成麻雀牌 object detection / YOLO / CV project，評估可唔可以接入「雀數」嘅 `影相計番`。

## 結論

暫時未搵到一個可以直接放入 GitHub Pages PWA、又有清晰 license、又支援香港麻雀食糊相片自動計番嘅完整方案。

最實際路線係：

1. 繼續用現有 `/api/analyze-tiles` JSON contract。
2. 另起一個 YOLO vision service：影相 -> tile detections -> 揀出食糊手牌 -> 香港麻雀番型 heuristic -> 回傳同現有 Vision API 一樣嘅 JSON。
3. 用 OpenAI Vision 做短期 fallback；YOLO 做中期可控成本/可離線化路線。

## 候選 Repo

### Camerash/mahjong-dataset

- URL: https://github.com/Camerash/mahjong-dataset
- License: MIT
- 重點：中國麻雀牌 dataset，41 類，包含 `dots-*`、`bamboo-*`、`characters-*`、風牌、三元牌、花牌。
- 限制：主要係裁好嘅單張牌圖像 / classification dataset，唔係手機食糊相 object detection dataset。
- 用法：適合做 class mapping、補訓分類器、augment 自己 dataset。

### jaheel/MJOD-2136

- URL: https://github.com/jaheel/MJOD-2136
- License: Apache-2.0
- 重點：MJOD-2136 object detection dataset，COCO format；另有 MJOD-Net/MMDetection config，同外部 dataset/pth 下載連結。
- 限制：偏 research stack，MMDetection 比較重；權重/資料喺 Google Drive / Baidu，唔係 repo 直接包含。
- 用法：最適合作為自己訓練 YOLO/ONNX detector 嘅正式資料來源之一。

### RiichiMahjongTools/riichi-tile-detector

- URL: https://github.com/RiichiMahjongTools/riichi-tile-detector
- License: GitHub metadata 未見 license。
- 重點：直接有 `models/riichi-37-yolo11n-640.onnx`，10.6MB，37 類日麻牌，README 報 precision 0.924、recall 0.870、mAP50 0.931。
- 限制：日麻 37 類，無香港花牌；無 license 前唔應該直接拷入 production。
- 用法：如果確認授權，可以最快做 YOLO inference prototype。

### smilee3998/mahjong_detection

- URL: https://github.com/smilee3998/mahjong_detection
- License: GitHub metadata 未見 license。
- 重點：YOLOv11 detection，另有 RANSAC locating winning hand。呢個「由一堆 detections 搵出最似食糊手牌嗰一行」好啱我哋影相計番。
- 限制：需要自己訓練/提供 model；無 license 前唔直接 copy code。
- 用法：可借鑑 algorithm idea：detections -> filter lower half -> RANSAC fit line -> 取 14+ inliers -> left-to-right sort。

### linkoon2019/Mahjong_Caculator_YOLO_Android

- URL: https://github.com/linkoon2019/Mahjong_Caculator_YOLO_Android
- License: README 寫 MIT，但 GitHub metadata 未偵測到 license。
- 重點：README 講 YOLOv11 + Android/Kotlin + TFLite + scoring。`YoloDetector.kt` 有 Android TFLite inference wrapper；`MahjongCalculator.kt` 有日麻算番邏輯。
- 限制：repo tree 未見 `.tflite/.pt/.onnx` model artifact；算番係日麻，唔係香港麻雀。
- 用法：可以參考 mobile inference structure，但唔係直接接入 PWA。

### Cormac-H/Mahjong-Yolo

- URL: https://github.com/Cormac-H/Mahjong-Yolo
- License: GitHub metadata 未見 license。
- 重點：有 `Current_Best_Model.onnx`、`.pt`、YOLOv8 inference script。
- 限制：class 只有 B/C/D suits 同 `HU/PENG/KONG`，似 online game screenshot；唔係手機拍實體香港麻雀牌。
- 用法：可做 ONNX inference 技術參考，唔建議作為我哋 production detector。

### Thisisme-Andrew/Mahjong-Tile-Identifier

- URL: https://github.com/Thisisme-Andrew/Mahjong-Tile-Identifier
- License: GitHub metadata 未見 license。
- 重點：README 明確講 auto-calculate feature，47 classes，cover Hong Kong / Chinese / Taiwanese / Japanese，支援 ONNX/TFLite/CoreML export workflow。
- 限制：偏 training workflow；未見現成 model artifact。
- 用法：很貼題，可作 dataset/class design 參考。

### friklogff/YOLOv11ForMahjong

- URL: https://github.com/friklogff/YOLOv11ForMahjong
- License: MIT
- 重點：YOLOv11 麻雀牌識別，基於 Camerash dataset，包含大量 YOLO labels、training/predict scripts。
- 限制：主要係訓練資料與 script；未確認有可直接用嘅 trained weights。
- 用法：可作 training pipeline 參考。

## 建議接法

現有前端已經會 POST 到 `/api/analyze-tiles`，期望回傳：

```json
{
  "source": "yolo-vision",
  "confidence": "medium",
  "tiles": [{ "code": "1m", "label": "一萬", "confidence": "high" }],
  "patterns": [{ "name": "清一色", "faan": 7, "reason": "全副牌都係同一門數牌" }],
  "faan": 7,
  "reasons": ["點解係呢個番數"],
  "warnings": ["有咩位唔肯定"]
}
```

所以 YOLO service 可以獨立做到：

1. 接收 data URL image。
2. YOLO/ONNX detect tiles。
3. RANSAC/line grouping 揀出食糊手牌。
4. Normalize tile classes 去 `1m..9m`、`1p..9p`、`1s..9s`、`east/south/west/north/red/green/white/flower*`。
5. 用香港麻雀 heuristic 算常見番型：平糊、對對糊、混一色、清一色、小三元、大三元、字一色、十三么、七對子等。
6. 回傳同現有 API 一樣嘅 JSON，前端唔使大改。

## 下一步 MVP

1. 先用 OpenAI Vision 繼續撐 demo。
2. 用 `scripts/bootstrap_open_seed_dataset.py` 下載 MIT `Camerash/mahjong-dataset`，合成 YOLO seed dataset。
3. 建一個 `mahjong-vision-service` Python/FastAPI prototype，用 `ultralytics` 或 `onnxruntime`。
4. 用 app opt-in samples、`MJOD-2136`、自己影 100-300 張香港麻雀食糊手牌相 fine-tune YOLO11n。
5. Export ONNX，部署去 Cloud Run / Render / Fly.io。GitHub Pages 本身跑唔到 Python/YOLO backend。
6. 前端用：

```js
localStorage.setItem('mahjong-tile-vision-endpoint', 'https://your-vision-service.example.com/api/analyze-tiles')
```

## License Note

有 model artifact 但無 license 嘅 repo，不建議直接 copy 到 production repo。可以先作 local experiment；真正上線最好用 MIT/Apache dataset 自己訓練，或者取得作者授權。