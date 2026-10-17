# Trip Together development instructions

## Project and product

This is the public, anonymized source of a mobile-first group travel PWA.
The live private-trip Site has separate deployment configuration and data.
GitHub changes and merges do not automatically update that Site.

Preserve Traditional Chinese UI, name-only entry through an invite link,
free travel-information sources, and no public ratings. Name selection is a
trusted-group convention, not verified personal authentication. Do not claim
that hidden UI controls enforce server-side permissions.

Preserve this workflow: basket activity -> invite/vote -> warn when a yes vote
conflicts -> leader publishes -> confirmed itinerary cards for attending members.
Voting alone must not create confirmed itinerary cards. Publishing must not
silently replace conflicting activities or create duplicate cards.
The timeline starts at 06:00, scales by duration, and places overlapping groups
side by side. Daily itinerary creation has no photo input; basket items support
photo uploads. Itinerary participants and the leader can edit/delete relevant
items; basket creator, leader, and invited members can edit/delete basket items.
All members may edit their own display names.

## Where to look

- `components/trip-app.tsx`: UI, voting, participant selection, timeline layout.
- `app/api/state/route.ts`: whole-trip state storage; currently last-write-wins.
- `app/api/uploads/`: photo upload/read/delete with local R2 binding.
- `app/api/places/route.ts`: external free place search.
- `lib/trip-data.ts`: public example members, dates, and activities.
- `lib/trip-secret.ts`: local demo token / deployment environment override.
- `db/`, `drizzle/`: Drizzle schema and SQL migrations.
- `vite.config.ts`, `scripts/run-framework.mjs`: Vinext/Vite/Cloudflare runtime.
- `docs/CODEX_CLOUD.md`: cloud setup and readiness checks.
- `docs/DEVELOPMENT_AND_ACCEPTANCE.md`: work stages and acceptance scenarios.

## Setup and checks

- Read `package.json` and `pnpm-workspace.yaml`. Node must satisfy `>=22.13.0`;
  the current package-manager pin is `pnpm@11.25.0`.
- Use `pnpm install --frozen-lockfile --prod=false` for a standalone Cloud clone.
  Make the pinned pnpm available using the environment's approved tooling.
  Do not generate a second lockfile or bypass package age/native-build policy.
- A clean clone defaults to the portable runtime profile. Linux alone does not
  imply the separate Sites managed-linux profile; do not require a missing
  Sites plugin path in Cloud.
- Development: `pnpm run dev`, normally on port 5173. Use the platform's actual
  preview mechanism and only change host/port if it requires that.
- Checks: `pnpm exec tsc --noEmit`, `pnpm run lint`, `pnpm run build`.
  Record baseline failures separately from regressions. Do not hide failures or
  disable rules globally just to get a passing result.
- There is currently no `test` script. Do not invent passing automated tests.
  Add targeted tests when the task changes important behavior; report browser
  checks and manual checks separately.
- Run local D1 migrations before claiming save/reload or collaboration works.
  A GET response with `demo: true` does not demonstrate database persistence.

## Working agreement

Use one focused branch/PR per task. Fix the requested problem, run relevant
checks, and provide reviewable changes. Preserve the repository's existing
runtime and public sample data. Keep dependency upgrades and unrelated
refactors out of a feature/fix PR unless needed and explained.

Use local simulated D1/R2 and dummy data for development. Never add live invite
tokens, real member details, production databases, uploaded private photos,
Cloudflare account keys, or deployment project IDs to this public repository.
Do not merge a PR, deploy, or change live Site data unless the task authorizes it.

Each handoff must include: task goal; files changed; exact checks and outcomes;
preview/screenshot evidence when available; remaining risks/blockers; and short
manual acceptance steps. A blocked install, skipped test, failed build, or
missing preview must be named explicitly. Do not ask the owner to repeat
terminal work you can do within the cloud task.
