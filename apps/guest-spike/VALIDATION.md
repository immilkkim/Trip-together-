# 技術切片驗證記錄

日期：2026-10-18。基線 main：`cc6383e8c4d1634cad33ecd33c46949b643a6a49`。

## 已通過

| 項目 | 結果 |
| --- | --- |
| 獨立依賴 | 以獨立 lockfile 執行 `npm ci --ignore-scripts` 成功；不依賴舊 App 的套件 |
| Domain／設定測試 | 6 項通過：預設日期、時區轉換、DST 拒絕歧義、重疊邊界、公開 key 可用、secret key 阻止構建 |
| SQL／權限測試 | PGlite 12 項通過：邀請、跨旅程拒絕、私表／helper 不可直接讀寫、原子新增、撞期回滾、異組／相接、成員範圍、去重、跨日、旅程界線、撤銷、到期 |
| TypeScript | `npm run typecheck` 通過 |
| 標準 Next.js | 使用乾淨依賴 `npm run build` 通過，產生 `out/index.html` 與靜態資產；沒有雲端 env，驗證的是未連線設定狀態 |
| 原版回歸 | 根目錄既有 32 項測試通過；原版程式沒有變動 |
| 公開來源檢查 | 僅新增 `apps/guest-spike`；無私人資料／邀請碼／環境檔／本機依賴路徑；依賴下載指向公開 npm registry |

乾淨安裝時發現子 App 原先沿用根目錄 Tailwind PostCSS 設定，已加入本地 plain-CSS config 隔離，修正後構建通過。依賴驗證使用獨立安裝目錄；本機測試用 node_modules 連結未納入版本。

## 尚未完成，不能視為通過

- 沒有連接使用者 Supabase／Cloudflare 帳戶，沒有建立資源、執行遠端 migration、啟用付費或產生新網址。
- PGlite 是單連線 PostgreSQL WASM；已執行交易 SQL，不能代替 Supabase 真正雙連線競爭測試。
- `scripts/test-live-race.mjs` 已準備，尚未對遠端執行。
- 尚未測試實際 PostgREST gateway、雲端管理角色權限、RPC schema cache／限流、公開 key 與訪客 body 的遠端傳輸。
- 未做瀏覽器或手機畫面 QA；本環境缺少指定瀏覽器檢查能力，未啟動預覽或替代瀏覽器。iPhone／Android、分享邀請、前景更新與手機時間欄位仍待驗收。
- 這不是完整功能重建完成；未做籃子／投票／相片、正式資料匯入或真帳戶。

## 下一步

擁有者建立獨立 Supabase Free 測試專案，依 README 套用 migration、生成私人示範 seed、填公開專案設定；部署獨立 Pages 測試網址後做遠端競爭及兩手機驗收。保持原六人版及其資料不變，驗收後才擴展功能。
