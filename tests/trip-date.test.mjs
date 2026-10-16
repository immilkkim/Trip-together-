import assert from "node:assert/strict";
import test from "node:test";
import { defaultTripDate, tripLocalDate } from "../lib/trip-date.ts";

const trip = { startDate: "2031-02-18", endDate: "2031-02-28" };

test("before departure opens the first day, not the old demo date", () => {
  assert.equal(defaultTripDate(trip, new Date("2026-10-14T10:41:00Z")), "2031-02-18");
});
test("during the trip opens the current local day", () => {
  assert.equal(defaultTripDate(trip, new Date("2031-02-20T03:00:00Z")), "2031-02-20");
});
test("Sydney midnight controls the day rather than UTC or the phone's zone", () => {
  assert.equal(defaultTripDate(trip, new Date("2031-02-18T12:59:00Z")), "2031-02-18");
  assert.equal(defaultTripDate(trip, new Date("2031-02-18T13:00:00Z")), "2031-02-19");
});
test("after the trip stays on the last day", () => {
  assert.equal(defaultTripDate(trip, new Date("2031-03-01T03:00:00Z")), "2031-02-28");
});
test("loaded trip dates and explicit timezones determine the default", () => {
  assert.equal(defaultTripDate({ startDate: "2035-01-10", endDate: "2035-01-20" }, new Date("2031-02-20T03:00:00Z")), "2035-01-10");
  assert.equal(tripLocalDate({ timeZone: "Asia/Hong_Kong" }, new Date("2031-02-18T13:00:00Z")), "2031-02-18");
});
