import assert from "node:assert/strict";
import test from "node:test";
import { createTripMember } from "../lib/members.ts";
import { initialTripState } from "../lib/trip-data.ts";

test("new member has a stable unique identity and ordinary permissions", () => {
  const members = structuredClone(initialTripState.members);
  const before = structuredClone(members);
  const member = createTripMember(members, "  新團友  ", "member-unique");
  assert.deepEqual(members, before);
  assert.equal(member.name, "新團友");
  assert.equal(member.id, "member-unique");
  assert.equal(member.isLeader, false);
  assert.equal(member.label, "同行");
  assert.match(member.color, /^#[a-f0-9]{6}$/i);
});
test("rejects ambiguous duplicate names and colliding identity IDs", () => {
  const members = [{ id: "one", name: "SampleGuest", label: "同行", color: "#bf6682" }];
  assert.throws(() => createTripMember(members, " sampleguest ", "two"), /同名/);
  assert.throws(() => createTripMember(members, "ＳａｍｐｌｅＧｕｅｓｔ", "two"), /同名/);
  assert.throws(() => createTripMember(members, "另一位", "one"), /再試/);
});
test("rejects blank and overlong names, accepts the display-name limit", () => {
  assert.throws(() => createTripMember([], "   ", "new"), /姓名/);
  assert.throws(() => createTripMember([], "友".repeat(25), "new"), /姓名/);
  assert.equal(createTripMember([], "友".repeat(24), "new").name.length, 24);
});
