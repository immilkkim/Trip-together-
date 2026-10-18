import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallTimeToIso, initialDay, overlaps } from '../lib/domain.ts';
const trip={startDate:'2030-01-01',endDate:'2030-01-11',timeZone:'Australia/Sydney'};
test('default day uses trip timezone and clamps before/after trip',()=>{
  assert.equal(initialDay(trip,new Date('2029-01-01Z')),'2030-01-01');
  assert.equal(initialDay(trip,new Date('2030-01-02T23:00Z')),'2030-01-03');
  assert.equal(initialDay(trip,new Date('2031-01-01Z')),'2030-01-11');
});
test('local Sydney input is independent of the device timezone',()=>{
  assert.equal(wallTimeToIso('2030-01-01','10:00','Australia/Sydney'),'2029-12-31T23:00:00.000Z');
  assert.equal(wallTimeToIso('2030-01-01','10:00','Asia/Hong_Kong'),'2030-01-01T02:00:00.000Z');
});
test('DST repeated, nonexistent and invalid calendar inputs are rejected',()=>{
  assert.throws(()=>wallTimeToIso('2026-04-05','02:30','Australia/Sydney'));
  assert.throws(()=>wallTimeToIso('2026-10-04','02:30','Australia/Sydney'));
  assert.throws(()=>wallTimeToIso('2030-02-30','10:00','Australia/Sydney'));
});
test('half open conflict rule allows back-to-back and different members',()=>{
  const a={startsAt:'2030-01-01T10:00Z',endsAt:'2030-01-01T12:00Z',memberIds:['a']};
  assert.equal(overlaps(a,{...a,startsAt:'2030-01-01T11:00Z'}),true);
  assert.equal(overlaps(a,{...a,startsAt:'2030-01-01T12:00Z',endsAt:'2030-01-01T13:00Z'}),false);
  assert.equal(overlaps(a,{...a,memberIds:['b']}),false);
});
