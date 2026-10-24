# 技術切片驗證記錄

日期：2026-10-18。基線 main：`cc6383e8c4d1634cad33ecd33c46949b643a6a49`。

## 已通過

| 項目 | 結果 |
| --- | --- |
| 獨立依賴 | 以獨立 lockfile 執行 `npm ci --ignore-scripts` 成功；不依賴舊 App 的套件 |
| Domain／設定測試 | 6 項通過：預設日期、時區轉換、DST 拒絕歧義、重疊邊界、公開 key 可用、secret key 阻止構建 |
| SQL／權限測試 | PGlite 13 項通過：邀請、跨旅程拒絕、私表／helper 不可直接讀寫、原子新增、撞期回滾、異組／相接、成員範圍、去重、跨日、旅程界線、撤銷、到期，以及非 superuser 的管理角色可執行 migration |
| TypeScript | `npm run typecheck` 通過 |
| 標準 Next.js | 使用乾淨依賴 `npm run build` 通過，產生 `out/index.html` 與靜態資產；沒有雲端 env，驗證的是未連線設定狀態 |
| 原版回歸 | 根目錄既有 32 項測試通過；原版程式沒有變動 |
| 公開來源檢查 | 僅新增 `apps/guest-spike`；無私人資料／邀請碼／環境檔／本機依賴路徑；依賴下載指向公開 npm registry |

乾淨安裝時發現子 App 原先沿用根目錄 Tailwind PostCSS 設定，已加入本地 plain-CSS config 隔離，修正後構建通過。依賴驗證使用獨立安裝目錄；本機測試用 node_modules 連結未納入版本。

2026-10-19 更新：非 superuser 管理角色測試發現 `ALTER FUNCTION OWNER` 需要 executor 的 SET ROLE 授權，已只向 migration 操作者補上該授權。新增回歸測試確認 anon 只有狹窄 RPC execute，沒有 executor 的 SET ROLE 權限。這不取代真正遠端 Supabase 驗證。

## 2026-10-24 接手狀態

- Cloudflare Pages 已以 commit `c539895c774bc514c6588b49658c2287ac2ff0fa` 成功完成 Next.js build、TypeScript 檢查、靜態輸出及 Pages 發布；現有成功部署保持不動。
- 已建立 `validation/step1-remote` 驗收分支，新增 `npm run test:live-step1`。它一次驗證：A 邀請／選 member／guest credential、B 新增後重新由 Supabase 讀取、C 兩個 guest session 互見資料、D 同一 participant 的兩條並行撞期只有一條成功且失敗不留下 partial event。
- 遠端 Step 1 A–D **尚未標記為通過**。只有真正對獨立 `trip-together-dev` 執行驗收後，才可把下列遠端項目改為 PASS。
- 驗收腳本只接受 publishable／anon key；明確拒絕 secret/service-role key，不輸出 invitation 或 guest credential。私人 invitation 只可從本機／受保護 runtime 環境提供，不可提交 GitHub。

## 尚未完成，不能視為通過

- 尚未完成 `trip-together-dev` 的實際 PostgREST A–D 遠端驗收；本地 PGlite 結果不能取代這一步。
- PGlite 是單連線 PostgreSQL WASM；已執行交易 SQL，不能代替 Supabase 真正雙連線競爭測試。
- `scripts/test-live-race.mjs` 與較完整的 `scripts/test-live-step1.mjs` 已準備；後者應優先作 Step 1 驗收。
- 尚未以遠端結果確認實際 PostgREST gateway、RPC schema cache／限流、公開 key 與訪客 body 的傳輸，以及 Supabase 管理角色實況。
- 未完成手機真機畫面 QA；iPhone／Android、分享邀請、前景更新與手機時間欄位仍待驗收。
- 這不是完整功能重建完成；未做籃子／投票／相片、正式資料匯入或真帳戶。

## 下一步

在獨立 `trip-together-dev` 使用受保護環境提供私人測試 invitation，執行 `npm run test:live-step1`。只有 A–D 全部 PASS 後才合併驗收分支；之後再做兩個實際 browser session／手機 UI 驗收，然後進入 Step 2 功能移植。不要把 invitation、database password、service-role／secret key 放進 GitHub、公開 workflow 或對話內容。
