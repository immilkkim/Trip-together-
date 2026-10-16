import assert from "node:assert/strict";
import test from "node:test";
import { initialTripState } from "../lib/trip-data.ts";
import { moveItineraryToBasket } from "../lib/itinerary-actions.ts";

function fixture() {
  const state = structuredClone(initialTripState);
  const item = { ...state.itinerary[0], description: "集合備註", contact: "訂位電話 12345678", memberIds: ["leader", "partner"] };
  state.itinerary[0] = item;
  return { state, item };
}

test("move preserves edited details and removes only the selected card", () => {
  const { state, item } = fixture();
  const original = structuredClone(state);
  const edited = { ...item, title: "已修改的活動", date: "2031-02-23", time: "10:00", endTime: "12:00" };
  const next = moveItineraryToBasket(state, edited, "墨爾本", "partner", "returned-test");
  assert.deepEqual(state, original);
  assert.deepEqual(next.itinerary, state.itinerary.slice(1));
  const saved = next.activities.at(-1);
  assert.equal(saved.title, edited.title);
  assert.equal(saved.city, "墨爾本");
  assert.equal(saved.proposedDate, edited.date);
  assert.equal(saved.startTime, "10:00");
  assert.equal(saved.endTime, "12:00");
  assert.match(saved.description, /集合備註/);
  assert.match(saved.description, /團友二/);
  assert.match(saved.description, /12345678/);
  assert.equal(saved.createdBy, "partner");
});

test("unrelated member and stale deleted cards cannot be moved", () => {
  const { state, item } = fixture();
  assert.equal(moveItineraryToBasket(state, item, "悉尼", "dad", "unused"), state);
  assert.equal(moveItineraryToBasket(state, { ...item, id: "deleted" }, "悉尼", "leader", "unused"), state);
});

test("reuse authorized source without duplicates; retain photo and withdraw its published result", () => {
  const { state, item } = fixture();
  const source = state.activities[0];
  item.sourceActivityId = source.id;
  state.proposals = [{ activityId: source.id, invitedIds: ["partner"], votes: { partner: "yes" }, status: "published", publishedItineraryId: item.id }, { activityId: "unrelated", invitedIds: [], votes: {}, status: "voting" }];
  const next = moveItineraryToBasket(state, item, "悉尼", "leader", "unused");
  assert.equal(next.activities.length, state.activities.length);
  assert.equal(next.activities.at(-1).id, source.id);
  assert.equal(next.activities.at(-1).image, source.image);
  assert.deepEqual(next.proposals, [state.proposals[1]]);
});

test("a participant without basket edit permission gets a separate saved copy", () => {
  const { state, item } = fixture();
  item.sourceActivityId = state.activities[0].id;
  state.proposals = [];
  const source = structuredClone(state.activities[0]);
  const next = moveItineraryToBasket(state, item, "悉尼", "partner", "returned-copy");
  assert.deepEqual(next.activities[0], source);
  assert.equal(next.activities.at(-1).id, "returned-copy");
  assert.equal(next.activities.at(-1).createdBy, "partner");
});

test("an invited editor retains ownership of their returned copy after withdrawal", () => {
  const { state, item } = fixture();
  item.sourceActivityId = state.activities[0].id;
  state.proposals = [{ activityId: item.sourceActivityId, invitedIds: ["partner"], votes: { partner: "yes" }, status: "published", publishedItineraryId: item.id }];
  const next = moveItineraryToBasket(state, item, "悉尼", "partner", "returned-own-copy");
  assert.equal(next.activities.at(-1).createdBy, "partner");
  assert.equal(next.activities.at(-1).id, "returned-own-copy");
  assert.equal(next.proposals.length, 0);
});
