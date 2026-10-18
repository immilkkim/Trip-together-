// Opt-in staging integration test. Writes one synthetic event; never deletes data.
// Do not run against the six-person live site or put TT_TEST_INVITE in GitHub.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const {loadEnvConfig}=createRequire(import.meta.resolve('next/package.json'))('@next/env');
loadEnvConfig(process.cwd(),true);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const invite=process.env.TT_TEST_INVITE;
if (process.env.TT_ALLOW_TEST_WRITE!=='yes' || !url || !key || !invite) throw Error('只限獨立測試專案：設定 TT_ALLOW_TEST_WRITE=yes、TT_TEST_INVITE 及公開 API 設定後才執行。');
async function rpc(name,args){
  const res=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20_000)});
  const result=await res.json(); if(!res.ok) throw Error(result.message??'RPC_FAILED'); return result;
}
const opened=await rpc('tt_guest_open',{p_invite_token:invite});
assert.equal(opened.trip.name,'獨立版示範旅程','只限 prepare-demo 產生的示範旅程');
assert.equal(opened.trip.startDate,'2030-01-01');
assert.equal(opened.trip.timeZone,'Australia/Sydney');
assert.ok(opened.members.length>=2);
const sessions=[];
try {
  for(const member of opened.members.slice(0,2)) sessions.push(await rpc('tt_guest_join',{p_invite_token:invite,p_member_id:member.id}));
  const date=process.env.TT_TEST_DATE??'2030-01-05';
  const snapshot=await rpc('tt_guest_snapshot',{p_guest_token:sessions[0].guestToken,p_date:date});
  assert.equal(snapshot.events.length,0,'測試日必須完全無活動；換一日，不能刪既有資料');
  const body={title:'雙連線撞期驗證',startsAt:`${date}T10:00:00+11:00`,endsAt:`${date}T12:00:00+11:00`,timeZone:'Australia/Sydney',memberIds:[opened.members[0].id]};
  const keys=[randomUUID(),randomUUID()];
  const outcomes=await Promise.allSettled(sessions.map((s,index)=>rpc('tt_guest_create_event',{p_guest_token:s.guestToken,p_request_key:keys[index],p_request:body})));
  const successes=outcomes.filter(r=>r.status==='fulfilled');
  const failures=outcomes.filter(r=>r.status==='rejected');
  assert.equal(successes.length,1,'同一團友撞期必須只有一次成功');assert.equal(failures.length,1);
  assert.match(failures[0].reason.message,/SCHEDULE_CONFLICT/);
  const winner=outcomes.findIndex(r=>r.status==='fulfilled');
  const replay=await rpc('tt_guest_create_event',{p_guest_token:sessions[winner].guestToken,p_request_key:keys[winner],p_request:body});
  assert.equal(replay.replayed,true);
  const after=await rpc('tt_guest_snapshot',{p_guest_token:sessions[1].guestToken,p_date:date});
  assert.equal(after.events.length,1);
  console.log('PASS：遠端兩連線只新增一項活動；另一項撞期；重試不重複；另一身份可見。示範活動留作核對。');
} finally {
  await Promise.allSettled(sessions.map(s=>rpc('tt_guest_leave',{p_guest_token:s.guestToken})));
}
