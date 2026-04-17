import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

// A "project" = a condo development (e.g., "The Interlace")
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    street: text("street"),
    postalDistrict: text("postal_district"),
    marketSegment: text("market_segment"), // CCR / RCR / OCR
    tenure: text("tenure"), // freehold / 99-yr / 999-yr
    tenureStartYear: integer("tenure_start_year"),
    svy21X: numeric("svy21_x", { precision: 14, scale: 4 }),
    svy21Y: numeric("svy21_y", { precision: 14, scale: 4 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    nearestSchools: text("nearest_schools"), // JSON string array
    planningArea: text("planning_area"),
    developerName: text("developer_name"),
    expectedTopYear: integer("expected_top_year"),
    pipelineStatus: text("pipeline_status"), // "upcoming" if from PMI_Resi_Pipeline
    nearestMrt: text("nearest_mrt"),
    mrtDistanceM: integer("mrt_distance_m"),
    totalUnits: integer("total_units"),
    completionYear: integer("completion_year"),
    propertyType: text("property_type"),
    architect: text("architect"),
    landSizeSqft: integer("land_size_sqft"),
    plotRatio: numeric("plot_ratio", { precision: 4, scale: 2 }),
    edgepropId: text("edgeprop_id"),
    edgepropAlias: text("edgeprop_alias"),
    edgepropScrapedAt: timestamp("edgeprop_scraped_at"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex("projects_name_idx").on(t.name, t.street),
  })
);

// Each sale caveat from URA
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id)
      .notNull(),
    contractDate: date("contract_date").notNull(), // YYYY-MM-DD
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    areaSqm: numeric("area_sqm", { precision: 10, scale: 2 }),
    psfSqft: numeric("psf_sqft", { precision: 10, scale: 2 }),
    floorRange: text("floor_range"),
    typeOfSale: text("type_of_sale"), // new sale / sub sale / resale
    propertyType: text("property_type"), // condo / apt / exec condo
    tenure: text("tenure"),
    noOfUnits: integer("no_of_units"),
  },
  (t) => ({
    projIdx: index("tx_project_idx").on(t.projectId),
    dateIdx: index("tx_date_idx").on(t.contractDate),
  })
);

// Precomputed capital-appreciation metrics, one row per (project, unit_type).
// unit_type uses the literal "Overall" for the project-wide rollup so we can
// enforce a simple unique index (NULLs would be distinct under default Postgres).
// Populated by `src/scripts/computeCapitalAppreciation.ts` after each ingest.
export const projectMetrics = pgTable(
  "project_metrics",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id)
      .notNull(),
    unitType: text("unit_type").notNull(), // "Studio"|"1BR"|"2BR"|"3BR"|"4BR+"|"Overall"
    // headline indicators
    momentumPctYr: numeric("momentum_pct_yr", { precision: 8, scale: 2 }),
    peerSpreadPct: numeric("peer_spread_pct", { precision: 8, scale: 2 }),
    volumeTxnsYr: numeric("volume_txns_yr", { precision: 8, scale: 2 }),
    volatilityPct: numeric("volatility_pct", { precision: 8, scale: 2 }),
    caScore: numeric("ca_score", { precision: 5, scale: 1 }), // 0–100
    // forecast band (12 months ahead of the latest quarter)
    currentPsf: numeric("current_psf", { precision: 10, scale: 2 }),
    forecastLowPsf: numeric("forecast_low_psf", { precision: 10, scale: 2 }),
    forecastMidPsf: numeric("forecast_mid_psf", { precision: 10, scale: 2 }),
    forecastHighPsf: numeric("forecast_high_psf", { precision: 10, scale: 2 }),
    // charts
    trendSeries: jsonb("trend_series"), // [{q:"2024-Q1", psf, n}]
    peerSeries: jsonb("peer_series"), // [{q, psf, n_peers}]
    peerCount: integer("peer_count"),
    peerRadiusM: integer("peer_radius_m"),
    sampleSize: integer("sample_size"),
    // lease context — same for every unit_type of a given project; duplicated for query ergonomics
    leaseYearsRemaining: integer("lease_years_remaining"),
    leaseDecayPctYr: numeric("lease_decay_pct_yr", { precision: 5, scale: 2 }),
    computedAt: timestamp("computed_at").defaultNow(),
  },
  (t) => ({
    projUnitIdx: uniqueIndex("pm_proj_unit_idx").on(t.projectId, t.unitType),
    caScoreIdx: index("pm_ca_score_idx").on(t.caScore),
  })
);

// Each rental contract from URA
export const rentals = pgTable(
  "rentals",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id)
      .notNull(),
    leaseDate: date("lease_date").notNull(), // YYYY-MM
    monthlyRent: numeric("monthly_rent", { precision: 10, scale: 2 }).notNull(),
    areaSqft: text("area_sqft"), // URA returns ranges e.g., "800 to 900"
    bedrooms: integer("bedrooms"),
    propertyType: text("property_type"),
  },
  (t) => ({
    projIdx: index("rental_project_idx").on(t.projectId),
    dateIdx: index("rental_date_idx").on(t.leaseDate),
  })
);
