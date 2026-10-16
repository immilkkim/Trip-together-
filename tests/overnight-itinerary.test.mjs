import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, effectiveEndDate, findChangedScheduleConflicts, findScheduleConflicts, itineraryForDay, scheduleRangeLabel, shiftEndDate, validScheduleRange } from "../lib/schedule-conflicts.ts";
import { moveItineraryToBasket } from "../lib/itinerary-actions.ts";
import { initialTripState } from "../lib/trip-data.ts";

const overnight = { id: "overnight", title: "晚間活動", date: "2031-02-21", time: "23:00", endDate: "2031-02-22", endTime: "01:00", place: "Sydney", transport: "的士", memberIds: ["leader", "partner"], status: "optional", tone: "blue" };

test("one logical overnight card appears at the correct times on both days", () => {
  const first = itineraryForDay([overnight], "2031-02-21");
  const second = itineraryForDay([overnight], "2031-02-22");
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.deepEqual([first[0].time, first[0].endTime], ["23:00", "24:00"]);
  assert.deepEqual([second[0].time, second[0].endTime], ["00:00", "01:00"]);
  assert.equal(first[0].continuesToNextDay, true);
  assert.equal(second[0].continuesFromPreviousDay, true);
  assert.equal(first[0].id, second[0].id);
  assert.equal(itineraryForDay([overnight], "2031-02-23").length, 0);
});
test("earlier ending time automatically means tomorrow, across calendar boundaries", () => {
  assert.equal(effectiveEndDate({ ...overnight, endDate: undefined }), "2031-02-22");
  assert.equal(effectiveEndDate({ ...overnight, date: "2031-12-31", endDate: "" }), "2032-01-01");
  assert.equal(addCalendarDays("2032-02-28", 1), "2032-02-29");
  assert.equal(effectiveEndDate({ ...overnight, time: "09:00", endTime: "10:00", endDate: undefined }), overnight.date);
});
test("midnight endpoint produces no zero-length card on tomorrow", () => {
  const item = { ...overnight, endTime: "00:00" };
  assert.equal(itineraryForDay([item], "2031-02-21")[0].endTime, "24:00");
  assert.equal(itineraryForDay([item], "2031-02-22").length, 0);
});
test("multi-day activities cover intermediate days completely", () => {
  const item = { ...overnight, endDate: "2031-02-24" };
  for (const date of ["2031-02-22", "2031-02-23"]) {
    const segment = itineraryForDay([item], date)[0];
    assert.deepEqual([segment.time, segment.endTime], ["00:00", "24:00"]);
    assert.equal(segment.continuesFromPreviousDay && segment.continuesToNextDay, true);
  }
});
test("both first-day and next-day overlaps are detected in both directions", () => {
  for (const item of [{ ...overnight, id: "late", endDate: "2031-02-21", endTime: "23:30" }, { ...overnight, id: "early", date: "2031-02-22", time: "00:30", endTime: "02:00" }]) {
    assert.equal(findScheduleConflicts([item], overnight).length, 1);
    assert.equal(findScheduleConflicts([overnight], item).length, 1);
  }
});
test("next-day back-to-back and different-member parallel cards remain allowed", () => {
  const next = { ...overnight, id: "next", date: "2031-02-22", time: "01:00", endTime: "02:00" };
  assert.equal(findScheduleConflicts([next], overnight).length, 0);
  assert.equal(findScheduleConflicts([{ ...next, time: "00:00", memberIds: ["dad"] }], overnight).length, 0);
});
test("editing just the end date triggers server conflict detection", () => {
  const first = { ...overnight, time: "09:00", endDate: "2031-02-21", endTime: "10:00" };
  const second = { ...overnight, id: "next", date: "2031-02-22", time: "08:00", endTime: "09:00" };
  assert.equal(findChangedScheduleConflicts([first, second], [{ ...first, endDate: "2031-02-22" }, second]).length, 1);
});
test("same-day and overnight validity, explicit backward dates, and trip limits", () => {
  const trip = { startDate: "2031-02-18", endDate: "2031-02-28" };
  assert.equal(validScheduleRange(overnight, trip), true);
  assert.equal(validScheduleRange({ ...overnight, endDate: "2031-02-21" }, trip), false);
  assert.equal(validScheduleRange({ ...overnight, endDate: "2031-03-01" }, trip), false);
  assert.equal(validScheduleRange({ ...overnight, date: "2031-02-30", endDate: "2031-03-01" }), false);
  assert.equal(validScheduleRange({ ...overnight, endTime: "25:00" }), false);
});
test("moving the start date preserves a previously chosen cross-day span", () => {
  assert.equal(shiftEndDate("2031-02-21", "2031-02-24", "2031-02-22"), "2031-02-25");
  assert.equal(shiftEndDate("2031-02-21", "2031-02-24", ""), "");
});
test("returning to basket preserves the end date and removes both daily segments", () => {
  const state = structuredClone(initialTripState);
  state.itinerary = [overnight];
  const next = moveItineraryToBasket(state, overnight, "悉尼", "leader", "returned-night");
  assert.equal(next.activities.at(-1).proposedEndDate, overnight.endDate);
  assert.match(next.activities.at(-1).description, /2031-02-22 01:00/);
  assert.equal(itineraryForDay(next.itinerary, "2031-02-21").length, 0);
  assert.equal(itineraryForDay(next.itinerary, "2031-02-22").length, 0);
});
test("date/time labels include the ending date only for cross-day activities", () => {
  assert.equal(scheduleRangeLabel(overnight), "2031-02-21 23:00–2031-02-22 01:00");
  assert.equal(scheduleRangeLabel({ ...overnight, time: "08:00", endDate: overnight.date, endTime: "09:00" }), "2031-02-21 08:00–09:00");
});
