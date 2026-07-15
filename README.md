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

## 下一步要接後端

而家係可運行本機 MVP。要做到真正多人跨機同步同永久保留，需要接 Firebase：

- Firebase Auth：Apple ID、Google、Email、遊客
- Firestore：rooms、players、rounds、auditLogs
- Firestore security rules：房內玩家先可以讀寫該房

接 Firebase 之後，其他玩家掃房主 QR Code 先可以喺自己部機即時加入同同步。