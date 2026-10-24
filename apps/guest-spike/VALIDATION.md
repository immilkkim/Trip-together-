# Trip Together｜Step 1 驗收記錄

> **本檔是 `apps/guest-spike` Step 1 的唯一驗收真相來源（source of truth）。**  
> README 只描述產品／執行方式；roadmap 只描述未來方向。任何「已完成／PASS／仍待驗證」狀態，以本檔為準。

最後更新：2026-10-24。

## 1. 基線與分支

- 舊 `main` 基線：`cc6383e8c4d1634cad33ecd33c46949b643a6a49`。
- 現行 Guest Spike／Cloudflare 已部署基線：`rebuild/next-supabase-guest-spike`，commit `c539895c774bc514c6588b49658c2287ac2ff0fa`。
- Step 1 驗收分支：`validation/step1-remote`。
- Draft PR：#5 `Add remote Step 1 acceptance validator`。
- Supabase dev project：`trip-together-dev`（只用虛構測試資料；不可放正式旅程資料）。
- Cloudflare Pages 測試站已由 `c539895...` 成功完成 Next.js build、TypeScript、靜態輸出與 Pages 發布。

**重要：** `main` 目前不是已部署 Guest Spike 的真實基線。未完成 Step 1 前，不把驗收分支直接視為正式主線，也不合併 PR #5。

## 2. 狀態定義

| 狀態 | 定義 |
| --- | --- |
| PASS | 已在對應環境取得實際證據，可視為通過 |
| PARTIAL | 核心行為已證實，但仍欠指定情境／層級驗證 |
| PENDING | 尚未取得足夠證據，不可宣稱完成 |

## 3. 本地／構建驗證

| 項目 | 狀態 | 證據／備註 |
| --- | --- | --- |
| 獨立依賴 | PASS | 子 App 以獨立 lockfile 執行 `npm ci --ignore-scripts`；不依賴舊 App 套件 |
| Domain／設定測試 | PASS | 6 項：預設日期、時區轉換、DST 歧義拒絕、重疊邊界、公開 key 可用、secret key 阻止構建 |
| SQL／權限測試 | PASS | PGlite 13 項：邀請、跨旅程拒絕、私表/helper 不可直接讀寫、原子新增、撞期回滾、異組／相接、成員範圍、去重、跨日、旅程界線、撤銷、到期、非 superuser migration |
| TypeScript | PASS | `npm run typecheck` |
| Next.js build | PASS | `npm run build` 產生 `out/index.html` 與靜態資產 |
| 原版回歸 | PASS | 根目錄既有 32 項測試通過；Guest Spike 未改原版程式 |
| 公開來源檢查 | PASS | 無 invitation、guest token、database password、service-role／secret key、私人 env 或本機依賴路徑提交 GitHub |

補充：子 App 已用本地 plain-CSS PostCSS config 與根目錄 Tailwind 設定隔離。2026-10-19 亦補上非 superuser migration 所需的有限 SET ROLE 授權，並確認 anon 沒有 executor SET ROLE。

## 4. 遠端 Supabase Step 1 驗收（2026-10-24）

測試直接在 `trip-together-dev` 執行。驗收使用臨時、短期 invite；明文 invitation／guest credential 沒有提交 GitHub，也不記錄在本檔。

### A — 加入旅程

**PASS**

- anon 可透過 `tt_guest_open` 以有效 invitation 取得示範旅程與 6 位 member。
- 兩個不同 member 均可透過 `tt_guest_join` 取得有期限 guest credential。
- 驗證後臨時 session 已撤銷／登出。

### B — 新增活動並持久化

**PASS**

- Guest 1 透過 `tt_guest_create_event` 新增活動。
- 重新呼叫 `tt_guest_snapshot` 後，同一 event ID／title 仍由 Supabase 返回。
- `changeSeq` 由 0 增至 1。
- 證明資料不是 browser/localStorage 假同步。

### C — 兩個 Guest Session 互見資料

**PASS（backend/source-of-truth 層）**

- Guest 2 建立另一活動後，Guest 1 的 snapshot 可讀到該活動。
- `changeSeq` 由 1 增至 2。
- 兩個不同 credential 均以 Supabase 為共同 source of truth。

**仍未涵蓋：** 真實 browser／incognito／手機的 15 秒 foreground polling 與 visibility-return UI 更新；該項列於第 7 節。

### D — 撞期保護

**PARTIAL：server/database protection 已 PASS；真正雙連線 HTTP race 仍 PENDING**

已證實：

- Guest 1 先建立一項活動。
- Guest 2 再嘗試為同一 participant 建立重疊活動時，後端返回 `SCHEDULE_CONFLICT`。
- DB 查核只有 1 個對應 event 及 1 組 participant；失敗請求沒有 partial write。
- `changeSeq` 沒因失敗請求額外增加。
- 因此另一個 client／credential 無法單靠改前端或重新整理繞過 server/database 撞期規則。

尚未證實：

- 兩條**真正同時**的獨立 HTTP/PostgREST request 競爭同一 participant 時，是否必定只有一條成功、另一條在 row lock 後得到 `SCHEDULE_CONFLICT`。
- 本地執行 container 當時沒有外網 DNS，無法由該 runtime 直接跑 `test:live-race`／`test:live-step1` 的 concurrent HTTP 部分；這是測試執行環境限制，**不可當成產品 PASS，也不可當成產品 FAIL**。

## 5. 遠端資料庫安全檢查

### Guest RPC

Supabase Security Advisor 會把以下 5 個 `SECURITY DEFINER` RPC 標示為 anon 可執行：

- `tt_guest_open`
- `tt_guest_join`
- `tt_guest_snapshot`
- `tt_guest_create_event`
- `tt_guest_leave`

這 5 個是 Guest Spike **刻意公開的狹窄入口**。私有 `tt_spike` schema 不對 anon 直接開表權限；每個 RPC 仍自行驗 invitation／guest credential。

### `rls_auto_enable()` 權限修正

2026-10-24 Security Advisor 另發現 `public.rls_auto_enable()` 是 `SECURITY DEFINER`，而預設 PUBLIC EXECUTE 令 anon／authenticated 也有 execute 權限。

此 function 是內部 `ensure_rls` event trigger 使用，**應保留 function 與 trigger，但不需要外部角色 execute**。

已在 `trip-together-dev` 套用 migration：

- `20261024041608_restrict_rls_auto_enable_execute`
- 撤銷 `PUBLIC`／`anon`／`authenticated` 對 `public.rls_auto_enable()` 的 EXECUTE。
- 重新跑 Security Advisor 後，該 finding 已消失；只剩上述 5 個刻意公開的 guest RPC warning。

Repo 必須保留同等 migration，避免 DB／GitHub drift。

## 6. 測試資料清理狀態

2026-10-24 遠端驗收後：

- active test sessions：0。
- 臨時驗收 invite：已 revoked。
- 保留 3 個明確以 `STEP1 remote ...` 命名的合成活動作 audit／下一輪 UI 核對。
- 不含正式旅程或個人資料。

不要為了重跑測試而刪除未知活動；驗收腳本應選空白日期，或明確使用新的測試資料。

## 7. Step 1 尚欠項目

### 7.1 真正雙連線 race

**PENDING**

使用兩個獨立 HTTP/PostgREST request，同時為同一 participant 建立重疊活動：

- 預期恰好 1 個成功；
- 另 1 個必須 `SCHEDULE_CONFLICT`；
- snapshot／DB 最終只有 1 個 event；
- 失敗請求不得留下 participant／receipt／額外 `changeSeq`；
- 成功請求用同一 idempotency key 重試時不得新增第二個 event。

優先使用：

```bash
npm run test:live-step1
```

可選聚焦 race：

```bash
npm run test:live-race
```

兩者只可在受保護 runtime 使用 publishable／anon key 及私人測試 invitation；不得把 invitation、guest token 或 privileged key 寫入 GitHub／公開 workflow。

### 7.2 真實 Browser／Mobile UI

**PENDING**

至少完成：

1. Browser A（普通視窗）與 Browser B（incognito／另一裝置）分別加入不同 member。
2. A 新增活動，B 在前景 polling／重新回到前景後可看到，而不是依賴 A 的 local state。
3. B 新增活動，A 同樣可看到。
4. 同 participant 撞期在 UI 有合理提示，而且 server 仍拒絕繞過。
5. 不同 participant 同時段允許。
6. 精確邊界 `[start,end)`：例如 10:00–12:00 與 12:00–13:00 允許。
7. 手機邀請 fragment → 自動辨識 invite → 選 member → 成功進旅程。
8. 切到背景再回前景，資料重新同步。

## 8. Step 1 完成門檻

只有以下全部滿足，才可把 Step 1 標成 **COMPLETE**：

- [x] A invitation → member → guest credential
- [x] B create → Supabase persist → re-read
- [x] C 兩個 guest credential 互見 Supabase 資料
- [x] D server/database 對另一 client 的撞期繞過保護
- [ ] D concurrent HTTP race：同 participant 同時提交只一個成功
- [ ] Browser／incognito 多 session UI 同步
- [ ] 手機／foreground-return 基本驗收
- [ ] `VALIDATION.md` 更新最終證據
- [ ] PR #5 由 Draft 轉 Ready，確認無未解 blocker 後才合併到 `rebuild/next-supabase-guest-spike`

**在以上 checkbox 全部完成前，不進 Step 2 功能移植。**

## 9. Step 2（只作界線，不在本階段執行）

Step 1 完成後才開始：完整 timeline、basket、invite UX、voting、leader publish、edit/delete permissions、完整 6 人多用戶旅程、其後真實旅程資料驗證。

現階段不加入 Google／email login；既定 Guest UX 方向維持：**private invitation link → automatic invite recognition → choose member → server issues random expiring revocable guest credential**。
