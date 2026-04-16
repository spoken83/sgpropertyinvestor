# SG Property Investor

A data-driven investment finder for Singapore private residential property. Takes your financial profile (cash, CPF, age, loan rate) and ranks every private condo / apartment / EC by **actual investment outcomes** — gross yield, net yield, cash-on-cash ROI and rental activity — broken down **per unit type (Studio / 1BR / 2BR / 3BR / 4BR+)** so hidden gems (e.g., a $990k 1BR inside a $1.75M-median CCR project) surface cleanly instead of being averaged away.

Live local dev: `http://localhost:3001`

---

## What it does

1. **Input your profile on the home page** — cash on hand, CPF OA, age, loan rate, optional rental-tax + vacancy assumptions. All persisted in a cookie so every page personalises to you.
2. **See your max affordable price** — 75% LTV bank cap, `min(30yr, 65−age)` tenure, 5% cash floor + max-CPF financing.
3. **Browse matching properties** — ranked across thousands of private condo (project × unit type) rows, filterable by price, zone, tenure, unit type, PSF, age, MRT distance, unit count, minimum yield, and "exclude negative Cash ROI".
4. **Drill into a property** — per-project detail page with:
   - Header chips: tenure, TOP year + age, total units, nearest MRT + distance, developer
   - Summary tiles: median price / PSF / rent / gross yield (switch between Overall and each unit type)
   - By-unit-type breakdown table
   - Investment analysis: CPF-first financing, cash downpayment slider (Min / 50% / 100% presets), full annual P&L (rent → vacancy → MCST estimate → property tax → maintenance → income tax → net rental income → mortgage repayment → annual cash flow), plus **gross yield / net yield / Cash ROI** with tooltips
   - Recent sales + recent rentals (10 shown, expandable to 200)

---

## Stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 + HeroUI v2.8 (design system) |
| Icons | Phosphor Icons (`@phosphor-icons/react`) |
| Animation | Framer Motion + React View Transitions API |
| Database | Neon PostgreSQL |
| ORM | Drizzle |
| Geo | `proj4` (SVY21 → WGS84 conversion) |
| Charts (installed, not wired) | Recharts |
| Theming | next-themes (light-only for now) |
| Deployment target | Vercel + custom subdomain `sgproperty.gordonfrois.com` |

---

## Data sources

| Dataset | Coverage | Source |
|---|---|---|
| Private residential sale caveats | 125,849 txns, ~5 yrs | URA PMI API (`PMI_Resi_Transaction`) |
| Private residential rental contracts | 405,703 contracts, ~5 yrs | URA PMI API (`PMI_Resi_Rental`) |
| Upcoming / pipeline projects | 63 projects | URA PMI API (`PMI_Resi_Pipeline`) |
| Total dwelling units per project | 2,697 of 3,226 (84%) | data.gov.sg URA Dwelling Units GeoJSON |
| Project completion (TOP) year | 2,536 of 3,226 (79%) | EdgeProp scrape (`__NEXT_DATA__`) + fallback inference from earliest new-sale txn / tenure commencement year |
| Developer name | 1,665 of 3,226 | EdgeProp scrape |
| Property type, tenure text, exact lat/lng | ≥2,500 projects | EdgeProp scrape |
| Postal district | All 3,226 | URA API |
| Market segment (CCR / RCR / OCR) | All 3,226 | Derived from postal district via `src/lib/segment.ts` |
| Nearest MRT + walking distance | 2,909 (all with coords) | Static dataset of 141 MRT stations + haversine |
| SVY21 → lat/lng | All | `proj4` offline conversion |

---

## Implemented features

### Data pipeline (`src/scripts/`)
- `ingest.ts` — URA transactions (4 batches) + rentals (20 quarters) → Neon. Filters landed / HDB.
- `ingestUnits.ts` — aggregates data.gov.sg dwelling-units GeoJSON by project name, joins to `projects`.
- `ingestPipeline.ts` — URA upcoming projects with expected TOP year + developer.
- `convertCoords.ts` — one-shot batch SVY21 → WGS84 via `proj4`.
- `enrichGeo.ts` — haversine-nearest MRT station for every project.
- `scrapeEdgeProp.ts` — resumable, rate-limited scraper pulling `__NEXT_DATA__` for developer / TOP year / total units / exact coords / planning area.

### Affordability & ROI engine (`src/lib/affordability.ts`, `src/lib/roi.ts`)
- Max-affordable-price calculation: 75% LTV, `min(30, 65−age)` tenure, 5% cash floor, **max-out CPF first** strategy. `extraCashDownpayment` slider adds more cash down to shrink the loan.
- Full annual P&L: gross rent → vacancy → MCST estimate → property tax (12% of AV ≈ 12% of annual rent) → maintenance buffer (2%) → rental income tax (toggleable) → net rental income → mortgage repayment → annual cash flow.
- Returns: gross yield, net yield, cash-on-cash ROI.

### Ranking engine (`src/lib/ranking.ts`)
- Single SQL with CTEs producing **(project, unit-type) rows**: `percentile_cont` median price, median PSF, median rent, txn count, rental count, project-wide rentals/yr, turnover %.
- Unit-type classification: sqm→sqft for transactions; midpoint of range for rentals (matches the detail-page JS classifier exactly).
- Filters pushed into SQL where reasonable; ROI-dependent filters applied in-JS post-fetch.
- **Cached via `unstable_cache`** (1h revalidate) so repeat list-page navigations hit memory, not the DB.

### UX
- **List page**:
  - Desktop: 12-column sortable table with sticky headers, project-side (tinted) vs unit-side columns.
  - Mobile portrait: card list — each project is a tappable HeroUI Card with Yield + Cash ROI in the top-right.
  - Mobile landscape & tablet+: switches back to the table via Tailwind's `landscape:` variant.
  - Filters: Search by name, Max price, Zone, Tenure, Unit type, Min gross yield, No. units (≥ / ≤ / =), MRT distance, PSF, Age, "Exclude negative Cash ROI".
  - **Mobile-collapsible filter panel** with active-filter count badge + "Clear all" button.
  - Server-side sort (URL-driven ▼/▲), pagination (50/page), URL state preservation.
  - Navigation uses `startTransition` + a localized spinner overlay — data table stays visible during updates (no flicker).
- **Detail page**:
  - Polished HeroUI header with MapPin + chips (tenure, TOP/age, units, MRT, developer).
  - Unit-type selector (1BR / 2BR / 3BR / 4BR+ / Overall) drives every downstream metric + ROI calc.
  - Stat tiles switch between overall and per-unit-type values live.
  - Recent sales + rentals start at 10 rows, expand to full history.
- **Home page**:
  - HeroUI Card for funds + affordability, collapsible "Advanced assumptions" accordion.
  - CTA: "Find my best ROI matches" with caption explaining the engine.
- **Transitions**:
  - React View Transitions API — slide-up on forward nav, slide-down on back.
  - `BackButton` fires `router.push` with `transitionTypes: ['nav-back']` so the CSS flips animation direction.
  - List URL (including filters) preserved in `sessionStorage` so back from detail restores state exactly.
- **Profile persistence**:
  - Cookie-based, shared across home, list (Cash-ROI column), and detail (ROI calculator).
  - Hydration-safe (`hydrated` flag guards the persist effect to avoid clobbering the cookie with defaults on mount).

---

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx            # ViewTransition wrapper, Providers, fonts
│  ├─ page.tsx              # Home: funds → affordability → CTA
│  ├─ providers.tsx         # NextThemesProvider
│  ├─ hero.ts               # HeroUI tailwind plugin
│  ├─ globals.css           # Tailwind v4 + HeroUI + view-transition keyframes
│  └─ properties/
│     ├─ page.tsx                # List (server, fetches cached dataset)
│     ├─ FiltersBar.tsx          # Client
│     ├─ PropertiesTable.tsx     # Client, desktop/landscape table
│     ├─ PropertiesCardList.tsx  # Client, mobile-portrait card list
│     ├─ Pagination.tsx          # Client
│     ├─ NavContext.tsx          # useNav() hook — wraps router.push in startTransition
│     ├─ ResultsOverlay.tsx      # Motion-animated "Updating…" pill
│     ├─ RememberListUrl.tsx     # Saves current list URL to sessionStorage
│     └─ [id]/
│        ├─ page.tsx             # Server — fetches project + profile
│        ├─ PropertyDetailView.tsx  # Client — all HeroUI JSX
│        ├─ RoiCalculator.tsx    # Client — ROI panel + cash slider
│        └─ ExpandableHistory.tsx  # Client — 10 → all rows
├─ components/
│  ├─ BackButton.tsx        # Round icon button, emits nav-back transition type
│  ├─ MoneyInput.tsx        # HeroUI Input with $ + thousands formatting
│  ├─ OpFilter.tsx          # ≥/≤/= + numeric operand filter
│  └─ Spinner.tsx           # HeroUI Spinner wrapper
├─ lib/
│  ├─ db.ts                 # Neon + Drizzle client
│  ├─ schema.ts             # projects, transactions, rentals
│  ├─ ranking.ts            # getAllRanked (cached) + rankProjects
│  ├─ projectDetail.ts      # getProjectDetail — per-unit-type aggregation in JS
│  ├─ affordability.ts      # max price + tenure + PMT
│  ├─ roi.ts                # full P&L + yields + cash-on-cash
│  ├─ mcst.ts               # MCST fee estimator ($300–700 range)
│  ├─ units.ts              # sqft → unit-type bucketing
│  ├─ segment.ts            # district → CCR/RCR/OCR
│  ├─ geo.ts                # proj4 SVY21 ↔ WGS84 + haversine
│  ├─ profile.ts            # server getProfile() from cookie
│  ├─ profileShared.ts      # BuyerProfile type + DEFAULT_PROFILE
│  └─ ura.ts                # URA API client
├─ scripts/                 # ingestion scripts (see Data pipeline)
└─ data/
   └─ mrt.json              # 141 MRT stations with lat/lng
```

---

## Planned — not done

### High priority
- **Finish EdgeProp-mismatch second pass** — 575 of 3,213 projects resolved to a different slug ("mismatch"). A resolver that tries alternate slugs (strip "THE", swap "@" for "at", append `-<ext_id>`) could close most of the remaining 18% gap.
- **Facilities list** — no free data source; EdgeProp deliberately encrypts the facilities API URL client-side. Options: inference from size + segment + age (low effort, 80% signal) OR manual enrichment for shortlisted projects.
- **Schools proximity** — the MRT enrichment script pattern is ready to adapt, but data.gov.sg rate-limits anonymous requests. Needs a free API key + running the enrichment script.
- **Map on property detail page** — we have lat/lng for every project; add a `react-leaflet` map pinned to the project + nearby MRT, matching the pattern already used in the sibling `school-scanner` project (CARTO Voyager tiles, no API key).

### Medium priority
- **Net-yield column on the list** — currently only Cash ROI takes financing into account; a pure net yield column (before financing) would help compare properties as assets.
- **Price trend sparkline** — per-project 5yr median PSF chart on the detail page using Recharts (already installed, unused).
- **Save-to-shortlist** — localStorage- or cookie-backed ability to mark favourites, then compare them side-by-side.
- **Stress test on the ROI calculator** — auto-recompute under rate-up scenarios (4% / 5%) and higher vacancy (2mo / 3mo) and show them as a side column.

### Lower priority
- **Show upcoming / pipeline projects** — 63 ingested with expected TOP; not yet surfaced anywhere. Useful for pre-TOP investors.
- **Per-type `rentalsPerYear`** (today it's project-wide) — would require per-type classification in the `project_rent` CTE.
- **Address the 6 "404" EdgeProp slugs** manually, or delete those projects from the DB as stale.
- **Production cache invalidation** — right now `unstable_cache` has a 1h revalidate; a real `revalidateTag("ranked")` call from the ingestion scripts would be cleaner than waiting an hour.
- **Dark mode** — `next-themes` is wired but forced to light; toggling it in the layout is a small change.
- **Tests** — no automated tests currently.

---

## Local setup

```bash
npm install

# .env.local
DATABASE_URL=postgres://…@neon…
URA_ACCESS_KEY=…   # from https://eservice.ura.gov.sg/maps/api

npx drizzle-kit push
npx tsx src/scripts/ingest.ts all
npx tsx src/scripts/ingestUnits.ts
npx tsx src/scripts/ingestPipeline.ts
npx tsx src/scripts/convertCoords.ts
npx tsx src/scripts/enrichGeo.ts
npx tsx src/scripts/scrapeEdgeProp.ts   # ~2.5h at 3s/request

npm run dev -- -p 3001
```

---

## Known limitations

- URA API exposes only the last 5 years of sale caveats and rental contracts — older data isn't available through their public endpoints.
- Completion year is inferred for older projects (pre-2020) via tenure commencement year + 4yr build heuristic; EdgeProp scrape fills most remaining gaps but some stay unknown.
- MCST fees are estimated, not actual — calibrated to the $300–$700/mo range using segment + unit size + age + dev size heuristics.
- Property tax is approximated as 12% of annual rent (IRAS rule-of-thumb for non-owner-occupied).
- Rental income tax is a flat effective rate (default 15%); doesn't model progressive brackets.
