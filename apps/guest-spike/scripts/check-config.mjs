// Run before Next inlines NEXT_PUBLIC_* into the publicly downloadable bundle.
import { createRequire } from 'node:module';
const nextRequire=createRequire(import.meta.resolve('next/package.json'));
const { loadEnvConfig }=nextRequire('@next/env');
loadEnvConfig(process.cwd(),process.argv.includes('--dev'));
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (url || key) {
  if (!url || !key || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) throw Error('請設定測試 Supabase HTTPS URL 及 publishable key。');
  let publicKey=key.startsWith('sb_publishable_');
  if (!publicKey && key.split('.').length===3) {
    try { publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon'; } catch {}
  }
  if (!publicKey) throw Error('前端只能使用 publishable／anon key，不能使用 secret／service_role key。');
} else console.log('未設定雲端資料庫：構建未連線設定畫面，不會產生假同步資料。');
