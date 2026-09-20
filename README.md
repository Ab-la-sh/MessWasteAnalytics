# MessWaste Analytics

Multi-mess college food-waste tracking and analytics. Next.js 14 (App Router) + TypeScript + Tailwind, Prisma + PostgreSQL, JWT auth in an httpOnly cookie.

## Setup

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL and JWT_SECRET
npx prisma migrate dev          # first run creates the schema (the init migration is included)
npm run seed                    # menu/weather/calendar reference data + ~3 weeks of demo waste records
npm run dev                     # http://localhost:3000
```

Generate a JWT secret:
```bash
openssl rand -base64 48
```

**Demo logins** (printed at the end of `npm run seed`; change them in a real deployment):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@messwaste.local` | `Admin@12345` |
| Data Collector (per mess) | `collector.m1@messwaste.local` … `collector.m4@messwaste.local` | `Collector@12345` |

Sanity checks after pulling a new phase: `npx tsc --noEmit`, `npm run build`, and `npm test`.

`npm test` runs 118 unit tests over the pure logic (the prediction model, anomaly
detection, notification builders). No database or network needed — it finishes in
under a second, so run it before any commit that touches `src/lib/prediction.ts`,
`src/lib/anomaly.ts` or `src/lib/notifications.ts`.

## Project layout

```
prisma/schema.prisma          All entities: Mess, User, MenuSlot, WasteRecord, WeatherDaily, CalendarDay
prisma/seed-data/             Drop-in CSVs for the seed script (see its README)
scripts/seed.ts, seed-lib/    Idempotent seed (CSV ingestion + deterministic synthetic fallback)
tests/                        Unit tests for the pure logic — `npm test`
middleware.ts                 Edge route guard: verifies the JWT cookie, redirects to /login
src/app/api/                  Route handlers: auth, users, mess, menu-slots (+ /copy), waste-records, weather,
                              analytics/*, predict (+ /forecast), notifications, export
src/app/login/                Public login page
src/app/(app)/                Authenticated shell + pages: dashboard, data-collection, records, analytics,
                              menu-management, reports, settings
src/components/
  ui/                         Design-system primitives (Button, Card, Input, Modal, Table, Pagination, ...)
  layout/                     Sidebar, Topbar, MobileNav, MessSelector, PageHeader
  dashboard/  data-collection/  records/  analytics/  settings/  menu/  reports/    Feature components
src/lib/
  constants.ts / form-options.ts   Fixed lists (server / client-safe mirror) — keep in sync with the Prisma enums
  auth.ts, require-auth.ts         Password hashing, JWT, requireAuth / requireRole / resolveMessScope
  validation/                      Zod schemas per API route
  analytics.ts, calculations.ts    Server-side aggregation + waste maths
  prediction.ts                    Waste-prediction model (pure, unit-tested)
  anomaly.ts, notifications.ts     Shared outlier detection + derived alert builders (pure)
  api-client.ts, use-api.ts        Client fetch wrapper + GET data hook
  record-filters.ts, analytics-client.ts, format.ts   Pure client helpers (unit-testable)
  auth-context.tsx, mess-context.tsx                  Client contexts (user, top-bar mess selection)
```

## Build progress

- [x] Phase 1 — Project scaffold, Prisma schema, core lib utilities
- [x] Phase 2 — Auth API routes + role-based access middleware
- [x] Phase 3 — Core CRUD APIs: Mess, MenuSlot, WasteRecord
- [x] Phase 4 — Weather integration (Open-Meteo) + WeatherDaily caching
- [x] Phase 5 — Analytics/aggregation APIs
- [x] Phase 6 — Seed script (CSV ingestion) + CSV/Excel export
- [x] Phase 7a — Frontend foundation: Tailwind design system, auth pages, app shell, Dashboard, Data Collection form
- [x] Phase 7b, part 1 — Records page (filters, sort, pagination, view/edit/delete, export) + Analytics page
- [x] Phase 7b, part 2 — Settings (+ `/api/users`), Menu Management, Reports / Export — every page in the sidebar is now real
- [x] **Phase 8 — AI Waste Prediction, notifications/high-waste alerts, schedule-aware Data Collection** (this delivery)

### Notes on Phase 1 design decisions
- **Menu tags are a fixed `MenuTag` enum** in `schema.prisma`, mirrored in `src/lib/constants.ts`. No API route will ever allow creating/editing this list.
- **Week type (A/B)** is derived from date via a 14-day cycle anchor (`CYCLE_ANCHOR_DATE` in `constants.ts`) — override this once you confirm the real cycle start date from your calendar CSV.
- **All waste calculations** (`totalWasteKg`, `wastePerPerson`, `wastePercent`) are computed server-side only, in `src/lib/calculations.ts` — client-submitted values for these fields are always ignored by the API (built in Phase 3).
- **Data Collector accounts are scoped to one mess** via `User.messId`; Admins have `messId = null` and can act across all messes. This scoping check will be enforced in Phase 2's middleware and used by every route after.
- Auth uses **JWT in an httpOnly cookie** (`src/lib/auth.ts`), not a DB session table — simpler ops, and revocation-on-logout is handled by clearing the cookie (short 8h expiry limits exposure; can add a token-blocklist table later if you need hard revocation).

### Phase 2 additions
- `src/lib/api-response.ts` — `apiSuccess`/`apiError` helpers + `withErrorHandling` wrapper + `ApiHttpError` for clean throw-to-HTTP-status control flow.
- `src/lib/require-auth.ts` — `requireAuth(req)` (401 if not logged in or account deactivated), `requireRole(ctx, ...roles)` (403 if wrong role), `resolveMessScope(ctx, requestedMessId)` (enforces Data Collector mess-scoping; Admins pass through).
- `src/lib/validation/auth.ts` — Zod schemas for login/signup.
- Routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/signup`.

**Signup rule:** creating a user is Admin-only, *except* the very first account ever created (empty `users` table) — that one bootstrap signup must be an Admin and is allowed unauthenticated, so there's a way to get started before the seed script runs. Every signup after that requires a valid Admin session cookie.

**How every future protected route will look** (Phase 3 onward):
```ts
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN', 'DATA_COLLECTOR'); // or omit if any authenticated user is fine
  const messId = resolveMessScope(ctx, body.messId); // throws 403 if a Data Collector tries another mess
  // ...
});
```

### Phase 3 additions
- `src/lib/query.ts` — `searchParamsToObject(req)` turns `URLSearchParams` into a plain object so list/filter query strings can be validated with the same Zod pattern as request bodies (repeated keys, e.g. `?tags=A&tags=B`, collapse into an array).
- `src/types/api.ts` — added `PaginationMeta` / `PaginatedData<T>` for list endpoints.
- `src/lib/validation/{mess,menu-slot,waste-record}.ts` — Zod schemas for each entity's create/update bodies and list-query params.

**Routes (all wrapped in `withErrorHandling`, all require auth):**
| Route | Access |
|---|---|
| `GET /api/mess` | any authenticated user (mess selector) |
| `POST /api/mess` | Admin |
| `GET/PATCH/DELETE /api/mess/:id` | GET any user; PATCH/DELETE Admin |
| `GET /api/menu-slots` | any user, mess-scoped for Data Collectors |
| `POST /api/menu-slots` | Admin |
| `GET /api/menu-slots/:id` | any user (mess-scoped) |
| `PATCH/DELETE /api/menu-slots/:id` | Admin |
| `GET /api/waste-records` | any user, mess-scoped for Data Collectors; filters: `messId, mealSlot, weekType, dayOfWeek, eventType, scheduleDeviation, tags, dateFrom, dateTo, search`; pagination `page/pageSize`; sort `sortBy/sortDir` |
| `POST /api/waste-records` | any user; Data Collector's `messId` is implied by their account |
| `GET/PATCH /api/waste-records/:id` | mess-scoped (Data Collector: own mess only) |
| `DELETE /api/waste-records/:id` | Admin only |

**Design decisions:**
- `totalWasteKg`, `wastePerPerson`, `wastePercent` are **always** recomputed server-side from `computeWasteDerivedFields` on both create and update — any client-submitted values for these are ignored (the Zod schemas don't even accept them).
- `dayOfWeek` is always derived from `date`; `weekType` is derived from `date` via the 14-day cycle but can be explicitly overridden (matches "auto from date, editable" in the spec).
- On create/update, the route auto-looks up the matching `MenuSlot` (by mess/weekType/dayOfWeek/mealSlot) and links it via `menuSlotId` — this is what the frontend will use to show the expected menu and build the "Historical Insight" comparison later; it's separate from the coordinator's own `scheduleDeviation` toggle, which stays a manual field per the spec.
- `temperatureC`/`rainfallMm` are filled from the `WeatherDaily` cache if a row exists for that mess+date; Phase 4 adds the "fetch from Open-Meteo if missing, then cache" step so this always resolves instead of falling back to `null`.
- One `WasteRecord` per `(messId, date, mealSlot)` and one `MenuSlot` per `(messId, weekType, dayOfWeek, mealSlot)` — both enforced at the DB level and checked explicitly for a clean 409 instead of a raw Prisma constraint error.
- Deleting a `Mess` cascades to its `MenuSlot`s and `WasteRecord`s (schema-level `onDelete: Cascade`) — prefer `PATCH { isActive: false }` unless you actually want the history gone.

### Phase 4 additions
- `src/lib/weather.ts` — real Open-Meteo client (`fetchWeatherFromApi`) and cache-first `getOrFetchWeather(mess, date)`: checks `WeatherDaily` first, calls Open-Meteo only on a miss, then persists the result so that mess/date never hits the API again.
  - Two endpoints, picked automatically by date: the **Forecast API** (`api.open-meteo.com/v1/forecast`) for today/future/recent-past (last 6 days), the **Archive API** (`archive-api.open-meteo.com/v1/archive`, ERA5 reanalysis) for anything older, since the archive has a ~5-6 day data lag. No API key needed either way.
  - Never throws. A network error, timeout (8s), non-200, or missing data for that date all come back as `fetchFailed: true` so callers can degrade gracefully — per the spec's "loading/fallback state if the API call fails" — instead of blocking a record submission.
- `GET /api/weather?messId=&date=YYYY-MM-DD` — the endpoint the Data Collection form calls to auto-fill its read-only temperature/rainfall fields. Always responds `200`; check `data.fetchFailed` client-side to show the fallback state, and `data.weather` will be `null` in that case.
- `POST` and `PATCH /api/waste-records` now call `getOrFetchWeather` instead of a cache-only read, so submitting a record for a brand-new date fetches and caches live weather automatically.
- **IIT Madras default location.** Every mess in this deployment is a hall on the IIT Madras campus (12.99151°N, 80.23362°E, `Asia/Kolkata`), added as `IIT_MADRAS_LOCATION` in `src/lib/constants.ts`. `POST /api/mess`'s `latitude`/`longitude`/`timezone` now default to it, so creating "Mess 1"–"Mess 4" without specifying coordinates still gets correct, real weather for all of them. Override per-mess only if one is ever genuinely elsewhere.
- `humidityPercent` on `WeatherDaily` is intentionally left `null` by the live fetch path — Open-Meteo's daily aggregation doesn't include a clean daily-mean humidity figure, and the spec's full-year weather CSV (Phase 6 seed) already carries it, so seeded historical rows will have it populated while live-fetched rows won't. Not used in any calculation, so this doesn't block anything.

### Phase 5 additions
- `src/lib/analytics.ts` — shared aggregation/statistics helpers used by every route below: `mean`/`stddev`/`pearsonCorrelation`/`pctChange`, `groupBy`, date bucketing (`bucketFor` daily/weekly/monthly), `aggregateRecords`/`buildTrendSeries` (turn a set of `WasteRecord`-shaped rows into KPI-style aggregates or a bucketed time series), and display-label lookups (`mealSlotLabel`, `dayOfWeekLabel`).
- `src/lib/validation/analytics.ts` — Zod query schemas for every analytics route, all sharing `analyticsBaseQuerySchema` (`messId`, `dateFrom`, `dateTo` — all optional; omitted `messId` means "combined across all messes" for Admins, and is force-narrowed to the caller's own mess for Data Collectors via `resolveMessScope`, same as every other route).
- `src/lib/date-utils.ts` — added `addDaysUTC` (used for "previous day"/"previous week" comparisons).

**Aggregation happens in application code, not `prisma.wasteRecord.groupBy`** — several endpoints need week/month date-bucketing that `groupBy` can't express, and this dataset (one college, a handful of messes, daily records) is small enough that this is simpler and just as fast. If this ever needs to scale to many campuses, these are the functions to move into raw SQL or a materialized view.

**Routes (all wrapped in `withErrorHandling`, all require auth, all mess-scoped via `resolveMessScope`):**
| Route | Purpose |
|---|---|
| `GET /api/analytics/summary?messId=` | Dashboard KPI cards: Total Waste Today, Waste per Person, Estimated Cost Wasted ₹, Average Weekly Waste — each with `trendPct` vs. the previous period |
| `GET /api/analytics/trends?messId=&granularity=daily\|weekly\|monthly&dateFrom=&dateTo=&splitByMess=true` | Waste trend over time (Dashboard + Analytics). `splitByMess` adds a per-mess breakdown alongside the combined series (Admin/combined view only) |
| `GET /api/analytics/breakdown?by=mealSlot\|dayOfWeek\|weekType\|eventType&messId=&dateFrom=&dateTo=` | One endpoint for "waste by meal slot" and "waste by day of week" (plus week type / event type for free) — pick the dimension with `by` |
| `GET /api/analytics/composition?messId=&dateFrom=&dateTo=` | Plate / counter / packaging waste composition split, with percentages |
| `GET /api/analytics/correlation?metric=quantityPrepared\|totalIngredientCost&messId=&dateFrom=&dateTo=&limit=` | "Quantity prepared vs waste" and "ingredient cost vs waste" — scatter points + Pearson correlation coefficient |
| `GET /api/analytics/historical-average?messId=&mealSlot=&date=` (or `&dayOfWeek=&weekType=`) `&tags=` | Backs the Data Collection form's "Historical average: similar Monday Lunch meals typically generate 18.4 kg of waste" line. Averages past records matching mess × day-of-week × meal-slot × week-type (+ overlapping tags if given), excluding the date being edited |
| `GET /api/analytics/anomalies?messId=&dateFrom=&dateTo=&thresholdStdDev=&limit=` | High-waste pattern detection: flags records whose `wastePercent` is `thresholdStdDev` (default 1.5) standard deviations above the mean for their own (mess, meal slot) baseline — a group needs ≥5 records before anything in it can be called an outlier |
| `GET /api/analytics/insights?messId=&dateFrom=&dateTo=` | Auto-generated smart insight strings for the Dashboard (e.g. "Lunch waste is consistently higher on Mondays," "Waste decreased 14% vs last month") — each rule only fires when the signal clears a real margin, so weak/noisy signals are simply omitted rather than padding out a fixed-length list |

**Design decisions:**
- **"Today" = the most recent date with a matching record**, not the literal server date. This is seeded, largely-historical data (all of 2024) — anchoring the summary KPIs to the real calendar date would show an empty dashboard until live entry catches up to the present, after which it's the same thing.
- **"Average weekly waste"** divides the trailing week's total waste by the number of *days that actually have records* in that window (not a flat ÷7), since a mess may not log every day.
- **Anomaly baselines are scoped to (mess, meal slot)** — Breakfast and Lunch naturally run at different waste levels, so comparing a record only against its own meal slot's own history is what makes a z-score meaningful here.
- **Insights are threshold-gated, not always-on** — with a modest dataset, always returning "Day X has the most waste" even when every day is within noise of each other would be actively misleading. Each rule requires its signal to clear a real margin (a day/meal average ≥15% above the rest, a month-over-month change ≥5%) before it's surfaced.

### Phase 6 additions

**⚠️ Your CSVs aren't in this delivery yet.** I don't have the actual per-mess menu, weather, or academic-calendar files — only the column list you described in the spec. `npm run seed` runs today anyway: drop your real files into `prisma/seed-data/` (exact filenames/columns documented in `prisma/seed-data/README.md`) and it ingests them; for anything missing it deterministically generates synthetic data with the same shape so the app is fully populated either way. Re-run `npm run seed` any time — it's idempotent (upserts for Mess/User/MenuSlot/WasteRecord; `createMany skipDuplicates` for the two big reference tables, CalendarDay/WeatherDaily).

- `prisma/seed-data/` — where your 6 CSVs go (`mess-1-menu.csv` … `mess-4-menu.csv`, `weather.csv`, `academic-calendar.csv`). **Read `prisma/seed-data/README.md` first** — it documents the exact expected columns and, importantly, the mapping assumptions the seed script makes where your spec's CSV columns don't map 1:1 onto the schema (menu tags aren't in the source data at all, so they're inferred; Snacks has no source columns, so it gets a small editable default; day-level flags like `pct_gravy_dishes`/`has_biryani`/`has_paneer`/`has_desert` get applied to both Lunch and Dinner since the CSV doesn't split them by meal). All of this is easy to correct once through Menu Management after seeding, or by adjusting `scripts/seed-lib/menu.ts` before re-seeding.
- `scripts/seed-lib/{csv,menu,weather,calendar,users,demo-records,rng}.ts` — one small, focused module per concern rather than one large script:
  - `csv.ts` — shared CSV reader (case/format-insensitive header matching, boolean/number coercion).
  - `menu.ts` — reads a mess's menu CSV (if present) and **averages/majority-votes every row onto its (week-type, day-of-week) bucket** — this works whether your file has exactly 14 rows or a full 365, since the whole point of the 14-day cycle is that every bucket gets many observations across the year.
  - `weather.ts` / `calendar.ts` — full-year 2024 ingestion with day-by-day gap-filling (a CSV with some missing dates doesn't break the run — only the missing days fall back to synthetic).
  - `rng.ts` — seeded PRNG (mulberry32) purely for the synthetic-fallback paths, so re-running the seed without real CSVs yet still produces the *same* numbers each time instead of a new random dataset.
  - `users.ts` — 1 Admin (`admin@messwaste.local`) + 1 Data Collector per mess (`collector.m1@messwaste.local` etc.), fixed demo passwords printed at the end of the seed run.
  - `demo-records.ts` — ~21 trailing days x 4 meal slots x 4 messes of realistic `WasteRecord`s (not a full year — real daily collection is what the year is for), tagged from the matching seeded `MenuSlot` and weather-backfilled from the just-seeded `WeatherDaily` cache, so the Dashboard/Analytics/Records pages have real-looking data to render the moment Phase 7 lands.
- `src/lib/export.ts` + `src/lib/validation/export.ts` — `GET /api/export/waste-records?format=csv|xlsx&...` (Admin-only). Reuses the **exact same filter query shape** as `GET /api/waste-records` (mess/meal/week-type/day/event/deviation/tags/date-range/search), just without pagination — so the frontend's "Export" button can carry over whatever filters are active on the Records page as-is. Columns are flat and ML-friendly: one row per record, booleans as 0/1, tags semicolon-joined, plus the linked `MenuSlot`'s item-count/gravy-%/flags inlined alongside the waste numbers.

**Design decisions:**
- The seed script never invents a `WasteRecord` beyond the trailing ~3 weeks of demo data — everything else (`MenuSlot`, `WeatherDaily`, `CalendarDay`) is full-year reference data, but daily waste entries are meant to come from real coordinator submissions once Phase 7's Data Collection form exists.
- CalendarDay/WeatherDaily use `createMany({ skipDuplicates: true })` instead of per-row upsert — they're pure reference data and this is a lot faster for ~1,825 rows total; if you replace the CSVs and want the DB to pick up new values, clear those two tables first (noted in `scripts/seed.ts`'s header comment).

### Phase 7a additions

**New dependencies** — run `npm install` before `npm run dev` (they weren't in the backend-only delivery): `tailwindcss`, `autoprefixer`, `postcss` (dev); `recharts`, `lucide-react`, `clsx`, `tailwind-merge`, `sonner` (runtime). No new env vars.

- **Design system** (`tailwind.config.ts`, `src/app/globals.css`, `src/components/ui/*`) — navy/indigo/purple accent palette on a light `surface` background, Inter font via `next/font/google`, subtle-shadow cards, shimmer skeletons. Primitives: `Button`, `Card`, `Badge`, `Input`/`Select`/`Textarea`/`Label`, `ChipSelect` (menu-tag multi-select), `Switch`, `Skeleton`/`Spinner`/`EmptyState`.
- **`middleware.ts`** — edge-runtime route guard. Verifies the `messwaste_token` JWT cookie with `jose` (no DB call) and redirects unauthenticated page navigation to `/login?next=...`; API routes are left alone (they already enforce their own auth via `requireAuth`).
- **`src/lib/auth-context.tsx`** / **`src/lib/mess-context.tsx`** — client contexts. `AuthProvider` wraps the whole app (root layout) and loads `/api/auth/me` once; `MessProvider` wraps the authenticated app shell only and backs the top-bar mess selector — Admins get an "All Messes" combined view (persisted in `localStorage`) plus every mess; Data Collectors are pinned to their own mess and the selector is disabled for them.
- **`src/lib/api-client.ts`** — thin `fetch` wrapper matching every route's `{ data } | { error }` shape (see `src/lib/api-response.ts`); throws a typed `ApiError` on non-2xx.
- **`src/types/models.ts`** + **`src/lib/form-options.ts`** — client-safe mirrors of the Prisma enum types and `src/lib/constants.ts`'s fixed lists (menu tags, meal slots, etc.). Deliberately duplicated rather than imported: `@prisma/client`'s generated runtime must never end up in a browser bundle. **If you ever change the fixed lists (e.g. add a menu tag), update the Prisma enum, `src/lib/constants.ts`, AND `src/lib/form-options.ts` together** — this is now the one manual sync point in the codebase.
- **App shell** (`src/app/(app)/layout.tsx`, `Sidebar`, `Topbar`, `MobileNav`, `MessSelector`) — fixed sidebar (desktop) / slide-out drawer (mobile) with the 7 nav items from the spec, Menu Management hidden for non-Admins; top bar has search (wired up in 7b part 1 — Enter opens the Records page with that search), a notification bell (static), today's date, and the mess selector.
- **Dashboard** (`src/app/(app)/dashboard/page.tsx` + `src/components/dashboard/*`) — 4 KPI cards with trend arrows (`/api/analytics/summary`), waste-trend line chart (`/api/analytics/trends`), waste-by-meal-slot and waste-by-day-of-week bar charts (`/api/analytics/breakdown`), waste-composition donut (`/api/analytics/composition`), quantity-prepared-vs-waste scatter with Pearson `r` (`/api/analytics/correlation`), auto-generated Smart Insights list (`/api/analytics/insights`), and the "AI Waste Prediction — Coming Soon" placeholder card. Every widget re-fetches when the top-bar mess selector changes; all six calls run in parallel per selection change.
- **Data Collection** (`src/app/(app)/data-collection/page.tsx` + `src/components/data-collection/*`) — the full daily form per the spec: mess (locked for Data Collectors, selectable for Admins), date, meal slot, week-type (auto-derived client-side from date via the same 14-day cycle math as the server, editable — the override is only sent to the API if the coordinator actually touched it, otherwise the server derives it itself), day-of-week (read-only); plate/counter/packaging waste with a live auto-calculated total; headcount, quantity + unit, ingredient cost, with a live auto-calculated waste-per-person; temperature/rainfall auto-fetched from `GET /api/weather` on mess/date change with loading and failed-fetch fallback states; calendar/event type; schedule-deviation toggle that reveals reason + description fields (reason required before submit); the fixed menu-tag chip multi-select; free-text notes; and a live Historical Insight banner from `GET /api/analytics/historical-average`, refetched on mess/date/meal-slot change. Submits to `POST /api/waste-records`; a 409 (duplicate mess/date/meal-slot) surfaces as a clear toast instead of a generic error.
- **Records / Analytics / Menu Management / Reports / Settings** *(all five are now fully built — see 7b parts 1 and 2; the placeholder component has been removed)* — each has a real page at its route (`src/components/layout/ComingSoonPage.tsx`) explaining what's coming and which already-live API route backs it, so the nav is fully wired and nothing 404s while Phase 7b is pending.

**Design decisions:**
- Auth state lives in a client `AuthProvider`, not React Server Components — every page under `(app)` is a client component reading `useAuth()`/`useMess()`. This trades a little SSR performance for a much simpler mental model given how much of this app is "logged-in dashboard," and `middleware.ts` still prevents any real flash-of-unauthenticated-content by redirecting at the edge before the page ever renders.
- The mess selector's "All Messes" view is only meaningful for Admins; every analytics/dashboard fetch simply omits `messId` in that case, which every route already treats as "combined" (see Phase 5 notes above) — no special-casing needed on the frontend beyond not sending the param.
- Total waste and waste-per-person are computed **client-side too**, live, purely for the coordinator's immediate feedback while typing — the server-side `computeWasteDerivedFields` in `src/lib/calculations.ts` remains the single source of truth actually persisted; the client's numbers are never sent.

### Phase 7b (part 1) additions — Records + Analytics

No new dependencies and no schema changes — `npm install` and migrations are unchanged from 7a. Both pages run entirely on API routes that already existed.

**Shared building blocks (reused by part 2):**
- `src/lib/use-api.ts` — `useApi<T>(path, query | null)`: GET hook that refetches when the serialised query changes, ignores out-of-order responses, and **keeps the previous data while refetching** so tables/charts dim instead of flashing to a skeleton. Returns `{ data, loading, error, reload }`. Pass `null` as the query to hold a request back until something else is ready.
- `src/lib/use-debounce.ts` (`useDebouncedValue`), `src/lib/format.ts` (`formatDate`, `formatQuantity`, `mealSlotLabel`, `eventTypeLabel`, `menuTagLabel`, `addDaysIso`, …).
- UI primitives: `Modal` (portal-rendered; Esc/backdrop close; bottom sheet on phones), `ConfirmDialog`, `Pagination`, `SegmentedControl`, and `Table` / `Th` / `SortableTh` / `Td`.
- `src/types/models.ts` — added `TrendsResponse`, `BreakdownResponse`, `CorrelationResponse`, `AnomaliesResponse`, `SortDir`, `Granularity`.

**Records** — `src/app/(app)/records/page.tsx`, `src/components/records/*`, `src/lib/record-filters.ts`
- Table columns per the spec: Date, Mess, Meal, Headcount, Quantity Prepared, Total Waste, Waste per Person, Ingredient Cost, Week Type, Schedule Deviation. Server-side sorting on the numeric columns and date, server-side pagination (10/25/50/100 per page).
- Filters: debounced search (notes, deviation reason, mess name), date range, meal, and — under "More" — week type, day of week, event type, schedule deviation (any / deviated / followed), and menu tags (matches any selected). The filter panel opens by itself if a deep link sets one of the "More" filters.
- **Mess filter = the top-bar selector.** It's the single source of truth for mess scope on Dashboard, Records, and Analytics, so the page doesn't carry a second, competing mess dropdown. Data Collectors are pinned to their own mess (server-enforced too).
- The page number resets to 1 whenever anything that changes the result set changes (filters, sort, page size, mess).
- **Row click / eye icon → detail modal**: KPI strip, plate/counter/packaging composition bar, volume & cost, weather, deviation reason/description, tags, notes, audit trail, and the **scheduled menu for that slot** (fetched from `GET /api/waste-records/:id`, since the list endpoint doesn't include it).
- **Edit modal** (any user, within their mess scope) → `PATCH /api/waste-records/:id`. Totals are previewed live but always recomputed server-side. `weekType` is only sent when it differs from the value derived from the date (a genuine override); changing date/meal re-checks the duplicate constraint (409 → toast) and re-fetches weather server-side. The edit form intentionally does not let you move a record to another mess.
- **Delete** is Admin-only (button hidden for Data Collectors, and the API enforces it) with a confirm dialog.
- **Export**: Admins get CSV / Excel buttons that carry the *current* filters and mess selection straight into `GET /api/export/waste-records`. (The dedicated Reports page in part 2 will build on the same `buildExportUrl`.)
- **Top-bar search now works**: Enter hands off to `/records?search=…`. The Records page also understands `dateFrom`, `dateTo`, `mealSlot`, `weekType`, `dayOfWeek`, `eventType`, `scheduleDeviation` in the URL (validated against the fixed lists, never trusted blindly) — the Analytics anomaly table uses this to deep-link to a specific meal.
- **Backend fix:** `PATCH /api/waste-records/:id` used `input.deviationDescription ?? existing…`, which made it impossible to clear a deviation description (`null` fell back to the old value). It now treats only `undefined` as "not sent".

**Analytics** — `src/app/(app)/analytics/page.tsx`, `src/components/analytics/*`, `src/lib/analytics-client.ts`
- **Date range**: Last 14 / 30 / 90 days, All time, or Custom. Presets count back from the **newest record**, not from today (same convention as the Dashboard KPIs) — the seeded data ends in 2024, so "last 30 days from today" would always be empty.
- **Trend explorer** — daily / weekly / monthly; metric = total waste, waste per person, waste %, or ingredient cost; and, for Admins on the combined view only, a **By mess** toggle that overlays one line per mess (uses `splitByMess=true` on `/api/analytics/trends`).
- **Where waste concentrates** — one chart, tabs for day of week / meal / week type / event type, metric selector (average per meal by default, so days with more meals logged don't look worse by volume alone). The highest bar is highlighted.
- **Period comparison** — the selected window against the equally long window immediately before it (total waste, waste per person, waste %, ingredient cost, with % change). Needs a bounded range, so it asks for a preset/custom range when on All time. Averages are weighted by record count so they're exact, and the card shows how many meals each side is based on. Ingredient cost is deliberately *not* coloured red/green — spending less isn't automatically good.
- **Correlation** — quantity prepared vs waste and ingredient cost vs waste, each with its Pearson `r`.
- **High-waste alerts** — `/api/analytics/anomalies` with a sensitivity selector (1σ–3σ above the mess+meal baseline; default 1.5σ), spike badges, deviation/event context, and an "Open" link into Records for that meal.

**Verification status of this batch (please read):** this delivery was written without network access, so `npm install`, `next build`, and a browser run could **not** be done in the environment it was built in. What *was* done: every new/changed file was type-checked offline (`tsc --strict`) against stand-in module declarations, the pure logic (`record-filters`, `analytics-client`, `format`, pagination window) was unit-tested with `tsx`, and the new table/filter/pagination/card components were server-rendered in a Node smoke test. What that can't catch: mismatches with real library typings (Recharts, Next) and visual/interaction issues. Please run `npx tsc --noEmit` and `npm run build`, click through Records and Analytics once, and report anything that fails — those fixes are tiny and are the first item of part 2.

### Phase 7b (part 2) additions — Settings, Menu Management, Reports / Export

No new dependencies and **no schema changes / no new migration** — `npm install` and `prisma migrate` are unchanged.

**Backend**
- `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` (Admin only). Responses use one shared select (`src/lib/user-select.ts`) so a password hash can never leave the API. Rules enforced server-side: a Data Collector must have a `messId`, an Admin never does (any `messId` sent with an Admin is normalised to `null`); emails are unique; an Admin can't change their own role, deactivate, or delete themselves; **the last active Admin can never be demoted, deactivated or deleted**; `PATCH { password }` is an Admin password reset. `DELETE` is only allowed for accounts that never created/edited a record — otherwise it returns 409 telling you to deactivate instead (deactivated users can't sign in, and `requireAuth` re-checks `isActive` on every request, so it takes effect immediately even for live sessions).
- `PATCH /api/auth/me` (edit own display name) and `POST /api/auth/change-password` (needs the current password; a wrong one is a 400, not a 401, so the client doesn't mistake it for an expired session).
- `POST /api/menu-slots/copy` (Admin) — copies one mess/week's whole schedule onto another mess/week in a single transaction. `overwrite=false` (default) only fills empty target cells; `true` replaces matching ones. Never deletes anything. Returns `{ created, updated, skipped, total }`.
- **Email handling changed slightly:** emails are now trimmed + lower-cased in login, signup and user management, so `Bob@x.com` and `bob@x.com` can't become two accounts or fail to match at sign-in. (The seed emails were already lower-case. If you hand-created a mixed-case account through the old signup route, log in with the lower-case form or re-create it.)
- `passwordSchema` (new accounts / password changes): 8–72 chars with at least one letter and one number. The 72 cap is bcrypt's limit — longer input would otherwise be silently truncated. Existing passwords are unaffected.

**Settings** — `src/app/(app)/settings/page.tsx`, `src/components/settings/*`
- **Profile** (everyone): edit display name; change password with inline field errors. Email/role/mess are read-only here.
- **Users** (Admin): searchable list with role filter; add / edit (name, email, role, mess, active, optional password reset) / deactivate-reactivate / delete. You can't deactivate or delete your own row.
- **Messes** (Admin): list including inactive ones; add / edit name, code, latitude/longitude, timezone, active. There is deliberately **no delete button** — deleting a mess cascades to all its menu slots and waste records; deactivate instead (the API's hard delete still exists). Saving a mess refreshes the top-bar selector (`MessProvider` now exposes `reload()`). Changing coordinates only affects weather fetched from then on — already-cached `WeatherDaily` rows keep their values (the form says so).

**Menu Management** (Admin only; others see a locked message) — `src/app/(app)/menu-management/page.tsx`, `src/components/menu/*`, `src/lib/menu-grid.ts`
- Week A / Week B tabs, each showing how many of the 28 slots are defined. 7 days × 4 meals grid; each cell summarises item count, % gravy, flag chips and tag count. Click a cell to add or edit: item count, % gravy, the six flags (biryani, paneer, egg breakfast, dessert, dosa, paratha), the fixed tag chips, notes; existing slots can be removed.
- **Copy menu…** — Week A → B (or B → A) within a mess, or from another mess, with the replace-existing switch above.
- A schedule belongs to one mess, so with the top bar on "All messes" the page asks you to pick one (buttons set the top-bar selection).

**Reports / Export** (Admin only) — `src/app/(app)/reports/page.tsx`, `src/components/reports/ColumnDictionary.tsx`, `src/lib/{report-utils,export-columns}.ts`
- Reuses the Records filter panel (dates, meal, week, day, event, deviation, tags, search) and the top-bar mess selector. Quick ranges (last 30 / 90 days / all dates) count back from the **latest record**, like Dashboard and Analytics.
- A live "N records will be exported" count (`GET /api/waste-records?pageSize=1` → `pagination.total`), scope chips summarising the filters, CSV / Excel toggle, and a download button that stays disabled until the count has caught up with the filters (so the file always matches what's on screen) and is non-zero.
- **Column dictionary** — all 31 export columns grouped and described. It is typed `Record<keyof ExportRow, …>`, so adding or renaming an export column without documenting it is a compile error.

**Design decisions / things to know:**
- Password resets and deactivation don't revoke *other* live JWTs by themselves — deactivation works instantly because `requireAuth` checks the DB; a password reset just means the old password stops working at next sign-in. Server-side session revocation would need a token-version column (not added; no schema change this batch).
- The slot editor's tag chips describe what's normally served in that slot. The Data Collection form does **not** pre-fill its tags from the schedule (it only links the record to the slot for the deviation check) — see suggestions below.

**Verification status of this batch (please read):** same constraints as part 1 — no network here, so `npm install`, `next build` and a browser run were **not** possible. What *was* done: the new zod schemas and pure helpers were unit-tested for real with `tsx` against zod 3.23 (login email normalisation, password rules, create/update user rules, copy-menu validation, slot-draft → API payload compatibility, mess/user/password form validators, scope descriptions — 14 tests, all passing, including cross-checks that client payloads satisfy the *server* schemas); every new/changed file was type-checked with `tsc --strict` against stub declarations for React/Next/Prisma (so cross-file imports, props and helper signatures are verified, but real Recharts/Next/Prisma typings are not); `MenuGrid` and `ColumnDictionary` were server-rendered with real React; and the column dictionary was diffed against `ExportRow` (31/31, same order). What that can't catch: mismatches with real Prisma/Next typings and anything visual or interaction-related. Please run `npx tsc --noEmit` and `npm run build`, then click through: Settings (all three tabs), Menu Management (edit a cell, copy A→B), and a Reports download. Send me any errors and I'll fix them first thing next session.

**Post-delivery fixes (`npx tsc --noEmit` / `npm run build` — 8 errors across 6 files, all cleared).** Two root causes, both in pre-Phase-8 code that the stub type-check couldn't see because the stand-in Prisma types are `any`:

1. **`src/lib/validation/menu-slot.ts` — `menuTagValues` was cast `as [string, ...string[]]`.** That cast type-checks locally but makes `z.infer<typeof menuTagSchema>` resolve to `string` instead of the `MenuTag` union, so every call site that writes or filters on `tags` failed against Prisma's generated `MenuTag[]`. It's now cast as `[MenuTag, ...MenuTag[]]`, which preserves the literal union through `z.enum` and `z.array`. **This one cast caused 7 of the 8 errors** — the two `menu-slots` failures looked unrelated (complaining about `messId`) because a bad `tags` type knocks the argument out of Prisma's `XOR<UpdateInput, UncheckedUpdateInput>` union, and the error surfaces on a different property.
2. **`src/lib/export.ts` — `buildXlsx` returned a Node `Buffer`.** `NextResponse` takes a Web `BodyInit`, which `Buffer` isn't. The first attempt at this fix switched to `Uint8Array`, which turned out to have the same problem in this project's TS lib/version combination — `Uint8Array<ArrayBufferLike>` doesn't reliably match `BodyInit`'s overloads either. `buildXlsx` now returns a `Blob` instead, which has no such ambiguity (verified both by `tsc` and by a runtime check that a `Blob` built from the same buffer round-trips correctly).

No behaviour changed; all three are type-level corrections.

### Phase 8 additions — AI Waste Prediction, alerts, schedule-aware collection

No new dependencies and **no schema changes / no new migration**. `npm install` and `prisma migrate` are unchanged from 7a.

**AI Waste Prediction — the "Coming Soon" card is gone.**

- `src/lib/prediction.ts` — the model. A recency-weighted historical baseline with explainable multiplicative adjustments, deliberately not a black box:
  1. **Base level** — average waste *per person* over past records matching the target as tightly as possible (mess x meal slot x day of week x week type), falling back through progressively looser groupings (`meal-day`, `meal`, whole-mess) when the exact combination is too thin.
  2. **Recency** — each past record is weighted by exponential decay on its age (60-day half-life), so a portioning or menu change from three months ago fades out instead of anchoring the forecast forever.
  3. **Adjustments** — multiplicative factors for rain, temperature, event type, schedule deviation, and the scheduled menu's biryani/paneer/dessert flags. Each is measured against the mess's *whole* history (the base group is far too small to estimate an effect from) and **shrunk toward 1.0 by `n/(n+6)`**, so one freak rainy Tuesday can't become "rain doubles waste". Factors are clamped to 0.6x–1.7x.
  4. **Scale** — multiply by expected headcount (provided by the form, or inferred from the same baseline) to get kilograms.
- Every prediction reports **where it came from**: the baseline tier, its sample size and average, plus each driver with its signed % impact and how many records support it. A coordinator can see why the number is what it is.
- `GET /api/predict?messId=&date=&mealSlot=[&headcount=&eventType=&scheduleDeviation=]` — one meal. Only records dated **strictly before** the target are used, so asking for a prediction on a date that already has a record gives the number the model would have produced beforehand — that's what makes back-testing meaningful instead of circular. Weather is never accepted from the client; the server reads it via `getOrFetchWeather`.
- `GET /api/predict/forecast?messId=&days=7` — the week ahead, per day and meal slot, with a per-mess breakdown. `messId` omitted = combined (predict each mess separately, then sum), same convention as every other analytics route.
- `src/components/dashboard/PredictionCard.tsx` — replaces `AiPredictionPlaceholder` (now deleted). Shows the forecast **band** (low/expected/high) rather than a bare line, a confidence badge, and a per-day meal breakdown on click.
- `src/components/data-collection/PredictionBanner.tsx` — live prediction on the collection form, refetched as mess/date/meal/event/deviation change (headcount debounced 400ms). Once a total is typed, it says whether the meal landed outside the expected range — the earliest possible moment to catch a bad day. A "Why" toggle expands the full driver breakdown.

**Notifications — the top-bar bell is real.**

- `GET /api/notifications?messId=&limit=` — high-waste spikes, missing entries, and 7-day trend movement.
- **Alerts are derived on read, not stored.** Every one is a function of data that already exists, so there is no notifications table, no background job, and no write path that can fall out of sync with the records themselves. Editing or deleting a record makes its alert disappear on the next load, which is the behaviour you want. The trade-off: "seen" state has nowhere server-side to live without a migration, so it's kept per-browser in `localStorage` against each notification's **deterministic id** — dismissing an alert keeps it dismissed.
- `src/lib/anomaly.ts` — the z-score outlier detection, **extracted out of `/api/analytics/anomalies`** so that route and the bell run the identical computation. A row in the Analytics High-waste table and an alert in the bell can no longer drift apart (there's a test asserting exactly this).
- `src/lib/notifications.ts` — the three builders. Missing entries are **one notification per mess-day**, not per slot: a mess that skipped a whole day should be one line in the bell, not four. Trend movement reports **both directions** — a sustained drop is exactly the kind of thing a mess team should be told about.
- `src/components/layout/NotificationBell.tsx` — unread badge, severity-coloured rows, mark-all-read, deep links into Records/Analytics/Data Collection, closes on outside-click and Escape.

**Data Collection now shows the schedule it's asking you to compare against.**

- `src/components/data-collection/ScheduledMenuContext.tsx` — "Scheduled: 7 items, 40% gravy" plus flag and tag chips, rendered directly above the deviation toggle. Previously the form asked "did this deviate from the schedule?" without ever showing the schedule.
- **Menu tags pre-fill from the scheduled slot** and stop doing so the moment the coordinator edits them (`tagsTouched`) — otherwise changing the date would silently discard what they had just selected. The hint under the chips says where the values came from.
- `CalendarDay` finally does something: `eventTypeFromCalendar` maps seeded holiday/exam/event flags onto the `EventType` a coordinator would have picked by hand, and the forecast uses it for days nobody has entered yet.

**Design decisions / things to know:**

- **The forecast starts the day after the newest record in scope, not after today's real date.** Your seeded data is a fixed historical year; anchoring to the wall clock would forecast a window nine months past the last thing we know about and render a flat, useless chart. Same convention the Dashboard KPIs and Analytics presets already use.
- **Forecast weather is the seasonal normal**, not a live Open-Meteo call: the average of cached `WeatherDaily` readings from the same calendar month in any year. Fetching would mean up to `days x messes` API calls on every dashboard load, for dates the forecast endpoint often can't serve anyway — and for a monsoon climate a month-of-year average is a better default than the annual mean.
- **A null prediction is a legitimate answer**, not an error. A brand-new mess with no history returns `prediction: null` and the UI shows an empty state rather than inventing a number.
- **This is a baseline, and it should stay one until it earns otherwise.** A gradient-boosted model trained on a few hundred rows would mostly memorise noise. The schema and the CSV export are already ML-ready, so replacing it later means rewriting `predictWaste` in one file — nothing else changes.

**Verification status of this batch (please read):** no network in the build environment again, so `npm install`, `next build` and a browser run were **not** possible. What *was* done, and this batch got substantially more than the last two:

- **118 real unit tests, all passing**, run with `tsx` against the actual modules — 55 for the prediction engine (recency decay, weighted means, shrinkage behaviour, factor clamping, tier fallback, headcount inference, driver reporting, confidence thresholds, seasonal weather, calendar mapping) and 63 for anomaly detection and the notification builders (per-(mess, meal) baselines, zero-variance safety, minimum sample size, deterministic ids, severity thresholds, sort order, and an integration test asserting the bell and the Analytics table return the same records).
- One test *did* catch something worth knowing: a single extreme outlier inflates its own baseline's standard deviation enough to mask a milder spike in the same group. That's correct behaviour, not a bug, and it's now locked in as an explicit test.
- Full-project `tsc --strict` against stand-in module declarations. The Prisma-free pure modules (`prediction`, `notifications`, `anomaly`, `analytics`, `date-utils`, `calculations`, `format`) type-check at **zero errors with `noImplicitAny`**. Everything else is clean apart from known stub limitations (zod's `z.infer` namespace, Prisma's generated types, Node's `Buffer`) that every pre-existing file hits identically.
- Verified that **no client component imports any Prisma-touching module** — `prediction.ts`, `anomaly.ts`, `notifications.ts`, `analytics.ts` and `constants.ts` are reachable only from server routes and other server libs.

What that still can't catch: mismatches with real Recharts/Next/Prisma typings, and anything visual or interaction-related. Please run `npx tsc --noEmit` and `npm run build`, then click through: the Dashboard's prediction card, the bell, and the Data Collection form with a mess that has a defined menu.

## Next phase

**Phase 9 — verification, then the last two spec items.** Suggested order, smallest risk first:

1. **Run `npx tsc --noEmit` and `npm run build` and send me whatever they turn up.** This is now the third batch written without a real install; the fixes are expected to be small, but they're still the first thing to clear. Still outstanding from 7b parts 1 and 2 as well.
2. **Tune the prediction model against your real data.** Once the full-year CSVs are seeded and a few weeks of real records exist, the constants in `src/lib/prediction.ts` (`RECENCY_HALF_LIFE_DAYS`, `SHRINKAGE_K`, the clamp bounds, the confidence thresholds) are the dials. A simple back-test harness — predict every historical record from only the records before it, then compare — would tell you whether the adjustments are earning their keep or just adding variance.
3. **Swipe/token-based automatic headcount** — the last untouched item from the original spec. `headcount` is still entered manually; the prediction already treats a provided headcount as authoritative and falls back to a historical estimate, so the integration point is clean.
4. **Alert delivery beyond the bell** — email or a daily digest for critical spikes. `GET /api/notifications` already produces the content; this is a transport and a schedule.
5. Optional hardening: a token-version column for real session revocation, rate-limiting on `/api/auth/login`, and a server-side `seen` state for notifications (needs a small table, which is why it's localStorage today).

**Original spec status:** everything in the brief is now built except swipe/token-based automatic headcount. AI waste prediction and automated high-waste alerts landed in Phase 8.
