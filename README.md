# 雀數房

港式麻雀計錢房 MVP。第一版支援開房、枱規預設、枱規解釋、QR Code、掃碼入房、玩家改名、記一鋪、包自摸、牌局紀錄同結算。

## iPhone 無 Apple Developer 安裝方法

呢個 project 已經支援 PWA，可以用 HTTPS hosting 之後喺 iPhone Safari：`分享` > `加至主畫面`。

GitHub Pages 部署已設定好喺 `.github/workflows/pages.yml`。推上 GitHub repo 後，去 repo `Settings` > `Pages`，將 source 設做 `GitHub Actions`，再 push `master` 或手動 run workflow。完成後會得到一條 `https://<username>.github.io/<repo>/` URL。

## 已做到

- 完全繁中廣東話介面
- `二五雞`、`五一`、`一二蚊` 基本枱規預設
- `半銃`、`全銃`
- `半辣上`、`辣辣上`
- `8番頂`、`10番頂`
- `$64`、`$128`、`$256`、`$512`、`$1024` 等預設封頂金額
- `自摸`、`食糊`、`包自摸`
- 房主 QR Code
- 相機掃 QR Code
- Live room 同步：掃 QR 後加入同一個 production room，不再係本機副本
- 人人可改玩家名
- 人人可修改或刪除牌局紀錄
- 自動計每人輸贏同最少交易結算
- `影相計番`：可接 Vision AI 讀食糊牌相，回傳認到嘅牌、番數、原因；未設定 API key 時會用本機確認 flow

## 影相計番：接真 AI Vision

前端會預設 call 同域 API：`/api/analyze-tiles`。呢個 endpoint 已經加咗喺 `api/analyze-tiles.js`，適合直接部署去 Vercel。

Vercel 設定：

1. 將 `mahjong-score-room` 部署到 Vercel。
2. 喺 Vercel Project Settings > Environment Variables 加：
	- `OPENAI_API_KEY`
	- `OPENAI_VISION_MODEL`，可先用 `gpt-4o-mini`
3. Redeploy。
4. 開 app 入房，記一鋪時按 `影相計番`，影食糊牌相。

如果前端同 AI backend 唔同 domain，可以喺 browser console 設定：

```js
localStorage.setItem('mahjong-tile-vision-endpoint', 'https://your-api.vercel.app/api/analyze-tiles')
```

注意：AI 會讀牌同建議番數，但麻雀有啲番要靠上下文，例如門清、自摸、圈風、位風、花牌，所以 app 仍保留 Accept / Reject / 手動改。

### YOLO / CV Research

已整理 GitHub 上麻雀牌 object detection / YOLO / CV 相關候選 repo、license 風險同建議接法，見 [MAHJONG_CV_RESEARCH.md](MAHJONG_CV_RESEARCH.md)。

### YOLO Vision Service Prototype

已加第一版 Python/FastAPI prototype：見 [vision-service/README.md](vision-service/README.md)。呢個 service 同樣提供 `/api/analyze-tiles`，可以接自己訓練/export 出嚟嘅 YOLO ONNX model；未設定 model 時仍會回傳合法 JSON 同 warning，方便先測前端串接。

本機試跑：

```powershell
cd mahjong-score-room\vision-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

前端改用本機 vision service：

```js
localStorage.setItem('mahjong-tile-vision-endpoint', 'http://127.0.0.1:8001/api/analyze-tiles')
```

## 本機開發

如果你已經安裝 Node.js：

```powershell
cd mahjong-score-room
npm.cmd start
```

如果用今次建立嘅 portable Node：

```powershell
cd mahjong-score-room
..\_tools\node-v24.18.0-win-x64\npm.cmd start
```

之後用 iPhone 安裝 `Expo Go`，掃 terminal 入面 Expo 顯示嘅 QR Code 就可以試。

## Production Live Room Sync

而家 PWA 已接兩種 live room sync：

- P2P Live fallback：毋須 backend，房主電腦保持開住，電話掃 QR 後會用 PeerJS/WebRTC 直接連入同一局。
- Server Live：部署 `/api/live-room` 後，會用 Vercel + Upstash Redis 做 production persistence。

掃新版 QR Code 會加入同一個 live room。任何人坐低、離座、調位、記牌、刪紀錄都會同步到同房其他裝置。

Production 建議用 Vercel + Upstash Redis：

詳細照做 checklist 見 [PRODUCTION_LIVE_BACKEND_SETUP.md](PRODUCTION_LIVE_BACKEND_SETUP.md)。

1. 將 repo 部署到 Vercel，保留 `api/live-room.js` serverless function。
2. 建立 Upstash Redis database。
3. 喺 GitHub repo `Settings` > `Secrets and variables` > `Actions` 加 required secrets：
	- `VERCEL_TOKEN`
	- `VERCEL_ORG_ID`
	- `VERCEL_PROJECT_ID`
	- `UPSTASH_REDIS_REST_URL`
	- `UPSTASH_REDIS_REST_TOKEN`
4. Optional secrets：
	- `ALLOWED_ORIGIN=https://dealon0404.github.io`
	- `LIVE_ROOM_TTL_SECONDS=86400`
5. Run GitHub Actions workflow `Deploy Live Backend to Vercel`。
6. Workflow 會打 `/api/live-room?health=1`，確認 `storage` 係 `upstash-redis` 同 `persistent: true`。

如果手動喺 Vercel Project Settings > Environment Variables 加，至少要有：

	- `UPSTASH_REDIS_REST_URL`
	- `UPSTASH_REDIS_REST_TOKEN`
	- `ALLOWED_ORIGIN=https://dealon0404.github.io`，或自訂前端 domain
	- `LIVE_ROOM_TTL_SECONDS=86400`，可按需要調整房間保留時間

GitHub Pages 前端預設會 call `https://mahjong-score-room.vercel.app/api/live-room`。

如果 Vercel domain 唔同，喺 browser console 設定一次：

```js
localStorage.setItem('mahjong-live-api-base', 'https://your-vercel-app.vercel.app')
```

未設定 Upstash 時，API 會用 `memory-dev` fallback，只適合本機/短暫測試，唔係 production 持久同步。GitHub Pages 仍可用 P2P Live fallback，但房主頁面要保持開住。

## 下一步要接後端 Auth

而家 live room 可以 production 同步。若要正式做帳戶、權限同永久保留，可再接 Firebase / Supabase：

- Firebase Auth：Apple ID、Google、Email、遊客
- Firestore：rooms、players、rounds、auditLogs
- Firestore security rules：房內玩家先可以讀寫該房