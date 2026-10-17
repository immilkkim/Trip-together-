# Trip Together：獨立測試站搬遷

狀態：部署程式與還原工具已準備；尚未連接擁有者的 Cloudflare 帳戶，沒有建立遠端資源或發布獨立網站。第一版公開基準為 `cc6383e8c4d1634cad33ecd33c46949b643a6a49`，保存在 `checkpoint/v0.1.0` 分支（分支，並非 release tag）。

## 範圍與架構

沿用現有介面、姓名選擇、資料模型、投票及撞期邏輯，部署到擁有者自己的 Cloudflare Workers、D1 及 R2。測試站與舊站分開，沒有自動轉址或同步；正式切換前，舊站仍是唯一正式資料來源。

現有 API 已直接使用 Cloudflare Workers binding、D1 Drizzle 驅動及 R2；延續此架構可減少重寫，不必先轉換資料庫或原生 App。獨立構建不載入 Sites 插件，不需要 ChatGPT 登入或 Sites 網關。原有 `dev` / `build` 及 Sites 發布流程保留。

登入仍是「持有私人連結 → 選擇姓名」。持有連結的人可選擇團長姓名；這是既有信任模式，並非真正帳戶身分驗證。日後開放陌生團體才另行設計帳戶與伺服器權限，本階段不更改產品決定。

## 費用界線（2026-10-17 查核）

| 項目 | 免費額度／限制 |
| --- | --- |
| Workers Free | 每日 100,000 次請求；每次 CPU 10 ms，SSR 必須實測 |
| D1 Free | 每日讀取 500 萬列、寫入 10 萬列；合計 5 GB |
| R2 Standard | 每月 10 GB-month、100 萬 Class A、1,000 萬 Class B |

免費額度不是永久零成本保證，亦受同帳戶其他用量影響。不自動升級付費方案。R2 須完成 subscription checkout，付款資料要求以實際帳戶畫面為準。

- [Workers 定價](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 定價](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 定價](https://developers.cloudflare.com/r2/pricing/)
- [R2 啟用程序](https://developers.cloudflare.com/r2/get-started/)
- [Vite 插件 API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)

## 帳戶及本機準備

擁有者註冊／登入自己的 Cloudflare 帳戶。先用免費 workers.dev 網址，不購買域名。不要把登入密碼、API token、私人邀請碼或備份貼進公開 GitHub。

專案根目錄使用 Node 24、lockfile 指定的 pnpm；公司電腦可以沿用 portable 工具。先執行：

```text
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm independent:configure
pnpm independent:build
pnpm independent:dry-run
```

configure 建立 gitignored `wrangler.independent.json`。未填帳戶資料時使用假 D1 ID，只供本機構建及 dry run；preflight / deploy 會拒絕它。不要提交 `.env`、`.dev.vars`、此設定檔、`backups/`、`restore/` 或 `*.backup.sql`。

## 建立測試資源

每次遠端操作前核對 whoami；不要重用正式網站資料庫或 bucket。

```text
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 create trip-together-staging
pnpm exec wrangler r2 bucket create trip-together-staging-photos
```

把回傳的 D1 ID 填入（替換佔位字 YOUR_D1_DATABASE_ID）：

```text
pnpm independent:configure --database-id YOUR_D1_DATABASE_ID
pnpm exec wrangler d1 migrations apply trip-together-staging --remote --config wrangler.independent.json
pnpm exec wrangler secret put TRIP_INVITE_TOKEN --config wrangler.independent.json
```

在 secret put 的互動提示輸入新測試站專用邀請碼；不要使用 `local-demo-invite`，不重用舊站邀請碼。新站的 `TRIP_REQUIRE_CONFIGURATION=true` 會在欠 secret 時拒絕 API 授權；資料庫故障時 `/api/state` 回傳 503，避免成功回傳示範資料。`TRIP_STORAGE_ID=demo-trip` 是資料表 key，可與 payload 內原旅程 ID 不同。

## 私人備份與還原

備份含 state.json、manifest.json、README.txt 及目前資料引用的 uploads/ 相片。這是目前單一旅程的應用快照，不是完整 D1 SQL dump 或 R2 全 bucket 備份；外部圖片只保留來源網址，未引用舊相片不包含。正式切換前必須重新匯出最新快照。

解壓至 gitignored `backups/pre-migration/`，保留相對路徑：

```text
pnpm migration:restore-sql backups/pre-migration restore/staging.backup.sql demo-trip
```

工具先驗證 state、相片 SHA-256 及引用完整性，再產生 SQL；保留所有資料、ID 和 revision，updated_at 設為準備匯入時間。不自行修正既有撞期，不呼叫行程編輯 API。SQL 用普通 INSERT，已有同 key 時會失敗，不覆蓋。

**第一次以有效邀請讀取新站前匯入**，因為空資料庫首次讀取會建立示範資料：

```text
pnpm exec wrangler d1 execute trip-together-staging --remote --config wrangler.independent.json --file restore/staging.backup.sql
```

若已有示範資料，不要刪除硬闖。建立另一個空測試資料庫，或在設定改用全新 TRIP_STORAGE_ID，使用相同 key 重新準備 SQL，再重新構建與部署。

有 uploads/ 時，按 manifest 的原 key 上傳遠端 R2，保留 `/api/uploads/<key>`：

```text
pnpm exec wrangler r2 object put trip-together-staging-photos/PHOTO_KEY --file backups/pre-migration/uploads/PHOTO_KEY --content-type image/jpeg --remote --config wrangler.independent.json
```

把 PHOTO_KEY 替換為 manifest 內 key；PNG/WebP 用正確 Content-Type。工具只準備 SQL，不自動改遠端資料或上傳相片。

## 發布與驗收

```text
pnpm independent:build
pnpm independent:preflight
pnpm independent:dry-run
pnpm independent:deploy
```

發布必須使用生成的 dist/server/wrangler.json（腳本已固定路徑）。preflight 核對 staging 名稱、非假 D1 ID、D1/R2 binding、嚴格旗標及無 Sites hosting metadata；不會證明遠端資源或 secret 已存在。使用 Wrangler 實際返回網址，不能猜測帳戶 subdomain。

開啟「實際新網址/join/新測試邀請碼」。不同網站來源不共用身分及離線快取，需要重新選擇姓名及加入主畫面。

記錄 commit、實際 URL、資料 revision、裝置和瀏覽器版本，再用兩部真手機驗收：

- 有效邀請可進入；無效／未設定 secret 不可讀寫。
- 重新整理仍為匯入資料；第二部手機取得更新；舊 revision 儲存回傳 409，不覆蓋新內容。
- 新增團友、改名、活動增刪改與既有權限操作正常。
- 籃子新增 → 邀請／投票 → 參加撞期提醒 → 團長發布 → 生成活動卡。
- 籃子直接加入、改日期、跨日分段、回籃子、完整標題、詳情及短卡捲動正常。
- 相片上載及另一手機讀取；還原相片核對相同 key 及 bytes。
- iPhone Safari／Android Chrome 的窄螢幕、時間欄位、標題與按鈕不重疊。
- 加入主畫面後可啟動；現版離線僅已載入文字快取，尚非完整離線行程包，不承諾離線相片、地圖或修改同步。
- 查 Workers 錯誤及 CPU/用量，驗證免費方案；未實測不保證零成本或所有香港網絡可用。

既有地點搜尋仍固定澳洲。正式切換前須核對公共 Nominatim 的全 App 每秒限流、伺服器快取、署名與不得 autocomplete 的[使用政策](https://operations.osmfoundation.org/policies/nominatim/)。本階段不新增搜尋供應商。

## 切換、回復與分工

驗收前只在舊站編輯正式資料。切換：暫停編輯 → 匯出最新快照 → 新空資料庫／全新 storage key 還原 → 核對筆數、revision、相片及邀請 → 分享新址。之後通知團友只用新站，避免資料分岔；舊站保留，不刪資源。

程式碼回滾不會回滾 D1/R2。若新站已有編輯，切回舊站前先備份並處理差異，不可直接用舊快照覆蓋。

- 本對話：產品範圍、費用、帳戶準備及驗收。
- Codex：分支實作、帳戶設定驗證、構建、部署、讀寫及還原檢查，提交 PR。
- 擁有者：Cloudflare 登入、R2 啟用條件、新 secret、真手機驗收，最後決定正式切換。

下一個 Task：`Trip Together｜獨立測試站部署與手機驗收`。沿用本搬遷分支／PR；不新增功能、不重做第一版、不動舊站正式資料。
