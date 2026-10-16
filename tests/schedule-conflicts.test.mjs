import assert from "node:assert/strict";
import test from "node:test";
import { findScheduleConflicts, findChangedScheduleConflicts } from "../lib/schedule-conflicts.ts";

const card = (id, overrides = {}) => ({ id, date: "2031-02-19", time: "08:00", endTime: "09:00", title: id, place: "", transport: "", status: "optional", tone: "mint", memberIds: ["leader", "partner"], ...overrides });

test("moving date catches the photographed same-member overlap", () => {
  const mountain = card("mountain");
  const beach = card("beach", { date: "2031-02-21", time: "08:30", endTime: "12:00" });
  assert.deepEqual(findScheduleConflicts([mountain, beach], { ...beach, date: "2031-02-19" }), [{ item: mountain, memberIds: ["leader", "partner"] }]);
});
test("partial and contained overlaps are blocked, including tentative cards", () => {
  const existing = card("existing", { time: "10:00", endTime: "12:00" });
  for (const [time, endTime] of [["09:30", "10:30"], ["11:30", "12:30"], ["10:15", "11:00"], ["09:00", "13:00"]]) {
    assert.equal(findScheduleConflicts([existing], card("new", { time, endTime })).length, 1);
  }
});
test("back-to-back cards and different days do not conflict", () => {
  assert.equal(findScheduleConflicts([card("existing")], card("next", { time: "09:00", endTime: "10:00" })).length, 0);
  assert.equal(findScheduleConflicts([card("existing")], card("previous", { time: "07:00", endTime: "08:00" })).length, 0);
  assert.equal(findScheduleConflicts([card("existing")], card("different-day", { date: "2031-02-20" })).length, 0);
});
test("parallel separate groups, empty groups, and editing oneself are allowed", () => {
  const existing = card("existing");
  assert.equal(findScheduleConflicts([existing], card("other-group", { memberIds: ["dad", "mum"] })).length, 0);
  assert.equal(findScheduleConflicts([existing], card("unassigned", { memberIds: [] })).length, 0);
  assert.equal(findScheduleConflicts([existing], existing).length, 0);
});
test("reports only the shared member, including newly selected companions", () => {
  const existing = card("existing", { memberIds: ["partner", "dad"] });
  assert.deepEqual(findScheduleConflicts([existing], card("new"))[0].memberIds, ["partner"]);
});
test("server validation blocks additions, date/time moves and changed participants", () => {
  const existing = card("existing");
  const previous = [existing, card("move", { date: "2031-02-21" })];
  assert.equal(findChangedScheduleConflicts(previous, [existing, card("move")]).length, 1);
  assert.equal(findChangedScheduleConflicts([existing], [existing, card("new")]).length, 1);
  assert.equal(findChangedScheduleConflicts([existing, card("later", { time: "10:00", endTime: "11:00" })], [existing, card("later")]).length, 1);
  assert.equal(findChangedScheduleConflicts([existing, card("group", { memberIds: ["dad"] })], [existing, card("group", { memberIds: ["dad", "partner"] })]).length, 1);
});
test("legacy conflicts permit basket changes, removal and metadata-only edits", () => {
  const old = [card("a"), card("b")];
  assert.equal(findChangedScheduleConflicts(old, old).length, 0);
  assert.equal(findChangedScheduleConflicts(old, [old[0]]).length, 0);
  assert.equal(findChangedScheduleConflicts(old, old.map((item) => ({ ...item, title: "renamed" }))).length, 0);
});
test("two newly conflicting cards are rejected once; changed group order is harmless", () => {
  assert.equal(findChangedScheduleConflicts([], [card("a"), card("b")]).length, 1);
  const old = [card("a"), card("b")];
  assert.equal(findChangedScheduleConflicts(old, old.map((item) => ({ ...item, memberIds: ["partner", "leader"] }))).length, 0);
});
