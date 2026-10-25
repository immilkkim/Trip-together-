# CHANGELOG.md

**Purpose:** Record major Trip Together product, architecture, database, hosting and security milestones without duplicating every Git commit.  
**Current status:** Curated from current source, deployment configuration and relevant history.  
**Last verified:** 2026-10-25

This is not a package-release changelog. Dates below describe important project milestones and architecture decisions.

## 2026-10-25

### Documentation

- Added the formal core documentation set: Architecture, Project Status, Development, Database, Security and Changelog.
- Reworked README into a concise project entrypoint.
- Documented `main` as the accepted public product checkpoint while recording that the current live independent Worker still builds from `migration/independent-cloudflare`.
- Clarified that the three main product screens are same-page React views, not separate Next.js routes.
- Clarified storage boundaries across D1, R2, browser localStorage and transient React state.
- Documented the trusted-group invitation model and the distinction between member identification and real authentication.

### Corrected

- Removed the implication that D1/Drizzle are merely optional starter components; they are the current full app's shared-state persistence path.
- Removed the stale statement that `db/schema.ts` is intentionally empty; it defines the `trip_states` table.
- Corrected the D1 migration reference to the actual `drizzle/0000_left_paper_doll.sql` file.
- Moved ChatGPT Sites/SIWC material out of the primary architecture description; those helpers remain in the source history/tooling but are not the current independent runtime identity model.
- Classified Supabase work as Historical/Experimental rather than Current Architecture.

## 2026-10-24

### Hosting / Deployment

- Completed validation of an independent Cloudflare Workers deployment of the full Trip Together UI.
- Verified D1 and R2 bindings plus a Worker-secret invitation token in the independent runtime.
- Configured the independent build path so it does not require the ChatGPT Sites plugin at runtime.
- Migrated the private real trip state from the previous hosted Site into the independent D1-backed deployment and completed mobile invitation acceptance.
- Updated Workers Builds configuration to keep subsequent independent deployments on the intended private storage selection rather than falling back to demo state.

### Data

- Preserved the existing whole-trip JSON + revision model during migration; no schema rewrite was required.
- Kept public repository demo data separate from private runtime data.

## 2026-10-17 to 2026-10-24

### Added — independent Cloudflare migration track

Branch: `migration/independent-cloudflare`

- Added independent Wrangler configuration and build/preflight/dry-run/deploy workflow.
- Added runtime-selected storage key support.
- Added strict configuration behavior for private deployment so a missing secret/storage failure does not silently behave like a public demo.
- Added private snapshot/restore preparation tooling and migration documentation.
- Preserved the accepted UI, D1 schema, R2 upload model, voting and schedule-conflict rules.

### Operational note

This branch became the source for the current independent live Worker but has not yet been reconciled/merged into `main`. That divergence is the current highest-priority technical debt.

## 2026-10-18 to 2026-10-24

### Experimental — Supabase guest-mode spike

Branch: `rebuild/next-supabase-guest-spike` and related validation work.

- Added an isolated `apps/guest-spike` prototype using static Next.js plus Supabase/PostgreSQL RPCs.
- Explored invitation hashing, expiring/revocable guest credentials, private schema boundaries, atomic scheduling and finer-grained server-side authorization.
- Added local PostgreSQL/PGlite and remote validation work for that isolated prototype.

### Status

- The spike was explicitly isolated from the root full application.
- It did **not** replace the root Cloudflare D1/R2 architecture.
- It did not implement the complete accepted UI/feature set or migrate the private six-person trip.
- It is retained as Historical/Experimental reference, not Current Architecture.

## 2026-10-16

### Changed — accepted feature checkpoint

Main checkpoint: `cc6383e8c4d1634cad33ecd33c46949b643a6a49`

- Synced the accepted public Trip Together feature set with anonymized demo data.
- Added/accepted member creation and display-name management.
- Improved itinerary detail/read-only flow and mobile presentation.
- Added direct basket-to-itinerary and itinerary-to-basket flows.
- Added date/time editing, same-member overlap prevention and split-group parallel scheduling.
- Added overnight/cross-day activity support.
- Added revision-based stale-write protection and rejected-write recovery behavior.

## 2026-10-09

### Added — public source edition

- Added the complete root Trip Together source to the public repository with anonymized demo data.
- Kept private invitation tokens, production database content, uploaded photos and private deployment data out of GitHub.
- Established the root D1/R2 application as the public source baseline.

## Historical note

Earlier discussions considered several future architectures, including normalized relational data, real account authentication and native/mobile app packaging. Unless those designs are present in the active source branch, they remain plans or experiments rather than changelog entries for implemented current architecture.
