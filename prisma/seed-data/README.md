# Seed data — drop your CSVs here

`npm run seed` looks for these exact filenames in this folder. If a file is
missing, the seed script logs a warning and **generates synthetic data with
the same shape** instead, so `npm run seed` always succeeds — you can run it
today and re-run it once your real CSVs are in place (it's idempotent: safe
to run multiple times, existing rows are upserted).

## 1. Per-mess menu composition — `mess-1-menu.csv` … `mess-4-menu.csv`

One row per calendar day, covering the mess's repeating 14-day A/B cycle
(the seed script only needs 14 distinct cycle-days per mess — if your CSV
has a full year, it derives the 14-day pattern from the first full cycle it
finds and expands that across 2024).

Expected columns (header names matched case-insensitively; a few common
aliases are accepted — see `scripts/seed-lib/menu.ts` if yours differ):

| column | meaning |
|---|---|
| `date` | `YYYY-MM-DD` |
| `menu_era` | ignored (kept for provenance) |
| `menu_week_type` | `A` or `B` |
| `menu_slot_id` | ignored (cycle position is derived from `date`) |
| `n_breakfast_items` | item count served at breakfast |
| `n_lunch_items` | item count served at lunch |
| `n_dinner_items` | item count served at dinner |
| `n_dishes_classified` | ignored (provenance) |
| `pct_gravy_dishes` | 0–100, applied to lunch & dinner |
| `has_biryani` | 0/1 or true/false |
| `has_paneer` | 0/1 or true/false |
| `has_egg_bf` | 0/1 or true/false (breakfast only) |
| `has_desert` | 0/1 or true/false (yes, "desert" — matches the source spec's column name; mapped to `hasDessert`) |
| `has_dosa` | 0/1 or true/false (breakfast) |
| `has_paratha` | 0/1 or true/false (breakfast) |

**Mapping notes (documented assumptions — adjust in Menu Management once
seeded, or tweak `scripts/seed-lib/menu.ts` if your real data splits these
differently):**
- The CSV has no per-meal breakdown for `pct_gravy_dishes` / `has_biryani` /
  `has_paneer` / `has_desert`, so the seed script applies those day-level
  flags to **both Lunch and Dinner**.
- `has_egg_bf`, `has_dosa`, `has_paratha` are breakfast-only by name, so
  they're applied to **Breakfast** only.
- **Snacks has no source columns at all** — the CSV format doesn't cover it.
  The seed script creates a modest default Snacks `MenuSlot` (small item
  count, no special flags) for every mess/day/week-type so the Data
  Collection form always has something to compare against; edit these in
  Menu Management once you know the real snacks pattern.
- Menu composition **tags** (the fixed `MenuTag` list) aren't in this CSV
  either — they're inferred heuristically per meal slot from the boolean
  flags and `pct_gravy_dishes` (e.g. `has_paneer` → `VEGETARIAN`, gravy% > 50
  → `GRAVY` else `DRY`, `has_dosa` → `RICE_BASED`, `has_paratha` →
  `BREAD_BASED`, `has_desert` → `DESSERT` + `SWEET`). This is a starting
  point, not ground truth — correct individual `MenuSlot`s in Menu
  Management as needed.

## 2. Weather — `weather.csv`

Full year, one row per date (institution-wide — the same file seeds
`WeatherDaily` for all 4 messes, since the spec has them all on one campus).

| column | meaning |
|---|---|
| `date` | `YYYY-MM-DD` |
| `temp_max` / `temperature_max` | °C |
| `temp_min` / `temperature_min` | °C |
| `temp_mean` / `temperature_mean` | °C |
| `precipitation` | mm |
| `rain` | mm |
| `humidity` | % |

## 3. Academic calendar — `academic-calendar.csv`

| column | meaning |
|---|---|
| `date` | `YYYY-MM-DD` |
| `day_of_week` | optional — derived from `date` if absent |
| `is_weekend` | 0/1 or true/false — derived from `date` if absent |
| `is_holiday` | 0/1 or true/false |
| `holiday_name` | optional |
| `mess_cycle` / `week_type` | `A` or `B` — institution-wide default week type for the date |
| `is_quiz_week` | 0/1 or true/false |
| `is_exam_week` | 0/1 or true/false |
| `is_major_event` | 0/1 or true/false |
| `event_name` | optional |

---

If your real files use different headers, either rename the columns to
match the table above, or edit the small `resolveColumn()` alias list at
the top of each file in `scripts/seed-lib/` — the parsing itself doesn't
need to change.
