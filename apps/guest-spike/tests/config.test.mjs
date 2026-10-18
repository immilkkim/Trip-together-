import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const check=(key)=>spawnSync(process.execPath,['scripts/check-config.mjs'],{encoding:'utf8',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key}});
test('public configuration allows publishable key',()=>{
  assert.equal(check('sb_publishable_synthetic_test_only').status,0);
});
test('secret and legacy service-role keys fail before public bundling',()=>{
  for (const key of ['sb_secret_synthetic_test_only', 'e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.test']) {
    const result=check(key);assert.notEqual(result.status,0);assert.ok(!(result.stderr+result.stdout).includes(key));
  }
});
