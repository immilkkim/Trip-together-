import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildRestoreSql, sha256, verifiedSnapshot } from "../scripts/migration/restore-data.mjs";
import { configuredInviteToken, requiresConfiguration, storageId } from "../lib/runtime-config.ts";

const snapshot = { revision: 46, state: { trip: { id: "sample-trip" }, members: [{ id: "m1", name: "O'Brien 團友" }], activities: [], itinerary: [], proposals: [] } };

test("strict deployment never accepts a default or missing secret", () => {
  assert.equal(configuredInviteToken({ TRIP_REQUIRE_CONFIGURATION: "true" }), undefined);
  assert.notEqual(configuredInviteToken({ TRIP_REQUIRE_CONFIGURATION: "true" }), null);
  assert.equal(configuredInviteToken({ TRIP_REQUIRE_CONFIGURATION: "true", TRIP_INVITE_TOKEN: "private-example" }), "private-example");
  assert.equal(configuredInviteToken({}), "local-demo-invite");
  assert.equal(requiresConfiguration({ TRIP_REQUIRE_CONFIGURATION: "true" }), true);
  assert.equal(storageId({}), "demo-trip");
});

test("restore preserves Unicode, quotes, state IDs and revision, without overwriting data", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await readFile(new URL("../drizzle/0000_left_paper_doll.sql", import.meta.url), "utf8"));
    const sql = buildRestoreSql(snapshot, "demo-trip", "2031-01-01T00:00:00.000Z");
    db.exec(sql);
    const row = db.prepare("SELECT * FROM trip_states WHERE trip_id = ?").get("demo-trip");
    assert.deepEqual(JSON.parse(row.payload), snapshot.state);
    assert.equal(row.revision, 46);
    assert.throws(() => db.exec(buildRestoreSql({ ...snapshot, revision: 47 })), /UNIQUE constraint/);
    assert.equal(db.prepare("SELECT revision FROM trip_states").get().revision, 46);
  } finally { db.close(); }
});

test("restore refuses a demo fallback and incomplete snapshot", () => {
  assert.throws(() => buildRestoreSql({ ...snapshot, demo: true }));
  assert.throws(() => buildRestoreSql({ ...snapshot, revision: 0 }));
  assert.throws(() => buildRestoreSql({ ...snapshot, state: { trip: { id: "sample" } } }));
});

test("backup verification rejects corrupt state and missing referenced photos", async () => {
  const directory = await mkdtemp(join(tmpdir(), "trip-backup-test-"));
  try {
    const bytes = JSON.stringify(snapshot);
    const manifest = { format: "trip-together-backup/v1", revision: 46, stateSha256: sha256(bytes), uploads: [], sourceOrigin: "https://source.example" };
    await writeFile(join(directory, "state.json"), bytes);
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    assert.deepEqual(await verifiedSnapshot(pathToFileURL(directory + "/")), snapshot);
    await writeFile(join(directory, "state.json"), bytes + " ");
    await assert.rejects(verifiedSnapshot(pathToFileURL(directory + "/")), /checksum/);
    const missing = structuredClone(snapshot);
    missing.state.activities = [{ image: "/api/uploads/abc.jpg" }];
    const changed = JSON.stringify(missing);
    await writeFile(join(directory, "state.json"), changed);
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ ...manifest, stateSha256: sha256(changed) }));
    await assert.rejects(verifiedSnapshot(pathToFileURL(directory + "/")), /photo absent/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
