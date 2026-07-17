# Mahjong Vision Service

Python/FastAPI prototype for `影相計番`. It keeps the same JSON contract as the existing `/api/analyze-tiles` endpoint, so the PWA can switch endpoints without UI changes.

This service does **not** bundle third-party Mahjong model weights. Point it at your own exported YOLO/ONNX model with environment variables.

## Run Locally

```powershell
cd mahjong-score-room\vision-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

Then point the PWA at it in the browser console:

```js
localStorage.setItem('mahjong-tile-vision-endpoint', 'http://127.0.0.1:8001/api/analyze-tiles')
```

## Model Environment Variables

```powershell
$env:MAHJONG_YOLO_MODEL_PATH = "C:\path\to\best.onnx"
$env:MAHJONG_YOLO_CLASSES_PATH = "C:\path\to\classes.txt"
$env:ALLOWED_ORIGIN = "*"
```

`classes.txt` should contain one class label per line. Common labels such as `1m`, `1p`, `1s`, `1z`, `characters-1`, `dots-1`, `bamboo-1`, `honors-east`, and `red` are normalized into the PWA tile codes.

If no model is configured, the endpoint still returns a valid response with warnings. This lets the frontend integration be tested before model training/deployment is complete.

## Endpoint

`POST /api/analyze-tiles`

```json
{
  "image": "data:image/jpeg;base64,...",
  "context": {
    "winType": "自摸",
    "roundWind": "東",
    "winnerSeat": "東"
  }
}
```

Response shape matches `api/analyze-tiles.js`:

```json
{
  "source": "yolo-vision",
  "confidence": "medium",
  "tiles": [],
  "patterns": [],
  "faan": 0,
  "reasons": [],
  "warnings": []
}
```

## Implementation Notes

- ONNX detection is optional and lazy-loaded.
- Detected tiles are grouped into the likely winning hand row using a deterministic line-fit filter inspired by the RANSAC approach found during research.
- Hong Kong Mahjong fan counting is intentionally heuristic. It handles common photo-visible patterns first: `自摸`, `平糊`, `對對糊`, `混一色`, `清一色`, `小三元`, `大三元`, `字一色`, `七對子`, `十三么`, and visible seat/round wind triplets.