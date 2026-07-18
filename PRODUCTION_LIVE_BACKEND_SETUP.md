# Production Live Backend Setup

呢份 checklist 用嚟開通真正 production live room persistence。完成後，就算房主熄 screen、關 Safari、或者離開 app，其他玩家仍然可以繼續用同一間房。

而家前端已經部署喺 GitHub Pages：

```text
https://dealon0404.github.io/mahjong-score-room/
```

Production backend 會用：

- Vercel：hosting `/api/live-room` serverless API
- Upstash Redis：保存房間 state
- GitHub Actions：手動 deploy backend，同時驗證 Upstash persistence

## 1. Create Upstash Redis

1. 去 Upstash dashboard，建立一個 Redis database。
2. Region 揀近香港/亞洲嘅 region，如果有得揀就優先 Singapore / Asia。
3. 入 database details，搵 REST API credentials。
4. 記低以下兩個 value，之後只放入 GitHub Secrets，唔好貼喺 chat 或 commit 入 repo：
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## 2. Create Vercel Project

1. 去 Vercel dashboard，import GitHub repo `Dealon0404/mahjong-score-room`。
2. Project name 可以用 `mahjong-score-room`。
3. Framework preset 用 Vercel 自動偵測即可；呢個 repo 主要需要 `/api/live-room.js` serverless function。
4. 完成第一次 deploy 後，記低 production domain，例如：

```text
https://mahjong-score-room.vercel.app
```

如果 Vercel 俾咗另一個 domain，之後前端要設定 `mahjong-live-api-base`。

## 3. Get Vercel IDs And Token

GitHub Actions workflow 需要三個 Vercel secret：

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

取得方法：

1. `VERCEL_TOKEN`：Vercel dashboard > Account Settings > Tokens > Create Token。
2. `VERCEL_ORG_ID`：Vercel project > Settings > General，Team ID / Org ID。
3. `VERCEL_PROJECT_ID`：Vercel project > Settings > General，Project ID。

只將呢啲值加入 GitHub Secrets，唔好貼喺 chat 或 commit 入 repo。

## 4. Add GitHub Actions Secrets

去 GitHub repo：

```text
Settings > Secrets and variables > Actions > New repository secret
```

加入 required secrets：

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

建議同時加入 optional secrets：

```text
ALLOWED_ORIGIN=https://dealon0404.github.io
LIVE_ROOM_TTL_SECONDS=86400
```

`LIVE_ROOM_TTL_SECONDS=86400` 代表房間 state 保留 24 小時。想保留兩日可以用 `172800`。

## 5. Run Backend Deploy Workflow

去 GitHub repo：

```text
Actions > Deploy Live Backend to Vercel > Run workflow
```

Run 完之後打開 workflow log，最後一步 `Verify persistent live backend` 應該見到類似：

```json
{
  "ok": true,
  "source": "live-room",
  "storage": "upstash-redis",
  "persistent": true,
  "ttlSeconds": 86400
}
```

如果 `persistent` 唔係 `true`，代表 Vercel 未讀到 Upstash env vars，或者 secret name 打錯。

## 6. Connect GitHub Pages Frontend

GitHub Pages 前端預設會 call：

```text
https://mahjong-score-room.vercel.app/api/live-room
```

如果你 Vercel production domain 就係 `https://mahjong-score-room.vercel.app`，唔需要做額外設定。

如果 Vercel domain 唔同，開 GitHub Pages app，喺 browser console run 一次：

```js
localStorage.setItem('mahjong-live-api-base', 'https://your-vercel-app.vercel.app')
```

之後 refresh app，再開新房 QR。

## 7. Verify With Two Devices

1. 電腦開 `https://dealon0404.github.io/mahjong-score-room/`，開房。
2. 電話掃 QR 入房。
3. 其中一邊改名、坐位、記一鋪。
4. 另一邊應該 1-2 秒內同步。
5. 關咗房主 browser，再用另一部機 refresh 同一條 invite link；如果 backend 已經 persistent，房間 state 應該仍然喺度。

## 8. Enable Real Tile Recognition

`影相計番` 要真係讀到係咩牌，需要 Vercel backend 有 OpenAI API key。

去 Vercel project：

```text
Settings > Environment Variables
```

加入：

```text
OPENAI_API_KEY=你的 OpenAI API key
OPENAI_VISION_MODEL=gpt-4o
```

`gpt-4o` 認牌會比 `gpt-4o-mini` 穩定；如果想慳成本可以之後改用 `gpt-4o-mini` 試。

加完 env vars 後要 Redeploy。完成後打開：

```text
https://mahjong-score-room.vercel.app/api/analyze-tiles?health=1
```

成功應該見到：

```json
{
  "ok": true,
  "source": "analyze-tiles",
  "model": "gpt-4o",
  "openaiConfigured": true
}
```

如果 `openaiConfigured` 係 `false`，影相計番只會跌返 fallback，唔會真認牌。

## 9. Enable Opt-in Training Photo Collection

如果想用 app 用戶自願提供嘅相片幫手 fine-tune YOLO，需要 Vercel Blob。

1. 去 Vercel project > Storage。
2. Create Blob store。
3. 將 Blob read/write token 加到 Environment Variables：

```text
BLOB_READ_WRITE_TOKEN=你的 Vercel Blob token
```

4. Redeploy。
5. 打開：

```text
https://mahjong-score-room.vercel.app/api/training-samples?health=1
```

成功應該見到：

```json
{
  "ok": true,
  "source": "training-samples",
  "storage": "vercel-blob",
  "configured": true
}
```

App 只會喺用戶勾選同意，並且按 Accept 使用分析結果後，先上載該張相。提示用戶避免影到人樣、電話號碼、收據、地址等個人資料。

Fine-tune YOLO 步驟見 [vision-service/TRAINING.md](vision-service/TRAINING.md)。

## Troubleshooting

### Workflow says missing secret

去 GitHub repo `Settings > Secrets and variables > Actions` 檢查 secret name，必須完全一樣。

### Health check returns HTML or 404

通常係 Vercel project 未 deploy 到呢個 repo，或者 domain 唔係你以為嗰個。先打開：

```text
https://your-vercel-app.vercel.app/api/live-room?health=1
```

應該要見到 JSON，而唔係 Vercel 404 page。

### Health check shows memory-dev

Vercel function 未讀到 Upstash env vars。檢查：

- GitHub Secrets 名字有冇打錯
- Workflow log 入面 deploy step 有冇成功帶 `--env UPSTASH_REDIS_REST_URL` 同 `--env UPSTASH_REDIS_REST_TOKEN`
- Vercel Project Settings > Environment Variables 有冇同名 env vars

### Phone can join only while host is open

即係前端跌返去 P2P fallback，server backend 未成功 persistent。以 `/api/live-room?health=1` 結果為準；production 應該係：

```json
{
  "persistent": true,
  "storage": "upstash-redis"
}
```
