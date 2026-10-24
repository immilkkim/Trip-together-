// Opt-in remote Step 1 acceptance test for the isolated Supabase dev project.
// Covers A join -> B persisted create -> C cross-session visibility -> D DB conflict protection.
// Never print or commit TT_TEST_INVITE / guest credentials. Synthetic events are intentionally retained.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const { loadEnvConfig } = createRequire(import.meta.resolve('next/package.json'))('@next/env');
loadEnvConfig(process.cwd(), true);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const invite = process.env.TT_TEST_INVITE;
const allowWrite = process.env.TT_ALLOW_TEST_WRITE;
const expectedTrip = process.env.TT_EXPECT_TRIP_NAME ?? '獨立版示範旅程';
const requestedDate = process.env.TT_TEST_DATE;

if (allowWrite !== 'yes' || !url || !key || !invite) {
  throw Error('只限獨立測試專案：需設定 TT_ALLOW_TEST_WRITE=yes、TT_TEST_INVITE 及公開 Supabase API 設定。');
}
if (key.startsWith('sb_secret_') || /service_role/i.test(key)) {
  throw Error('拒絕使用 secret/service-role key；此驗收只可使用 publishable/anon key。');
}

async function rpc(name, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let result = null;
  if (text) {
    try { result = JSON.parse(text); }
    catch { throw Error(`RPC_${name}_NON_JSON_${res.status}`); }
  }
  if (!res.ok) throw Error(result?.message ?? `RPC_${name}_${res.status}`);
  return result;
}

function localDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function wallTimeToIso(date, time, timeZone) {
  const target = `${date}T${time}:00`;
  const wall = Date.parse(`${target}Z`);
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const matches = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = wall - offset * 60_000;
    const parts = f.formatToParts(instant);
    const get = (type) => parts.find((p) => p.type === type).value;
    if (`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}` === target) {
      matches.push(instant);
    }
  }
  if (matches.length !== 1) throw Error(`測試日期時間無法唯一解析：${date} ${time} ${timeZone}`);
  return new Date(matches[0]).toISOString();
}

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function findEmptyDate(session, trip) {
  if (requestedDate) {
    assert.ok(requestedDate >= trip.startDate && requestedDate <= trip.endDate, 'TT_TEST_DATE 必須在旅程日期內');
    const snap = await rpc('tt_guest_snapshot', { p_guest_token: session.guestToken, p_date: requestedDate });
    assert.equal(snap.events.length, 0, 'TT_TEST_DATE 必須完全無活動；請換另一日，不能刪既有資料');
    return requestedDate;
  }
  for (let i = 0; i < 370; i++) {
    const date = addDays(trip.startDate, i);
    if (date > trip.endDate) break;
    const snap = await rpc('tt_guest_snapshot', { p_guest_token: session.guestToken, p_date: date });
    if (snap.events.length === 0) return date;
  }
  throw Error('旅程內沒有完全空白的測試日；設定 TT_TEST_DATE 指向安全的獨立測試日。');
}

const sessions = [];
const checkpoint = [];
try {
  const opened = await rpc('tt_guest_open', { p_invite_token: invite });
  assert.equal(opened.trip.name, expectedTrip, '只限指定的獨立示範旅程；如名稱不同請設定 TT_EXPECT_TRIP_NAME 明確確認');
  assert.ok(opened.members.length >= 2, 'Step 1 多人驗收至少需要兩位團友');
  assert.ok(opened.trip.startDate && opened.trip.endDate && opened.trip.timeZone);

  for (const member of opened.members.slice(0, 2)) {
    const session = await rpc('tt_guest_join', { p_invite_token: invite, p_member_id: member.id });
    assert.equal(session.memberId, member.id);
    assert.ok(session.guestToken && Date.parse(session.expiresAt) > Date.now());
    sessions.push(session);
  }
  checkpoint.push('A 加入旅程 PASS');

  const date = await findEmptyDate(sessions[0], opened.trip);
  const run = randomUUID().slice(0, 8);
  const firstMember = opened.members[0].id;
  const secondMember = opened.members[1].id;
  const make = (title, start, end, memberIds) => ({
    title: `STEP1 ${run} ${title}`,
    startsAt: wallTimeToIso(date, start, opened.trip.timeZone),
    endsAt: wallTimeToIso(date, end, opened.trip.timeZone),
    timeZone: opened.trip.timeZone,
    memberIds,
  });

  const baseline = make('B persisted create', '09:00', '10:00', [firstMember]);
  const baselineResult = await rpc('tt_guest_create_event', {
    p_guest_token: sessions[0].guestToken,
    p_request_key: randomUUID(),
    p_request: baseline,
  });
  const afterCreate = await rpc('tt_guest_snapshot', { p_guest_token: sessions[0].guestToken, p_date: date });
  assert.ok(afterCreate.events.some((e) => e.id === baselineResult.eventId && e.title === baseline.title));
  checkpoint.push('B 新增活動／重新讀取仍存在 PASS');

  const remote = make('C second member', '13:00', '14:00', [secondMember]);
  const remoteResult = await rpc('tt_guest_create_event', {
    p_guest_token: sessions[1].guestToken,
    p_request_key: randomUUID(),
    p_request: remote,
  });
  const seenByFirst = await rpc('tt_guest_snapshot', { p_guest_token: sessions[0].guestToken, p_date: date });
  assert.ok(seenByFirst.events.some((e) => e.id === remoteResult.eventId && e.title === remote.title));
  checkpoint.push('C 兩個 guest session 以 Supabase 為 source of truth PASS');

  const clashA = make('D race A', '16:00', '18:00', [firstMember]);
  const clashB = make('D race B', '17:00', '19:00', [firstMember]);
  const outcomes = await Promise.allSettled([
    rpc('tt_guest_create_event', {
      p_guest_token: sessions[0].guestToken,
      p_request_key: randomUUID(),
      p_request: clashA,
    }),
    rpc('tt_guest_create_event', {
      p_guest_token: sessions[1].guestToken,
      p_request_key: randomUUID(),
      p_request: clashB,
    }),
  ]);
  const successes = outcomes.filter((r) => r.status === 'fulfilled');
  const failures = outcomes.filter((r) => r.status === 'rejected');
  assert.equal(successes.length, 1, '撞期競爭必須只有一個成功');
  assert.equal(failures.length, 1, '撞期競爭必須有一個由 server/database 拒絕');
  assert.match(failures[0].reason.message, /SCHEDULE_CONFLICT/);

  const final = await rpc('tt_guest_snapshot', { p_guest_token: sessions[0].guestToken, p_date: date });
  const raceEvents = final.events.filter((e) => e.title === clashA.title || e.title === clashB.title);
  assert.equal(raceEvents.length, 1, '撞期失敗不得留下 partial/duplicate event');
  checkpoint.push('D server/database 撞期保護 PASS');

  assert.equal(localDate(new Date(baseline.startsAt), opened.trip.timeZone), date);
  console.log(`PASS Step 1 remote acceptance (${date})`);
  for (const line of checkpoint) console.log(`- ${line}`);
  console.log('- 測試活動保留於獨立 dev project 供人工核對；沒有輸出 invitation 或 guest credential。');
} finally {
  await Promise.allSettled(sessions.map((s) => rpc('tt_guest_leave', { p_guest_token: s.guestToken })));
}
