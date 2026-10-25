# SECURITY.md

**Purpose:** Record the security model that Trip Together actually implements today, including its trust assumptions and limitations.  
**Current status:** Shared private invitation token + user-selected member identity. This is suitable only for the current trusted-group model and is not true per-user authentication.  
**Last verified:** 2026-10-25

## 1. Security model summary

Trip Together currently uses a **shared bearer-style invitation token** to protect the trip APIs.

After the invite is accepted, the visitor selects a member name from the trip. That selected member ID controls client UI behavior and vote attribution, but the system does not prove that the visitor is really that person.

Therefore the current model is:

```text
Invitation token = trip access authorization
Selected member = client-side identification
Selected member ≠ authenticated user account
```

This trust boundary is deliberate for a small family/friends group. It must not be described as account authentication or strong per-user authorization.

## 2. Invitation token flow

The main app can receive an invite token from:

1. `/join/[token]` route;
2. `?invite=...` query parameter;
3. previously stored `trip-together-invite` in browser localStorage.

`TripApp` remembers a valid supplied token in localStorage and sends it to protected APIs as:

```http
x-trip-invite: <token>
```

Server-side API handlers compare this header with the configured `TRIP_INVITE_TOKEN` value.

The token is a bearer secret: possession is enough to satisfy the trip-level access check.

## 3. Member identity model

The browser stores the selected member ID in:

```text
localStorage["trip-together-member"]
```

The UI uses that member ID for actions such as:

- attributing votes;
- deciding whether to show edit/delete controls;
- deciding whether the selected member is the leader;
- deciding whether the member appears invited to an activity.

Anyone holding the valid trip invite can currently select any member from the list, including the leader.

This is identification within a trusted group, not proof of identity.

## 4. Current API authorization

### `/api/state`

Requires a valid `x-trip-invite` header for both `GET` and `PUT`.

The server additionally enforces:

- submitted revision must match current D1 revision;
- schedule ranges must be valid and within trip bounds;
- changed itinerary entries must not introduce same-member schedule conflicts;
- D1 compare-and-swap update must still match the old revision.

However, `/api/state` accepts the complete next TripState from any holder of the valid invite. The server does not receive an authenticated member identity and therefore does not independently enforce every UI rule such as “only leader publishes” or “only participating member edits this card.”

Those role/member rules are primarily client-side safeguards in the current full app.

### `/api/uploads`

`POST` requires the valid invite token.

The server validates:

- a file is present;
- MIME type is JPEG, PNG or WebP;
- size is at most 5 MB;
- server generates the object key rather than trusting a client pathname.

### `/api/uploads/[key]`

- `DELETE` requires the valid invite token.
- `GET` currently does **not** require the invite token.
- GET validates the key format and returns an R2 object if it exists.

This means an uploaded image URL is effectively public-by-unguessable-key at the application route. Do not describe uploaded photos as fully access-controlled private media.

### `/api/places`

Requires the valid invite token before proxying a Nominatim search.

## 5. Production secret handling

The production invitation token must be provided as a runtime secret named:

```text
TRIP_INVITE_TOKEN
```

Never commit its value.

The independent deployment branch adds strict runtime behavior so production configuration can fail closed when the secret is missing. Current live deployment uses that strict path.

By contrast, `main` currently contains a development fallback to `local-demo-invite`. That fallback is appropriate for the public demo source only. **Do not deploy raw `main` as a private production app without reconciling the strict independent configuration.**

## 6. Secret and private-file rules

Never commit or paste into public issues/PRs/docs:

- private invitation token values;
- Cloudflare API tokens or account credentials;
- D1 private data exports/dumps;
- private trip JSON exports;
- R2 user-uploaded photos;
- generated restore SQL containing private payloads;
- `.env`, `.dev.vars` or generated runtime config containing secrets/private resource identifiers.

Use Cloudflare Worker secrets for production secret values. Use ignored local environment/config files for development-only values.

The public repository should remain demo/anonymized source only.

## 7. Public repository vs private production data

The repository is intentionally public.

The following separation is part of the security model:

```text
Public GitHub
  ├── source code
  ├── anonymous demo TripState
  ├── schema/migrations
  └── binding / variable names

Private Cloudflare account
  ├── Worker secret values
  ├── private D1 TripState
  ├── private R2 objects
  └── account/resource identifiers not needed by source docs
```

Do not solve deployment convenience by copying private runtime data into GitHub.

## 8. Current safeguards

The current code provides useful integrity and access safeguards even though it is not a full account system:

- invalid/missing invite is rejected by protected APIs;
- independent production config can fail closed instead of enabling the demo invite;
- stale revision writes return `409` instead of overwriting newer state;
- D1 updates use a compare-and-swap revision condition to protect races;
- schedule range validation runs server-side;
- newly introduced same-member schedule conflicts are rejected server-side;
- upload type and size are checked server-side;
- upload object keys are server-generated UUID-based names;
- R2 delete and protected external place search require the invite token;
- environment files and local build/runtime state are excluded from normal source commits.

These controls protect shared-trip integrity, but they do not turn member selection into authentication.

## 9. Known security limitations

### 9.1 Shared token compromises the whole trip boundary

There is one shared trip-level credential. If it leaks, the holder can access protected trip APIs until the token is changed.

There is no current UI for expiring or revoking individual people/devices while keeping the same shared invitation valid for others.

### 9.2 Member impersonation is possible by design

A token holder can select another member, including the leader. Client-side role checks therefore cannot defend against a malicious valid-token holder.

### 9.3 Server does not enforce granular member permissions

The state API accepts a full TripState replacement from a valid invite holder. It validates consistency/concurrency rules, but not a cryptographically authenticated actor and per-entity ACL.

### 9.4 Invite/member/offline data is stored in localStorage

The browser stores:

- invite token;
- selected member ID;
- last known TripState.

Implications:

- a shared/unlocked device can expose trip data;
- clearing browser storage forgets the invite/member selection;
- client-side script compromise/XSS would have access to these values;
- the last known private TripState may remain on the device after network access is removed.

### 9.5 Invite can appear in a URL

The `/join/[token]` route carries the bearer token in the URL path. URLs can be copied, stored in browser history or exposed through screenshots/logging if handled carelessly. Treat the full invitation URL as secret.

### 9.6 Uploaded image GET is unauthenticated

Anyone who obtains a valid `/api/uploads/<random-key>` URL can fetch the object through the current route. The random key reduces discovery risk but is not authorization.

### 9.7 No application audit log

The current state stores a revision and latest payload, not an append-only record of who changed what.

### 9.8 No built-in application rate limiter

Current application code does not implement per-token/user request throttling for state writes or uploads.

### 9.9 Validation is not a complete schema/security boundary

`PUT /api/state` performs key structural and schedule checks but does not validate every nested field against a strict shared runtime schema. Treat client-provided payload content as untrusted when extending the API.

## 10. Simplified threat model

| Threat | Current mitigation | Residual risk |
| --- | --- | --- |
| Random unauthenticated visitor | Invite header required on core state/write APIs | Shared token leakage defeats this boundary. |
| Two clients overwrite each other | Revision equality + CAS update | Whole-trip conflict granularity can cause retries. |
| User creates overlapping itinerary for same member | Server schedule/conflict validation | Does not address malicious non-schedule payload changes. |
| Malicious valid-token holder impersonates leader | None at identity-proof level | Accepted trusted-group limitation. |
| Arbitrary file upload | MIME/size allowlist + server-generated key | Content scanning is not implemented. |
| Photo URL is forwarded | Random key | GET route has no invite check. |
| Database/storage outage | Independent strict deployment can return failure instead of silent demo fallback | Offline browser may still show stale local cached data. |
| Public repository leaks private trip | Demo/public-source policy + ignored secret/data files | Human error can still commit private files; review diffs. |

## 11. Historical Supabase security experiment

`rebuild/next-supabase-guest-spike` explored a stronger guest capability model with hashed invitations, expiring/revocable guest sessions, private PostgreSQL schema/RPC boundaries and finer-grained server-side operations.

That work is **Historical / Experimental**. It was not adopted as the current full app and must not be cited as a security property of the D1/R2 production application.

## 12. Before expanding beyond a trusted group

Before inviting unrelated users or commercial customers, the minimum security architecture should be revisited. Likely requirements include true user authentication, server-derived actor identity, granular authorization, invitation/session revocation, auditability and private media access control.

Those are future requirements, not claims about the current implementation.
