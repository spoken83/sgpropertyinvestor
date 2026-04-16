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
