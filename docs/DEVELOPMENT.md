# DEVELOPMENT.md

**Purpose:** Rebuild a working Trip Together development environment on a new computer, Codex session or cloud workspace without relying on old chat history.  
**Current status:** Instructions are based on `main`; the current independent deployment workflow lives on `migration/independent-cloudflare` and is documented separately below.  
**Last verified:** 2026-10-25

## 1. Prerequisites

Required by the repository:

- Node.js `>=22.13.0`
- pnpm `11.25.0`
- Git

The project currently uses Next.js 16, React 19, TypeScript, Vinext/Vite, Drizzle and Wrangler. See `package.json` for exact pinned/declared versions.

Recommended setup:

```bash
node --version
corepack enable
pnpm --version
```

Do not copy `node_modules`, `.wrangler`, `.vinext` or build output between machines. Reinstall from the lockfile.

## 2. Clone and install

```bash
git clone https://github.com/immilkkim/Trip-together-.git
cd Trip-together-
git switch main
pnpm install --frozen-lockfile
```

`main` is the accepted public product checkpoint. It contains demo data only.

## 3. Basic local development

```bash
pnpm dev
```

On the portable execution profile, `scripts/run-framework.mjs` starts the Vinext development server and defaults to port 5173. The Vite configuration provides local Cloudflare binding definitions for D1 (`DB`) and R2 (`BUCKET`).

The public source has a local demo invitation fallback for development. Never copy a production invitation token into source code, screenshots, issue bodies or committed environment files.

### Main app entrypoints

- `/` — opens `TripApp`; requires a remembered/query invite to access state.
- `/join/[token]` — passes the invitation token into `TripApp` and stores it in browser localStorage.

## 4. Test and static checks

Before committing code changes:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Current tests live under `tests/` and cover domain behavior including:

- itinerary/basket transitions;
- member creation;
- overnight itinerary behavior;
- schedule conflicts;
- trip-date selection.

These tests do not replace deployed D1/R2 or multi-device acceptance testing.

## 5. Local Cloudflare environment

### Bindings

The core app expects these Cloudflare bindings:

| Binding | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 database | Shared TripState row and revision |
| `BUCKET` | R2 bucket | Uploaded activity photos |

`.openai/hosting.json` declares the binding names for Sites/local tooling:

```json
{
  "d1": "DB",
  "r2": "BUCKET"
}
```

This file does **not** contain live resource IDs or credentials and is not a complete production deployment configuration.

### Environment variables

Core source uses:

- `TRIP_INVITE_TOKEN` — server-side invitation token.

The independent deployment branch additionally uses:

- `TRIP_REQUIRE_CONFIGURATION`
- `TRIP_STORAGE_ID`

Only variable/binding names belong in documentation. Secret values do not.

`main` currently has a `local-demo-invite` fallback if `TRIP_INVITE_TOKEN` is absent. Treat that fallback as development-only; never rely on it for a private production deployment.

## 6. D1 schema and local migration

Drizzle source:

- schema: `db/schema.ts`
- config: `drizzle.config.ts`
- migrations: `drizzle/`

Generate a new migration after an intentional schema change:

```bash
pnpm db:generate
```

The current initial migration is:

```text
drizzle/0000_left_paper_doll.sql
```

For the built local Worker path, build first so `dist/server/wrangler.json` exists, then apply the migration to local persisted Wrangler state:

```bash
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js \
  d1 execute DB \
  --local \
  --config dist/server/wrangler.json \
  --persist-to .wrangler/state \
  --file drizzle/0000_left_paper_doll.sql
```

Do not replay a migration that has already been applied to the same local database unless the migration is explicitly designed to be idempotent.

## 7. Built local Worker preview

After a successful build and local D1 setup:

```bash
pnpm start
```

This runs Wrangler locally against `dist/server/wrangler.json` and persists local state under `.wrangler/state`. It is a local Worker preview, not a production deployment.

## 8. Vinext, Vite and Cloudflare roles

- **Next.js** supplies the App Router and Route Handler programming model.
- **React** supplies the interactive client UI.
- **Vinext** adapts the Next.js application to the Vite/Cloudflare toolchain used by this project.
- **Vite** drives development/build integration.
- **Cloudflare Vite plugin** provides Workers-compatible local environments and bindings.
- **Wrangler** runs/deploys the generated Worker and manages D1/R2 operations.

On `main`, `vite.config.ts` also includes the original Sites plugin for compatibility with the earlier hosting environment. This does not mean the current independent production runtime depends on ChatGPT Sites.

## 9. Current independent deployment workflow

The current live independent Worker is built from:

```text
migration/independent-cloudflare
```

This branch adds scripts that are **not present on `main` yet**:

```bash
pnpm independent:configure
pnpm independent:build
pnpm independent:preflight
pnpm independent:dry-run
pnpm independent:deploy
```

It also adds a gitignored `wrangler.independent.json` generated from an example config. Independent builds set `TRIP_DEPLOY_TARGET=independent`, omit the Sites plugin and use that Wrangler configuration.

The conceptual deployment sequence is:

```text
verify Cloudflare account
  ↓
prepare non-secret independent config
  ↓
ensure D1 migration exists/applied
  ↓
set TRIP_INVITE_TOKEN as Worker secret
  ↓
independent:build
  ↓
independent:preflight
  ↓
independent:dry-run
  ↓
independent:deploy
  ↓
mobile / multi-device acceptance
```

The connected Workers Builds pipeline currently watches the migration branch. Do not change it to `main` until the independent deployment delta has been reconciled into `main` and tested.

## 10. Private configuration and files

Never commit:

- invitation token values;
- Cloudflare API credentials;
- `.env*` or `.dev.vars*` containing secrets;
- private D1 dumps;
- private trip exports;
- private R2 objects/photos;
- generated independent config containing private resource identifiers;
- migration restore SQL containing private payload data.

`main` already ignores `.env*`, build output and local Wrangler/tool state. The independent migration branch additionally ignores its private Wrangler config, backup/restore directories and private restore SQL. Preserve those protections when reconciling the branch into `main`.

## 11. Branch workflow

Recommended workflow:

1. Start from the current intended source-of-truth branch.
2. Create a focused branch, e.g. `fix/...`, `feat/...`, `docs/...`.
3. Make one coherent change set.
4. Run tests/typecheck/lint/build relevant to the change.
5. If deployment behavior changes, run independent preflight/dry-run on the deployment-capable branch.
6. Open a PR; record migrations, runtime variable changes and deployment implications in the PR body.
7. Merge only after the deployment branch/source-of-truth implications are clear.

Until the current branch divergence is removed, every deployment-related PR must state whether it targets `main`, `migration/independent-cloudflare`, or both.

## 12. Checkpoint workflow

A checkpoint should mean a known-good source state, not merely a convenient branch name.

For a new checkpoint:

- ensure tests and build are green;
- record the commit SHA;
- record which deployment branch/config was verified;
- avoid committing private runtime data;
- if production data schema changes, record the migration and recovery plan;
- do not assume a code checkpoint also snapshots D1/R2 data.

`checkpoint/v0.1.0` currently matches the accepted `main` checkpoint from 2026-10-16.

## 13. Rollback basics

Code rollback and data rollback are separate operations.

- Re-deploying an older Worker does not roll D1 or R2 back.
- Restoring D1 does not automatically restore R2 objects.
- If users have edited the independent site after a backup was taken, do not overwrite current data with that old backup without first preserving/reconciling the newer state.
- Prefer a fresh storage key or an empty target when validating a migration so demo-seeding cannot overwrite or disguise private data.

See [DATABASE.md](DATABASE.md) for backup/recovery details.

## 14. Before handing to another developer or AI

Provide only:

- repository URL;
- intended branch;
- current `PROJECT_STATUS.md`;
- relevant issue/PR;
- non-secret environment/binding names;
- exact error/build logs if troubleshooting.

Do not paste production invitation tokens, private trip exports, D1 dumps or Cloudflare credentials into handover prompts.
