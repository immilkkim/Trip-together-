# Trip Together｜訪客模式獨立版技術切片

這是下一代產品的**隔離技術驗證**，不是已搬遷的完整旅行 App。根目錄既有網站、舊資料與原有部署不由此切片直接取代。

已實作：標準 Next.js 靜態匯出、private invitation → 選名字、伺服器發出 guest credential、每日活動讀取、原子新增活動、同行者撞期阻止、跨日讀取、同一請求重試去重、畫面在前景定期更新。

尚未實作：完整縱向時間軸、行程修改／刪除、籃子、投票發布、相片、PWA／離線、正式資料搬遷、真正帳戶。

> **驗收狀態只以 [`VALIDATION.md`](./VALIDATION.md) 為準。**  
> README 描述產品邊界、架構與執行方式，不重複宣稱 Step 1 已完成。若 README 與驗收記錄出現狀態差異，以 `VALIDATION.md` 為準。

## 產品決定

- 現階段新增服務費目標 HK$0，依免費額度作小規模驗證；不使用付費試用／自動升級。
- 真正帳戶延後；目前不加入 Google／email login。
- Guest UX 方向：**private invitation link → automatic invite recognition → choose member → server issues random expiring revocable guest credential**。
- 目前持有 invitation 的人仍可選任何名字，包括團長；guest credential 不是本人身份證明。
- 成員 ID 固定，`future_user_id` 位置預留，但尚無 Auth 綁定或認領流程。
- 名字／權限等完整產品規則留待後續階段；本技術切片只驗證 Guest 模式核心資料路徑。

## 本機執行

在子目錄執行：

```powershell
cd apps/guest-spike
npm install
npm test
npm run test:db
npm run dev
```

需 Node 22.13 以上；專案固定使用 Next 16.3.4／React 19.2.6。子目錄是獨立 npm package，不以根目錄舊 App build 當成此切片構建。

```powershell
npm run typecheck
npm run build
```

靜態輸出為 `out/`。未設定 Supabase 公開環境變數時仍可構建，但只顯示未連線狀態，不會以 localStorage 假裝多人同步。

## Supabase 測試專案

目前遠端驗證使用獨立 dev project `trip-together-dev`，只放虛構示範資料。不可把正式旅程資料、database password、service-role／secret key、私人 invitation 或 guest credential 提交 GitHub。

從零建立另一個乾淨測試專案時：

1. 使用獨立 Supabase dev project；先確認免費額度，不啟用不需要的付費資源。
2. 依序執行 `supabase/migrations/` 內 migration。
3. 執行 `npm run seed:prepare`，產生 gitignored 的本機 seed 與 invitation 檔案。
4. seed 只建立虛構資料；每次 invitation 都應為隨機值，不提交 GitHub。
5. 將 `.env.example` 複製為 `.env.local`，只填專案 URL 與 **publishable key**（legacy anon key 亦可）。
6. `npm run dev` 後以私人 invitation 測試加入流程。

只有狹窄 Guest RPC 暴露在 `public` schema。`tt_spike` 是私人 schema，**不要加入 Supabase Exposed schemas**。publishable／anon key 本身不授予私表直接讀寫；RPC 仍須驗 invitation 或 guest credential。

### Migration 注意

目前 repo 包含：

- `202610180001_guest_spike.sql`：建立 Guest Spike schema、tables、roles、RPC 與權限。
- `20261024041608_restrict_rls_auto_enable_execute.sql`：保留內部 `ensure_rls` event trigger，但撤銷外部角色直接執行 `public.rls_auto_enable()` 的權限。

不要把 migration 手動改成「只在現有 DB 可跑」的特殊版本；repo migration 應維持可追蹤、可重現的 schema 來源。

## Cloudflare Pages

Guest Spike 已有獨立 Cloudflare Pages 測試部署。已知成功部署基線是 commit `c539895c774bc514c6588b49658c2287ac2ff0fa`；目前 Step 1 驗收工作在 `validation/step1-remote` 分支，尚未因驗收而取代該部署基線。

部署設定：

- Root directory：`apps/guest-spike`
- Build command：`npm run build`
- Output directory：`out`
- Node：22.13+
- 環境變數：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- 只能使用 publishable／anon key；不可把 secret／service-role key 放入前端環境變數。

候選分享格式：

```text
https://<pages-host>/#invite=<private-invitation>
```

頁面讀取 fragment 後會把它從網址列清除。最終手機分享與多裝置 UX 是否通過，以 `VALIDATION.md` 的 Browser／Mobile 驗收為準。

## 訪客模式與資料邊界

- invitation 與 guest token 只存 SHA-256 雜湊；guest token 以隨機資料產生，只在 join 回應返回明文。
- session 最長 7 日且不超過 invitation 到期；每次操作重新檢查 invite 撤銷／到期、session 與 member 狀態。
- 瀏覽器以 `sessionStorage` 保存當前 guest credential，不保存 invitation；目前沒有 service-worker cache 或離線寫入。
- RPC 的 guest token 在 POST body；不要記錄 request body、invitation URL、guest token 或 debug response。
- 每位 member 最多 10 個有效 guest session，避免無限制建立。
- invitation 撤銷後，既有 session 會在後續請求重新驗證並失效。
- 此切片不是公眾註冊／收費／正式商用身份系統；之後加入真正 account 時，不把「選名字」當身份驗證。

## 排程交易與撞期規則

`tt_guest_create_event` 在一項 DB transaction 中執行：

session 驗證 → trip row lock → 再驗權限 → idempotency → 驗時間／member → 查撞期 → 寫 event／participants／receipt → 增加 `changeSeq`。

anon 沒有直接 table write。

同一 participant 使用 `[start,end)` 撞期判定：

- 10:00–12:00 與 11:00–13:00：撞期。
- 10:00–12:00 與 12:00–13:00：允許。
- 不同 participant：可同時段。

跨日仍是一個 event ID。API 時間以帶 offset 的絕對時間判斷；前端輸入按旅程 IANA timezone 解析，DST 歧義／不存在 wall time 先拒絕。

目前以 Supabase PostgREST RPC 驗證 DB 能力。錯誤以 SQL message machine code 傳回；**尚未實作最終 `/v1` HTTP API contract 或 Edge Function gateway**，因此現有 RPC 名稱不視為最終商用 API。

## 測試

本地：

```powershell
npm test
npm run test:db
npm run typecheck
npm run build
```

遠端 Step 1：

```powershell
npm run test:live-step1
```

聚焦 concurrent race：

```powershell
npm run test:live-race
```

遠端腳本只可在受保護 runtime 執行，並需要明確 opt-in。只能使用 publishable／anon key；私人 invitation 只放在受保護環境，不寫入 GitHub 或公開 workflow。

PGlite 測試能驗 SQL／權限／transaction 行為，但只有單連線，**不能取代真正兩條遠端 HTTP/PostgREST connection 的 race 驗證**。

## Step 1 與 Step 2 邊界

Step 1 的完成條件、A／B／C／D 實際結果、Security Advisor 結果、仍待 browser／mobile 與 concurrent HTTP race 的項目，全部記錄在 [`VALIDATION.md`](./VALIDATION.md)。

在 Step 1 未全部完成前：

- 不合併仍有 blocker 的驗收 PR；
- 不把 Guest Spike 宣稱為完整產品；
- 不搬遷正式六人旅程資料；
- 不進入 Step 2 的 timeline／basket／voting／leader publish／完整 edit permissions 等功能移植。

## 官方參考

- https://nextjs.org/docs/app/guides/static-exports
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/getting-started/api-keys
