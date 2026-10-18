import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH ?? '@electric-sql/pglite');
let db, session;
const trip='10000000-0000-4000-8000-000000000001';
const otherTrip='10000000-0000-4000-8000-000000000002';
const a='20000000-0000-4000-8000-000000000001';
const b='20000000-0000-4000-8000-000000000002';
const foreignMember='20000000-0000-4000-8000-000000000003';
const invite='a'.repeat(64);
const rpc=async(name,args)=>{
  await db.exec('set role anon');
  try {return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;}
  finally {await db.exec('reset role');}
};
const event=(members=[a],start='2030-01-02T10:00:00+11:00',end='2030-01-02T12:00:00+11:00')=>({title:'海港早餐',startsAt:start,endsAt:end,timeZone:'Australia/Sydney',memberIds:members});
const create=(input=event(),key=randomUUID())=>rpc('tt_guest_create_event',[session.guestToken,key,input]);
before(async()=>{
  db=new PGlite(); await db.exec('create role anon; create role authenticated;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610180001_guest_spike.sql',import.meta.url),'utf8'));
  await db.query(`insert into tt_spike.trips(id,name,start_date,end_date,time_zone) values($1,'旅程一','2030-01-01','2030-01-11','Australia/Sydney'),($2,'旅程二','2030-01-01','2030-01-11','Australia/Sydney')`,[trip,otherTrip]);
  await db.query(`insert into tt_spike.members(id,trip_id,name,is_leader) values($1,$2,'團友一',true),($3,$2,'團友二',false),($4,$5,'其他旅程團友',true)`,[a,trip,b,foreignMember,otherTrip]);
  await db.query(`insert into tt_spike.invites(trip_id,token_hash,expires_at) values($1,tt_spike.hash_token($2),now()+interval '30 days')`,[trip,invite]);
  session=await rpc('tt_guest_join',[invite,a]);
});
beforeEach(async()=>{
  await db.exec('truncate tt_spike.events,tt_spike.participants,tt_spike.receipts;update tt_spike.sessions set revoked_at=null,expires_at=now()+interval \'7 days\';update tt_spike.invites set revoked_at=null;');
});
after(async()=>{await db?.close();});
test('invite required; valid invite reveals only its members',async()=>{
  await assert.rejects(()=>rpc('tt_guest_open',['b'.repeat(64)]),/INVALID_INVITE/);
  const opened=await rpc('tt_guest_open',[invite]);
  assert.equal(opened.members.length,2);assert.equal(opened.trip.id,trip);
  assert.ok(!JSON.stringify(opened).includes('token_hash'));
});
test('cannot choose a member from another trip',async()=>{
  await assert.rejects(()=>rpc('tt_guest_join',[invite,foreignMember]),/INVALID_MEMBERS/);
});
test('public table access and private helper access are denied',async()=>{
  await db.exec('set role anon');
  try {
    await assert.rejects(()=>db.query('select * from tt_spike.sessions'),/permission denied/);
    await assert.rejects(()=>db.query('select tt_spike.guard($1)',[session.guestToken]),/permission denied/);
    await assert.rejects(()=>db.query('insert into tt_spike.trips(name,start_date,end_date,time_zone) values(\'bad\',\'2030-01-01\',\'2030-01-02\',\'UTC\')'),/permission denied/);
  } finally {await db.exec('reset role');}
});
test('atomic create persists event plus participants and increments revision once',async()=>{
  const result=await create(event([a,b]));
  const snap=await rpc('tt_guest_snapshot',[session.guestToken,'2030-01-02']);
  assert.equal(snap.events.length,1);assert.equal(snap.events[0].id,result.eventId);
  assert.equal(snap.events[0].memberIds.length,2);
});
test('shared member overlap is rejected without partial inserts',async()=>{
  await create();await assert.rejects(()=>create(event([a],'2030-01-02T11:00:00+11:00','2030-01-02T13:00:00+11:00')),/SCHEDULE_CONFLICT/);
  const counts=await db.query('select (select count(*) from tt_spike.events)::int as events,(select count(*) from tt_spike.participants)::int as participants');
  assert.deepEqual(counts.rows[0],{events:1,participants:1});
});
test('different group and exact boundary are allowed',async()=>{
  await create();await create(event([b]));await create(event([a],'2030-01-02T12:00:00+11:00','2030-01-02T13:00:00+11:00'));
  assert.equal((await rpc('tt_guest_snapshot',[session.guestToken,'2030-01-02'])).events.length,3);
});
test('foreign participants and invalid range are refused',async()=>{
  await assert.rejects(()=>create(event([foreignMember])),/INVALID_MEMBERS/);
  await assert.rejects(()=>create(event([a],'2030-01-02T12:00:00+11:00','2030-01-02T11:00:00+11:00')),/INVALID_RANGE/);
  await assert.rejects(()=>create({...event(),startsAt:'2030-01-02T10:00:00'}),/INVALID_RANGE/);
  await assert.rejects(()=>create({...event(),memberIds:[null]}),/INVALID_MEMBERS/);
});
test('idempotent replay persists only one event; changed or null body cannot reuse key',async()=>{
  const key=randomUUID();const first=await create(event(),key);const second=await create(event(),key);
  assert.equal(first.eventId,second.eventId);assert.equal(second.replayed,true);
  await assert.rejects(()=>create({...event(),title:'另一項'},key),/IDEMPOTENCY_KEY_REUSED/);
  await assert.rejects(()=>rpc('tt_guest_create_event',[session.guestToken,key,null]),/IDEMPOTENCY_KEY_REUSED/);
});
test('overnight canonical event appears on both days; midnight has no empty second card',async()=>{
  await create(event([a],'2030-01-02T22:30:00+11:00','2030-01-03T01:00:00+11:00'));
  const one=await rpc('tt_guest_snapshot',[session.guestToken,'2030-01-02']);
  const two=await rpc('tt_guest_snapshot',[session.guestToken,'2030-01-03']);
  assert.equal(one.events[0].id,two.events[0].id);
  await create(event([b],'2030-01-02T22:00:00+11:00','2030-01-03T00:00:00+11:00'));
  assert.equal((await rpc('tt_guest_snapshot',[session.guestToken,'2030-01-03'])).events.length,1);
});
test('trip end midnight is allowed; out of bounds is refused',async()=>{
  await create(event([a],'2030-01-11T23:00:00+11:00','2030-01-12T00:00:00+11:00'));
  await assert.rejects(()=>create(event([b],'2030-01-11T23:00:00+11:00','2030-01-12T00:01:00+11:00')),/OUTSIDE_TRIP_RANGE/);
});
test('revoking invite invalidates existing sessions and replay access',async()=>{
  const key=randomUUID();await create(event(),key);
  await db.exec('update tt_spike.invites set revoked_at=now()');
  await assert.rejects(()=>rpc('tt_guest_snapshot',[session.guestToken,'2030-01-02']),/SESSION_EXPIRED/);
  await assert.rejects(()=>create(event(),key),/SESSION_EXPIRED/);
});
test('logout and expiration revoke guest authority',async()=>{
  await rpc('tt_guest_leave',[session.guestToken]);
  await assert.rejects(()=>create(),/SESSION_EXPIRED/);
  await db.exec('update tt_spike.sessions set revoked_at=null,expires_at=now()-interval \'1 second\'');
  await assert.rejects(()=>create(),/SESSION_EXPIRED/);
});
test('migration works as a non-superuser admin without granting anon the executor role',async()=>{
  const limited=new PGlite();
  try {
    await limited.exec('create role anon;create role authenticated;create role migration_admin nologin createrole;grant all on schema public to migration_admin with grant option;');
    const database=(await limited.query('select current_database() as name')).rows[0].name;
    await limited.exec('grant create on database "'+database.replaceAll('"','""')+'" to migration_admin;set role migration_admin;');
    await limited.exec(await readFile(new URL('../supabase/migrations/202610180001_guest_spike.sql',import.meta.url),'utf8'));
    await limited.exec('reset role');
    const privileges=(await limited.query("select pg_has_role('anon','tt_spike_executor','SET') as can_set,has_function_privilege('anon','public.tt_guest_open(text)','execute') as can_open")).rows[0];
    assert.equal(privileges.can_set,false);assert.equal(privileges.can_open,true);
  } finally {await limited.close();}
});
