# DATABASE.md

**Purpose:** Explain exactly where Trip Together data lives, how the current D1 schema works, and how shared-state concurrency and recovery behave.  
**Current status:** The full app stores one TripState JSON document per storage row in Cloudflare D1; uploaded file bytes are stored separately in Cloudflare R2.  
**Last verified:** 2026-10-25

## 1. Current database

The current shared database is **Cloudflare D1**, accessed through **Drizzle ORM's D1 adapter**.

Relevant source files:

- `db/index.ts` — obtains Cloudflare binding `DB` and creates the Drizzle client.
- `db/schema.ts` — Drizzle schema.
- `drizzle.config.ts` — Drizzle Kit config using SQLite dialect.
- `drizzle/0000_left_paper_doll.sql` — current initial migration.
- `app/api/state/route.ts` — reads and writes the shared state.

Supabase/PostgreSQL is not used by the current full application. Supabase artifacts exist only on an experimental branch; see [ARCHITECTURE.md](ARCHITECTURE.md#historical--experimental-architecture).

## 2. Current schema

There is currently one application table:

```sql
CREATE TABLE trip_states (
  trip_id    TEXT PRIMARY KEY NOT NULL,
  payload    TEXT NOT NULL,
  revision   INTEGER DEFAULT 1 NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `trip_states`

| Column | Meaning |
| --- | --- |
| `trip_id` | Storage key used to select one shared trip-state row. Primary key. |
| `payload` | JSON-serialized `TripState`. |
| `revision` | Positive integer used for optimistic concurrency control. |
| `updated_at` | ISO timestamp written when the state is saved. |

On public `main`, `/api/state` currently uses the fixed storage key `demo-trip`.

The independent deployment branch allows the storage key to come from runtime configuration. Therefore the D1 `trip_id` used as an operational storage key does not have to equal `payload.trip.id` inside the TripState JSON.

## 3. Drizzle ORM role

Drizzle provides:

- the TypeScript table definition in `db/schema.ts`;
- D1 query/update calls in `/api/state`;
- migration generation through Drizzle Kit.

It is not a separate database. D1 remains the persistent database; Drizzle is the application-side ORM/query layer.

## 4. TripState payload

`lib/trip-data.ts` defines the current logical payload:

```text
TripState
├── trip
│   ├── id
│   ├── name
│   ├── destination
│   ├── startDate
│   ├── endDate
│   └── timeZone?
├── members[]
├── itinerary[]
├── activities[]
└── proposals[]
```

### `members[]`

Contains member ID, display name, label, display color and optional `isLeader` flag.

### `itinerary[]`

Contains scheduled items including start/end date/time, title, place, transport, optional description/contact, participating `memberIds`, status and display tone. An itinerary item can reference a source basket activity.

### `activities[]`

Contains basket items including city/category, title, place/area, descriptive metadata, walking level, optional proposed schedule, creator and image/source fields.

Uploaded activity images are referenced by URL such as `/api/uploads/<key>`; their bytes are not stored in D1.

### `proposals[]`

Contains activity-based invitation/voting state: invitee IDs, yes/maybe/no votes, voting/published state, proposed schedule and optional published itinerary ID.

## 5. Revision mechanism

Each browser loads:

```json
{
  "state": "<TripState>",
  "revision": 42
}
```

A write sends the complete next state together with the revision it was based on:

```json
{
  "state": "<next TripState>",
  "revision": 42
}
```

The server then:

1. loads the current D1 row;
2. requires the submitted revision to equal the stored revision;
3. validates changed schedule data;
4. computes `nextRevision = currentRevision + 1`;
5. updates the row with a condition on both `trip_id` and the old revision.

That final conditional update is a compare-and-swap guard. If another writer wins the race first, the losing write changes no row and receives a `409 stale_revision` response.

The client attempts to reload authoritative state after a rejected write so an optimistic local edit is not left displayed as if it had succeeded.

## 6. Schedule validation in the persistence path

Before accepting `/api/state` writes, the server checks:

- schedule date/time format;
- start/end ordering;
- trip date bounds;
- newly introduced overlaps involving the same member.

Existing unrelated conflicts are intentionally not allowed to block all future edits. `findChangedScheduleConflicts()` compares previous and next schedule data and focuses on changed items.

This is important business validation, but it is not a complete schema validator for the entire TripState document.

## 7. Storage boundaries

| Data | Current location | Notes |
| --- | --- | --- |
| Shared trip metadata | D1 `trip_states.payload` | Inside TripState JSON. |
| Members | D1 `trip_states.payload` | Inside `members[]`. |
| Itinerary | D1 `trip_states.payload` | Inside `itinerary[]`. |
| Activity basket | D1 `trip_states.payload` | Inside `activities[]`. |
| Votes/proposals | D1 `trip_states.payload` | Inside `proposals[]`. |
| Shared-state revision | D1 `trip_states.revision` | Used for stale-write protection. |
| Uploaded photo bytes | R2 `BUCKET` | Object key generated by server. |
| Uploaded photo reference | D1 payload | Usually `/api/uploads/<key>` in an activity image field. |
| Invite token copy used by browser | browser localStorage | Key `trip-together-invite`; server secret remains outside D1. |
| Selected member ID | browser localStorage | Key `trip-together-member`. Identification only, not authentication. |
| Last known offline TripState | browser localStorage | Key `trip-together-offline-state`. Device-local private cache. |
| Draft forms, filters, selected tab/date/dialog state | React memory | Lost when the page/session is reset unless represented in persisted TripState. |

## 8. D1 vs R2 consistency

D1 and R2 are separate storage systems and are not updated in one distributed transaction.

Typical photo creation:

1. upload bytes to R2;
2. receive `/api/uploads/<key>`;
3. save an Activity containing that URL through the D1 TripState write.

Typical replacement/deletion cleanup is best-effort. A failure between the D1 state change and R2 deletion can leave an unreferenced object. No automatic orphan sweeper is currently implemented.

## 9. Demo seeding behavior

If `/api/state` successfully reaches D1 but no row exists for the selected storage key, the current implementation inserts `initialTripState` as revision 1.

That is convenient for demo/local use but important during migration:

- do not point a new production deployment at an empty intended storage key and browse it casually before a planned restore;
- validate migrations against an empty target or a fresh storage key;
- ensure the final runtime points at the intended private row before acceptance.

The independent deployment branch additionally has stricter failure behavior so a configured production deployment does not silently present demo data when storage is unavailable.

## 10. Backup strategy

A useful application backup must preserve more than the D1 table alone when uploaded photos exist.

Minimum logical backup:

1. TripState JSON;
2. D1 revision;
3. every referenced `/api/uploads/<key>` object from R2;
4. a manifest/checksum record so missing or changed files can be detected.

The independent migration branch contains verified snapshot/restore tooling for this model. That tooling is not yet present on `main`.

Private backups must remain outside the public repository.

## 11. Recovery rules

- **Code rollback is not data rollback.** Deploying an older Worker does not rewind D1 or R2.
- **D1 rollback is not R2 rollback.** Restoring state does not recreate missing photo objects automatically.
- Preserve current data before restoring an old snapshot when users may have made newer edits.
- Keep the original revision when restoring a faithful application snapshot unless the restore procedure intentionally defines a new revision policy.
- Prefer a fresh/empty target for migration validation rather than overwriting an existing row.
- Verify referenced photo keys after restore.

## 12. Current data-model limitations

The current one-row JSON model was appropriate for a small trusted group and keeps the product simple, but it has scaling/authorization consequences:

- every logical edit replaces the full payload;
- revision conflicts occur at whole-trip granularity;
- server-side per-member authorization is difficult because the API receives a full state replacement;
- individual entity history is not retained;
- querying/reporting individual activities requires parsing the JSON payload rather than relational queries.

A normalized relational redesign has been discussed historically, but it is **not current architecture** and should not be assumed until implemented.
