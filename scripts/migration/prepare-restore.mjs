import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildRestoreSql, verifiedSnapshot } from "./restore-data.mjs";

try {
  const [input, output, storageId = "demo-trip", ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error("Usage: migration:restore-sql BACKUP_DIRECTORY OUTPUT.backup.sql [STORAGE_ID]");
  if (!output.endsWith(".backup.sql")) throw new Error("Use an ignored *.backup.sql output filename.");
  const directory = pathToFileURL(resolve(input) + "/");
  const snapshot = await verifiedSnapshot(directory);
  const sql = buildRestoreSql(snapshot, storageId);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), sql, { flag: "wx", mode: 0o600 });
  console.log(`Prepared private restore SQL (revision ${snapshot.revision}); no database was changed. Import only into the new empty staging database.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
