# Custom Mahjong YOLO Training

呢條路線係用你自己實際麻雀牌、角度同燈光 fine-tune YOLO，長遠會比純 OpenAI Vision 更可控。

## Can Online Images Tell The Fan?

網上牌相可以幫手訓練「認到係咩牌」，但唔一定可以直接知道「幾番」。番數要有完整食糊手牌、食糊方式、自摸/食糊、圈風、位風、花牌、門清/上碰槓等上下文。

所以架構應該係：

```text
相片 -> YOLO 認牌 -> app/scoring heuristic 計常見港式番型 -> 用戶確認/手動改
```

用網上相片時，只用 license 清晰嘅 dataset / repo。唔好隨機 scrape 受版權保護嘅圖片放入 repo 或 production dataset。

## Bootstrap With Open Licensed Online Images

可以先用 MIT dataset 做合法 baseline seed，唔需要等用戶相片先開始：

```powershell
cd mahjong-score-room\vision-service
.\.venv\Scripts\Activate.ps1
python scripts\bootstrap_open_seed_dataset.py --samples 600
```

呢個 script 會：

1. 下載 MIT `Camerash/mahjong-dataset` 嘅 `train.zip`。
2. 讀取單隻牌 labels。
3. 隨機合成一排 13-16 隻牌，模擬食糊手牌相。
4. 自動產生 YOLO bounding-box labels。
5. 建立 `datasets/mahjong-open-seed/data.yaml`。

之後先 train baseline：

```powershell
python scripts\train_yolo.py --data datasets/mahjong-open-seed/data.yaml --model yolov8n.pt --epochs 40 --imgsz 960
```

呢個 baseline 會學到牌面類別同一排手牌 layout，但因為係 synthetic，相片反光、真實枱面、牌厚度、斜角仍然要靠 app opt-in 真相 fine-tune。

## Collect Training Photos From The App

PWA 已加 opt-in collection：用戶影相計番後，如果勾選「匿名提供呢張牌相同分析結果」，並且按 Accept，app 會 POST 到：

```text
https://mahjong-score-room.vercel.app/api/training-samples
```

Backend 會將相片同 metadata 存入 Vercel Blob：

```text
mahjong-training/YYYY-MM-DD/<sample-id>.jpg
mahjong-training/YYYY-MM-DD/<sample-id>.json
```

要開通 collection，去 Vercel Project Settings > Storage 建 Blob store，然後喺 Environment Variables 加：

```text
BLOB_READ_WRITE_TOKEN
```

Redeploy 後檢查：

```text
https://mahjong-score-room.vercel.app/api/training-samples?health=1
```

成功會見到：

```json
{
  "ok": true,
  "source": "training-samples",
  "storage": "vercel-blob",
  "configured": true
}
```

私隱要求：collection 一定要 opt-in；提示用戶避免影到人樣、收據、電話號碼、地址等個人資料。

## Create Dataset Skeleton

```powershell
cd mahjong-score-room\vision-service
python scripts\init_training_dataset.py
```

會建立：

```text
datasets/mahjong-custom/
  images/train/
  images/val/
  labels/train/
  labels/val/
  classes.txt
  data.yaml
```

Class set：`1m..9m`、`1p..9p`、`1s..9s`、`east/south/west/north/red/green/white`、`flower1..flower8`。

## Label Images

用 CVAT、Label Studio、Roboflow 或 AnyLabeling 將每隻牌框出嚟，export YOLO detection format。

標籤格式：

```text
class_id x_center y_center width height
```

全部座標係 0..1 normalized。

建議收相：

- 每副牌 100-300 張起步
- 包含實際燈光、枱布、反光、斜角、手機距離
- Train / validation 約 80/20 split
- 同一張相入面每隻可見牌都要框，不只框食糊 14 隻

## Train And Export ONNX

```powershell
cd mahjong-score-room\vision-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-training.txt
python scripts\train_yolo.py --data datasets/mahjong-custom/data.yaml --model yolov8n.pt --epochs 80 --imgsz 960
```

完成後 script 會 export ONNX，然後用 env 指俾 local FastAPI service：

```powershell
$env:MAHJONG_YOLO_MODEL_PATH = "path\to\best.onnx"
$env:MAHJONG_YOLO_CLASSES_PATH = "datasets\mahjong-custom\classes.txt"
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

前端本機測試：

```js
localStorage.setItem('mahjong-tile-vision-endpoint', 'http://127.0.0.1:8001/api/analyze-tiles')
```

## Production Deployment

Vercel serverless 不適合長期跑 YOLO/ONNX。訓練好之後，建議將 `vision-service` 部署到 Cloud Run / Render / Fly.io / Railway，再將前端 endpoint 指過去：

```js
localStorage.setItem('mahjong-tile-vision-endpoint', 'https://your-yolo-service.example.com/api/analyze-tiles')
```

短期可以保留 OpenAI Vision；中期用 YOLO service 降成本同提升穩定性。
