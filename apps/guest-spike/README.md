# Trip Together｜訪客模式獨立版技術切片

這是下一代產品的**隔離技術驗證**，不是已搬遷的完整旅行 App。根目錄既有網站、D1／R2、私人六人資料與部署設定均未改動。

已實作：標準 Next.js 靜態匯出、邀請碼選名字、伺服器發出訪客憑證、每日活動讀取、原子新增活動、同行者撞期阻止、跨日讀取、同一請求重試去重、畫面在前景定期更新。

尚未實作：完整縱向時間軸、行程修改／刪除、籃子、投票發布、相片、PWA／離線、舊資料搬遷、真正帳戶。這些功能仍由原有六人版提供。

## 產品決定

- 現階段新增服務費目標 HK$0，依免費額度小規模測試；不使用付費試用／自動升級。
- 真正帳戶延後，成熟後、對陌生客戶開放或商用前才加入；之後再做 Expo 與平台上架。
- 現在持有邀請碼的人仍可選任何名字，包括團長。訪客憑證不是本人身份證明。
- 成員 ID 固定，`future_user_id` 位置預留，但尚無 Auth 綁定或認領流程。
- 名字編輯範圍尚待審閱；此切片不修改原版權限。

## 本機執行（Windows／Portable Node 可用）

在這個子目錄開終端機：

```powershell
cd apps/guest-spike
npm install
npm test
npm run test:db
npm run dev
```

需 Node 22.13 以上；專案固定使用 Next 16.3.4／React 19.2.6。子目錄是獨立 npm package，別以根目錄的 Vinext build 當成此切片構建。

```powershell
npm run typecheck
npm run build
```

靜態輸出為 `out/`。未設定雲端時也能構建，但只顯示「未連接測試專案」，不會以 localStorage 假裝多人已同步。

## 免費測試專案準備

只在**全新、獨立、沒有真實旅程資料的 Supabase Free 專案**使用以下 SQL。尚未在遠端執行本 migration。不要在原來網站的資料庫或已有產品的 Supabase 專案貼上。

1. 建立／選擇自己的免費測試專案，先核對帳戶免費專案額度。不要開付費試用。
2. 在 SQL Editor 執行 `supabase/migrations/202610180001_guest_spike.sql`。它是一次性 migration；重跑會因 schema 已存在而失敗，不能靠刪正式資料解決。
3. 本機執行 `npm run seed:prepare`，產生已忽略的 `demo-seed.local.sql` 及 `invite-code.local.txt`。
4. 在同一測試專案執行該 seed SQL，只建立虛構示範資料。每次產生都是不同隨機碼；不要把 seed 或碼提交 GitHub。
5. 將 `.env.example` 複製為 `.env.local`，填專案 URL 及 **publishable key**（舊式 anon key 亦可）。**絕對不要填 secret／service_role key**。構建前有檢查，但若把 secret 自行貼進公開檔案仍須即時撤銷該 key。
6. `npm run dev` 後貼上 `invite-code.local.txt` 的碼，選團友。

只有公開 RPC 暴露在 public schema。`tt_spike` 是私人 schema，**不要加到 Supabase Exposed schemas**。公開 publishable／anon key 本身不授予表讀寫；每個 RPC 仍須驗邀請或訪客憑證。

以 Supabase API 載入新 RPC 若有短暫 schema cache 未更新，先等快取刷新／檢查 API 設定，不要因此開放私人 schema 或撤掉授權。

## Cloudflare Pages 免費部署

這一步仍待擁有者的帳戶及遠端驗證；本 PR 沒有建立 Pages 專案，也沒有修改舊網站部署。

- 連接此 GitHub 分支，建立獨立測試 Pages 專案。
- Root directory：`apps/guest-spike`。
- Build command：`npm run build`；output directory：`out`。
- 設定 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，只能填測試專案公開 key；使用 Node 22.13 以上。
- 先用預設 `pages.dev` 網址，不購買域名。分支／production preview 選擇依實際帳戶畫面確認，不把根目錄舊 App 自動搬過來。
- 這個切片只有靜態 `/` 路由；候選分享格式為 `https://測試網址/#invite=邀請碼`，頁面讀取後清除 fragment。若分享渠道丟碼，手動貼碼仍可用；真機分享測試尚未完成。

## 訪客模式與資料邊界

- 邀請及訪客 token 只存 SHA-256 雜湊；訪客 token 用兩個隨機 UUID 產生，只在加入回應返回明文。
- session 最長 7 日且不超過邀請到期；每次操作檢查邀請撤銷／到期、session 及成員狀態。
- 瀏覽器用 sessionStorage 保存當前訪客憑證，不保存邀請碼；沒有 service-worker cache、沒有離線寫入。新分頁／主畫面可能要重新選名，不宣稱永久記住身份。
- 私人 RPC 帶訪客 token 在 POST body；不要記錄 body、邀請 URL、token 或 debug response。公開 REST key 是平台識別，不是旅程通行證。
- 每位成員最多 10 個有效訪客 session，避免無限制建立。短期測試後刪除測試專案；若持續試用，要另外實作 receipt／過期 session 清理、日誌及限流。
- 撤銷邀請：測試管理員在 SQL Editor 將對應 `tt_spike.invites.revoked_at` 設為 `now()`；既有 session 下次請求失效。此切片沒有團長管理 UI，不聲稱可立即撤回已下載資料。
- 未對公眾註冊、收費或上架準備；日後新增真正帳戶時撤銷訪客入口，而不是把選名字當本人驗證。

## 排程交易

`tt_guest_create_event` 在一項 DB transaction 中驗 session → 鎖 trip row → 重驗權限 → 去重 → 驗時間／同旅程成員 → 查撞期 → 寫 event、participants、receipt → 增加 seq。沒有直接 anon 表寫入。

同一團友採 `[start,end)` 檢查；不同團友可並行；午夜結束不在次日產生零長活動。跨日只有一個 event ID。API 時間帶 offset，以實際時刻判斷；前端輸入按旅程 IANA 時區解析，夏令時間歧義先拒絕。

這次用 Supabase PostgREST RPC 直接驗證 DB 能力。錯誤以 SQL message machine code 傳回（PostgREST 一般為 400），**尚未實作完整 `/v1` HTTP status 契約或 Edge Function gateway**。對外商用 API 會另以 guest／account 身份介面封裝；不能把這份 RPC 名稱宣稱已是最終產品 API。

## 測試與剩餘驗收

本地驗證記錄見 `VALIDATION.md`。`test:db` 用 PGlite 執行真正 PostgreSQL SQL 及權限，不是 JavaScript 假資料庫；但它只有單連線，**不能證明兩條遠端連線的鎖競爭正確**。

遠端部署後至少做：

1. 兩手機／兩個瀏覽器分別選團友一與團友二；各新增不同活動，另一端按更新或等前景 15 秒可見。
2. 同時為團友一新增 10:00–12:00 與 11:00–13:00，預期只一個成功、另一個撞期。
3. 不同小組同時段成功；12:00 接 12:00 成功。
4. 同一請求 timeout 後原 key 重試，事件筆數維持一；切換名字後舊回應不可覆蓋新身份資料。
5. 確認匿名直接查表／調私人 helper 不可用；其他旅程 member ID 不可加入本旅程。
6. 撤銷邀請、session 到期、手機返回前景、邀請 fragment／手動貼碼、長名字／標題、日期欄位逐項測試。

另有可選 `npm run test:live-race`，僅在 prepare-demo 產生的獨立示範旅程執行。於本機環境設定 `TT_ALLOW_TEST_WRITE=yes`、`TT_TEST_INVITE`；預設測試日 2030-01-05 必須無活動，可用 `TT_TEST_DATE` 換另一空日。它發出兩個並行 RPC，檢查只新增一項及重試去重，保留示範活動作核對，最後撤銷測試 session。此腳本尚未對遠端執行；不得把私人測試碼寫到公開 workflow。

兩手機驗收及真正雲端測試通過之前，不搬遷六人資料、不取代原站。使用者只需提供／設定自己的測試帳戶，**不要在對話或 GitHub 貼 secret key、資料庫密碼或私人邀請碼**。

官方依據：

- https://nextjs.org/docs/app/guides/static-exports
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/getting-started/api-keys
