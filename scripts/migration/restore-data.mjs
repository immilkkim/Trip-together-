import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlText = (value) => "'" + value.replaceAll("'", "''") + "'";

export function buildRestoreSql(snapshot, storageId = "demo-trip", updatedAt = new Date().toISOString()) {
  if (snapshot.demo || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) throw new Error("A real persisted snapshot with a positive revision is required.");
  const state = snapshot.state;
  if (!state?.trip?.id || !["members", "activities", "itinerary", "proposals"].every((name) => Array.isArray(state[name]))) throw new Error("Snapshot is incomplete.");
  if (typeof storageId !== "string" || !storageId.trim()) throw new Error("Storage ID is required.");
  // A plain INSERT intentionally refuses an existing row, preserving its data.
  // One statement is atomic and also works with D1's SQL import interface.
  return `INSERT INTO trip_states (trip_id, payload, revision, updated_at) VALUES (${sqlText(storageId)}, ${sqlText(JSON.stringify(state))}, ${snapshot.revision}, ${sqlText(updatedAt)});\n`;
}

export async function verifiedSnapshot(directory) {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
  if (manifest.format !== "trip-together-backup/v1") throw new Error("Unknown backup format.");
  const bytes = await readFile(new URL("state.json", directory));
  if (sha256(bytes) !== manifest.stateSha256) throw new Error("State checksum mismatch.");
  const snapshot = JSON.parse(bytes.toString("utf8"));
  if (snapshot.revision !== manifest.revision) throw new Error("Revision mismatch.");
  const keys = new Set();
  for (const upload of manifest.uploads) {
    if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(upload.key) || upload.path !== `uploads/${upload.key}` || keys.has(upload.key)) throw new Error("Invalid or duplicate photo entry.");
    const photo = await readFile(new URL(upload.path, directory));
    if (photo.length !== upload.bytes || sha256(photo) !== upload.sha256) throw new Error("Photo checksum mismatch.");
    keys.add(upload.key);
  }
  const inspect = (value) => {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (value && typeof value === "object") return Object.values(value).forEach(inspect);
    if (typeof value !== "string") return;
    const prefix = manifest.sourceOrigin + "/api/uploads/";
    if (value.startsWith(prefix)) throw new Error("An absolute source photo URL needs conversion before restore.");
    if (value.startsWith("/api/uploads/") && !keys.has(value.slice("/api/uploads/".length))) throw new Error("Snapshot references a photo absent from the backup.");
  };
  inspect(snapshot.state);
  return snapshot;
}
