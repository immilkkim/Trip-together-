# Trip Together｜同行行程

Trip Together 是一個手機優先的多人旅行規劃 PWA。可信任的小團體可以共用每日行程、活動籃子、邀請／投票、同行成員與相片，並以 revision 機制避免多人同時修改時靜默覆蓋資料。

> **Source of truth**
>
> - `main` 是目前 repository 的 accepted public checkpoint，使用匿名示範資料。
> - 目前獨立 Cloudflare deployment 的程式來源仍是 `migration/independent-cloudflare`；它在 `main` 基礎上加入獨立 Workers 部署、嚴格 runtime configuration 與資料還原工具。
> - 兩者的核心 UI、D1/R2 資料路徑與業務規則相同，但尚未完全合併。詳見 [Project Status](docs/PROJECT_STATUS.md)。

## Current Architecture

```text
Browser / PWA
    |
    v
React 19 + Next.js 16 App Router
    |
    +--> /api/state --------> Drizzle ORM --------> Cloudflare D1
    +--> /api/uploads ----------------------------> Cloudflare R2
    +--> /api/places -----------------------------> OpenStreetMap Nominatim
```

主要畫面「每日行程／活動籃子／投票與邀請」不是三個 Next.js routes；它們由 `components/trip-app.tsx` 在同一個 React app 內以 state 切換。

## Tech Stack

| Layer | Current technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS, shadcn-style UI components |
| Framework | Next.js 16 App Router |
| Build/runtime adapter | Vinext + Vite |
| Backend | Next.js Route Handlers |
| ORM | Drizzle ORM |
| Shared database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 |
| Hosting | Cloudflare Workers for the current independent deployment |
| PWA | Web App Manifest + service worker |

Supabase is **not** part of the current architecture. A separate Supabase guest-mode spike exists only as historical/experimental work; see [Architecture](docs/ARCHITECTURE.md#historical--experimental-architecture).

## Core Capabilities

- Daily timeline with split-group activities and overnight events.
- Activity basket with add/edit/delete and optional photo upload.
- Invitation and voting flow, with leader publication to the itinerary.
- Member selection, member creation and display-name editing.
- Same-member schedule conflict checks while allowing parallel sub-groups.
- Whole-trip shared state with optimistic UI and revision-based stale-write protection.
- Basic offline read fallback using browser cache/localStorage; offline writes are not queued.
- Australia-focused place search through a server-side Nominatim proxy.

## Repository Map

```text
app/                    Next.js pages and Route Handlers
components/             Trip UI and reusable UI components
lib/                    Trip domain types and business rules
db/                     Drizzle D1 client and schema
drizzle/                SQL migrations and Drizzle metadata
public/                  PWA assets and service worker
scripts/                 Local build/runtime helpers
tests/                   Domain regression tests
docs/                    Architecture, status, development and security docs
.openai/hosting.json     D1/R2 binding names for Sites/local tooling
```

## Quick Start

Requirements:

- Node.js `>=22.13.0`
- pnpm `11.25.0` (declared by `packageManager`)
- Git

```bash
git clone https://github.com/immilkkim/Trip-together-.git
cd Trip-together-
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The public source contains anonymous demo data. For local demo access, use the local invite path configured by the source edition; never reuse a production invitation token.

Common checks:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

For D1 migrations, local Worker preview, independent Cloudflare deployment and branch workflow, read [Development](docs/DEVELOPMENT.md).

## Security Model in One Paragraph

Trip Together currently uses a **trusted-group invitation model**, not user authentication. A valid private invite token permits access to the shared trip; the browser then lets the holder select a member identity. The API verifies the invite token and protects shared writes with revision, schedule-range and conflict checks, but individual member/leader permissions are primarily enforced in the client UI rather than by a server-side account identity. Read [Security](docs/SECURITY.md) before changing access control.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — how the system is connected and how data flows.
- [Project Status](docs/PROJECT_STATUS.md) — current checkpoint, deployment state, limits and priority.
- [Development](docs/DEVELOPMENT.md) — rebuild a development environment, test, migrate and deploy.
- [Database](docs/DATABASE.md) — D1 schema, TripState payload, revision/concurrency and storage boundaries.
- [Security](docs/SECURITY.md) — invitation model, trust boundary, safeguards and known limitations.
- [Changelog](docs/CHANGELOG.md) — major architecture and product milestones.

## Public Source vs Private Runtime Data

This repository is public and intentionally contains demo data only. Do not commit production trip data, invitation tokens, Cloudflare credentials, private exports, database dumps or uploaded photos. The live D1/R2 data and Worker secrets are operational resources outside the public source tree.
