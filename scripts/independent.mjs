import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = new URL("../wrangler.independent.json", import.meta.url);
const templatePath = new URL("../wrangler.independent.example.json", import.meta.url);
const builtPath = new URL("../dist/server/wrangler.json", import.meta.url);
const placeholder = "00000000-0000-4000-8000-000000000000";
const [command, ...args] = process.argv.slice(2);

function run(script, args = [], env = {}) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    cwd: root, stdio: "inherit", env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (${result.status ?? "signal"}).`);
}

async function exists(path) {
  try { await access(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function validate(config, remote = false) {
  if (!/^[a-z0-9][a-z0-9-]*-staging$/.test(config.name)) throw new Error("Use a separate Worker name ending in -staging.");
  const db = config.d1_databases?.find((item) => item.binding === "DB");
  if (!db || !/^[a-f0-9-]{36}$/i.test(db.database_id)) throw new Error("A valid DB binding UUID is required.");
  if (remote && db.database_id === placeholder) throw new Error("Replace the placeholder database ID with your own staging D1 ID first.");
  if (!config.r2_buckets?.some((item) => item.binding === "BUCKET" && item.bucket_name)) throw new Error("A BUCKET binding is required.");
  if (config.vars?.TRIP_REQUIRE_CONFIGURATION !== "true") throw new Error("Independent deployments must require explicit configuration.");
  if (Object.hasOwn(config.vars, "TRIP_INVITE_TOKEN")) throw new Error("Keep TRIP_INVITE_TOKEN in a Worker secret, not configuration.");
  return config;
}

async function readConfig() {
  if (!await exists(configPath)) throw new Error("Run independent:configure first.");
  return validate(JSON.parse(await readFile(configPath, "utf8")));
}

async function preflight(remote) {
  const source = validate(await readConfig(), remote);
  const built = JSON.parse(await readFile(builtPath, "utf8"));
  validate(built, remote);
  if (built.name !== source.name ||
      JSON.stringify(built.d1_databases) !== JSON.stringify(source.d1_databases) ||
      JSON.stringify(built.r2_buckets) !== JSON.stringify(source.r2_buckets) ||
      built.vars.TRIP_STORAGE_ID !== source.vars.TRIP_STORAGE_ID) {
    throw new Error("Built bindings differ from current configuration. Rebuild before deploying.");
  }
  if (await exists(new URL("../dist/.openai/hosting.json", import.meta.url))) throw new Error("Unexpected Sites deployment metadata. Rebuild with independent:build.");
  console.log(remote ? "Staging artifact and bindings verified; remote secrets and resource existence still require account verification." : "Independent build verified with local bindings.");
}

try {
  if (command === "configure") {
    if (args.length % 2) throw new Error("Options require values.");
    const allowed = new Set(["--database-id", "--worker", "--database", "--bucket"]);
    const options = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
      options.set(args[i], args[i + 1]);
    }
    const config = await exists(configPath)
      ? JSON.parse(await readFile(configPath, "utf8"))
      : JSON.parse(await readFile(templatePath, "utf8"));
    if (options.has("--database-id")) config.d1_databases[0].database_id = options.get("--database-id");
    if (options.has("--worker")) config.name = options.get("--worker");
    if (options.has("--database")) config.d1_databases[0].database_name = options.get("--database");
    if (options.has("--bucket")) config.r2_buckets[0].bucket_name = options.get("--bucket");
    validate(config);
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    console.log("Created/updated ignored wrangler.independent.json. No cloud resources were created or changed.");
  } else if (command === "build") {
    await readConfig();
    run("./run-framework.mjs", ["build"], { TRIP_DEPLOY_TARGET: "independent" });
    await preflight(false);
  } else if (command === "preflight") {
    await preflight(true);
  } else if (command === "dry-run") {
    await preflight(false);
    await mkdir(new URL("../.wrangler/independent-dry-run/", import.meta.url), { recursive: true });
    run("../node_modules/wrangler/bin/wrangler.js", ["deploy", "--config", "dist/server/wrangler.json", "--dry-run", "--outdir", ".wrangler/independent-dry-run"]);
  } else if (command === "deploy") {
    await preflight(true);
    run("../node_modules/wrangler/bin/wrangler.js", ["deploy", "--config", "dist/server/wrangler.json"]);
  } else {
    throw new Error("Expected configure, build, preflight, dry-run or deploy.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
