# Codex Cloud setup — Trip Together

## Status

The repository is prepared for a cloud setup task. These instructions are based
on source inspection, not a completed Codex Cloud installation. An environment
must still be created, tested, and published in the owner's Codex UI.

Repository: `immilkkim/Trip-together-`; starting branch: `main` after the setup
documentation PR is merged. Suggested environment name: `trip-together-cloud`.
Use the public example members/dates and `/join/local-demo-invite` for QA.
This environment is development infrastructure, not the live travel website.

## Create the environment

On ChatGPT web or desktop: Work in > Cloud > Select environment > Create
environment. Alternatively: Settings > Codex Cloud > Environments > Create
environment. Select this repository, then Get started. Mobile can use a
published environment; the official setup flow creates it on web or desktop.

Prefer Package managers network access for initial dependency installation.
Start with Only me sharing. No production credentials are needed to develop
with local D1/R2. Free search/photo source domains can be added later for a
specific integration test; most behavior tests should use deterministic mocks.

Let Codex prepare and test installation and service startup, then record the
tested commands in Install script and Start skill. Review the report, save,
and Publish only when the intended setup is ready. Wait for Environment
published before starting a development task.

If your UI instead shows legacy Setup script / Maintenance script fields,
provide the same runtime requirements and have the setup task validate the
appropriate commands. Do not paste an assumed script for a different UI.

## Requirements inferred from this repository

| Setting | Starting requirement |
| --- | --- |
| Runtime | Node satisfying `>=22.13.0` |
| Package manager | Exact pin `pnpm@11.25.0` |
| Dependencies | `pnpm install --frozen-lockfile --prod=false` |
| Runtime profile | Clean clones default to portable |
| Dev command | `pnpm run dev` (normally port 5173) |
| Entry route | `/join/local-demo-invite` |
| Type check | `pnpm exec tsc --noEmit` |
| Lint | `pnpm run lint` |
| Build | `pnpm run build` |
| Data services | Local Cloudflare D1 binding `DB` and R2 binding `BUCKET` |
| Automated suite | No `test` script currently defined |

Do not replace pnpm with npm or use `npm ci`: there is no npm lockfile. The
legacy `install:ci` script invokes the Sites Linux installer, which expects
Sites-owned environment configuration. A standalone Codex Cloud setup should
validate the direct pnpm installation path first. Report incompatible versions
or registry/policy failures; do not disable policies or update all dependencies.

## Local database and uploads

After a successful build, confirm `dist/server/wrangler.json` exists. Apply
the current initial migration to a fresh local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_left_paper_doll.sql
```

This command is for a fresh local database only. Inspect already-applied
migrations before reusing cached state. Never add `--remote`. Verify that the
dev server and built preview use the same local database state.

The build's local preview can be started with `pnpm run start`. Vite configuration
declares local D1/R2 simulation. Verify upload, read, deletion, and save/reload
against those bindings; a rendered demo page alone is insufficient.

## Environment readiness acceptance

1. Report repository, branch/commit, Node version, and pinned pnpm version.
2. Dependency install succeeds without changing the lockfile or package policy.
3. Typecheck, lint, and build outcomes are recorded, including baseline failures.
4. Dev preview serves the invite route and offers member name selection.
5. Local D1 save/reload works without `demo: true` fallback; local R2 upload/read
   works with a non-private sample photo.
6. Report any preview access restriction. If no externally shareable preview is
   available, do not present localhost URLs as an owner-accessible website.
7. Publish the environment after readiness review. Do not deploy the live Site.

## Prompt for the environment setup conversation

```text
Prepare a Codex Cloud environment for immilkkim/Trip-together-.
Read AGENTS.md and docs/CODEX_CLOUD.md. Use the current GitHub source and public
demo data. Verify Node >=22.13.0 and the exact pnpm pin in package.json. Prepare
and test the install commands and service startup; preserve the lockfile and
package policy. This project uses Vinext/Vite and local Cloudflare D1/R2, not a
plain Next.js server. Do not require scripts from an unavailable Sites plugin.
Run typecheck, lint, build, invite-entry preview, local DB save/reload, and R2
upload checks. Record actual pass/fail/skipped results. If a dependency or
preview requirement blocks setup, diagnose it and make only the minimal setup
fix on a branch/PR. Do not change product features, import private trip data,
merge changes, or deploy the live Site. Produce a concise readiness report and
tested Install script / Start skill instructions for review before Publish.
```

Official references (checked 2026-10-09):

- https://learn.chatgpt.com/docs/environments/cloud-environments
- https://learn.chatgpt.com/docs/cloud
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
