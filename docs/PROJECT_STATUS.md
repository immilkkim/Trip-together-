# PROJECT_STATUS.md

**Purpose:** Give a new ChatGPT/Codex session or developer an immediate, evidence-based view of what is stable, what is deployed and what should be worked on next.  
**Current status:** Independent six-person Trip Together is deployed and accepted for mobile use; source/deployment branches are not yet reconciled.  
**Last verified:** 2026-10-25

## Current stable state

Trip Together's accepted full product flow is working with:

- daily schedule timeline;
- split-group and overnight activities;
- activity basket;
- activity add/edit/delete and photo upload;
- member creation and display-name editing;
- invitation and voting flow;
- leader publication of voted activities;
- same-member conflict prevention;
- revision-based stale-write protection;
- PWA shell/offline read fallback;
- independent Cloudflare Workers + D1 + R2 deployment.

The private 2027 trip state has been migrated from the previous hosted Site into the independent D1-backed deployment and was manually accepted on mobile. Private trip content is intentionally not stored in this public repository.

## Current checkpoint

| Item | Verified state |
| --- | --- |
| Repository default branch | `main` |
| `main` checkpoint | `cc6383e8c4d1634cad33ecd33c46949b643a6a49` — accepted public feature checkpoint |
| Checkpoint branch | `checkpoint/v0.1.0` points to the same accepted checkpoint |
| Current independent deployment source | `migration/independent-cloudflare` |
| Independent deployment branch checkpoint | `4a8dbdb3f1b2a6cd4de4ceefbbdeea037580de96` plus current Cloudflare build/runtime configuration |
| Current shared database | Cloudflare D1 |
| Current uploaded-photo store | Cloudflare R2 |
| Supabase | Historical/experimental only; not current runtime |

## Important branch divergence

This is the most important handover fact.

`main` contains the accepted public full application, but the live independent Worker currently builds from `migration/independent-cloudflare` because that branch adds the operational changes needed for independent deployment:

- runtime-selected storage ID rather than `main`'s hard-coded demo row;
- fail-closed production configuration;
- independent Wrangler configuration;
- independent build/preflight/deploy scripts;
- private restore tooling;
- independent build mode that omits the ChatGPT Sites plugin.

Therefore:

- use `main` first when deciding what the core product code does;
- inspect `migration/independent-cloudflare` before changing deployment behavior;
- do not redeploy raw `main` as though it were already equivalent to the live independent configuration.

## Completed major functionality

### Scheduling

- Daily timeline with minute-based card positioning.
- Different sub-groups can have parallel activities.
- The same member is blocked from overlapping scheduled activities.
- Overnight activities are represented as one logical item and rendered across affected days.
- Activities can be edited, deleted or moved back to the basket.

### Activity basket

- Create/edit/delete basket items.
- Optional source links, descriptions, travel information and walking level.
- JPG/PNG/WebP upload through R2.
- Direct scheduling from a basket item.

### Invitations and voting

- Invite selected trip members.
- Vote yes/maybe/no.
- Conflict warning before a member votes yes when schedule data is available.
- Leader publishes attending members into the itinerary, with a final conflict check.

### Shared state

- Shared TripState stored in D1.
- Revision carried by each client.
- Compare-and-swap update prevents stale writes from silently overwriting newer data.
- Rejected writes trigger an authoritative reload attempt.

### Independent hosting

- Current app no longer depends on ChatGPT Sites for normal runtime access.
- Independent build uses Cloudflare Workers with D1/R2 bindings.
- Private invite token is configured as a Worker secret.
- Production data is separate from public demo data.

## Current Priority

**Reconcile the independent deployment delta back into `main`, then make `main` the single deployable source of truth.**

This should happen before major new features. The goal is to remove the current situation where product truth lives mainly on `main` but operational deployment truth lives on `migration/independent-cloudflare`.

The reconciliation must preserve:

- accepted UI/business behavior from `main`;
- strict production configuration from the migration branch;
- existing private D1/R2 data without reseeding or overwriting it;
- the public/demo data boundary;
- Workers Builds behavior that points the live app at the intended private storage row.

## Known limitations / technical debt

These are verified design or implementation limitations, not necessarily active user-facing bugs.

1. **Main/deployment branch divergence.** The live deployment is not built from `main`.
2. **Trusted member identity only.** Anyone with the valid shared invite can choose any listed member identity.
3. **Per-member permissions are mainly client-side.** The API authenticates the shared invite, but it does not independently prove the selected member or enforce each UI-level leader/member permission on the whole-state PUT.
4. **Whole-trip JSON writes.** Members, itinerary, activities and proposals are stored inside one D1 JSON payload and replaced together.
5. **No realtime server push.** Another device must obtain a fresh state load to see remote changes; there is no WebSocket/SSE/realtime subscription in the current full app.
6. **Public-by-key uploaded photo reads.** `/api/uploads/[key]` GET does not require the invite token; secrecy relies partly on the unguessable generated key.
7. **Limited server-side schema validation.** `/api/state` checks key top-level fields, revision, schedule range and conflicts, but it does not run a complete schema validator over every TripState field.
8. **D1/R2 operations are not atomic together.** Photo cleanup after a state change is best-effort and can leave an orphaned object after failure.
9. **Offline mode is read fallback, not offline collaboration.** No offline writes, merge queue or conflict reconciliation exists.
10. **External place search is Australia-specific.** Nominatim policy/rate-limit compliance remains an operational dependency.
11. **No audit log or per-user activity history.** Revision records current state version only.

## Known bugs

No blocking bug is currently confirmed after the independent mobile acceptance described above.

Do not convert old Supabase spike acceptance items into current bugs. Draft PRs related to that spike are historical/paused unless the product direction explicitly returns to that architecture.

## Production / demo / development differences

| Environment | Data | Invitation/config | Hosting/runtime | Notes |
| --- | --- | --- | --- | --- |
| Public source on `main` | Anonymous 2030 demo TripState | Local demo fallback exists in source | Sites/local-tool-compatible Vinext/Vite | Safe for public repository; not equivalent to current live independent deployment. |
| Local development | Local D1/R2 simulation after migration/setup | Developer-controlled local token; never use production secret | Vinext/Vite + Cloudflare local tooling | Browser localStorage is origin-specific. |
| Current independent deployment | Private real trip state in D1; uploaded objects in R2 | Worker secret + strict runtime configuration | Cloudflare Workers | Built from `migration/independent-cloudflare`, not `main`. |
| Supabase guest spike | Synthetic/test data only | Separate bounded guest-token experiment | Static Next.js + Supabase test architecture | Historical/experimental; not current production. |

## Paused / historical directions

The following are not active implementation priorities:

- Supabase guest-mode rebuild (`rebuild/next-supabase-guest-spike`).
- Full user-account/OAuth identity system.
- Normalized commercial multi-trip relational redesign.
- Native Expo/iOS/Android product.
- Broad public or commercial rollout.

These may be reconsidered later, but should not be presented as current architecture or committed roadmap.

## Open repository work

There are open draft PRs from earlier development tracks. In particular:

- the independent Cloudflare migration PR/branch remains operationally relevant because it became the source for the current live independent Worker;
- the Supabase prototype and its remote-validation PR remain historical/experimental work and should not be merged merely because they are open.

Always inspect a PR's current base/head and purpose before treating it as active work.

## Needs verification

The documentation audit did not re-run the entire automated test suite or perform a new deployment. Before or during the recommended branch reconciliation, re-verify:

- `pnpm test`, TypeScript checking, lint and production build on the reconciled branch;
- a fresh independent build/preflight against non-secret configuration;
- two-device stale-write/concurrency behavior after deployment;
- photo upload/read/delete on the reconciled deployment;
- iPhone plus at least one second browser/device after the source-of-truth branch is changed.

## Handover rule

When this document and old chat history disagree with current code, inspect the code and deployment first. Update this status document in the same PR whenever the active deployment branch, storage architecture, security model or current priority changes.
