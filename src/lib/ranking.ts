import { db } from "./db";
import { sql } from "drizzle-orm";

export type UnitType = "Studio" | "1BR" | "2BR" | "3BR" | "4BR+";

export type RankedUnitType = {
  id: number;
  name: string;
  street: string | null;
  marketSegment: string | null;
  tenure: string | null;
  nearestMrt: string | null;
  mrtDistanceM: number | null;
  totalUnits: number | null;
  completionYear: number | null;
  unitType: UnitType;
  medianPsf: number;
  medianPrice: number;
  medianRent: number;
  medianSqft: number;
  grossYieldPct: number;
  txnCount: number;
  rentalCount: number;
  rentalsPerYear: number;
  projectRentalsPerYear: number;     // project-wide total (all unit types)
  turnoverPct: number | null;         // rentals/yr ÷ total_units × 100; null when no unit count
};

export type Op = "gte" | "lte" | "eq";

export type RankFilters = {
  minPrice: number;
  maxPrice: number;
  segment?: "CCR" | "RCR" | "OCR";
  tenure?: "freehold" | "leasehold";
  mrtOp?: Op;
  mrtVal?: number;
  unitsOp?: Op;
  unitsVal?: number;
  psfOp?: Op;
  psfVal?: number;
  ageOp?: Op;
  ageVal?: number;
  unitType?: UnitType;
  minTxnCount?: number;
  query?: string;
  ignorePriceBand?: boolean;
  minYieldPct?: number;
};

// SQL bucket classifier. For transactions uses area_sqm * 10.7639.
// For rentals, extract first number from area_sqft ranges like "800 to 900".
// Buckets:
//   Studio < 450 sqft, 1BR 450–699, 2BR 700–999, 3BR 1000–1399, 4BR+ ≥ 1400

export async function rankProjects(f: RankFilters): Promise<RankedUnitType[]> {
  const segmentFilter = f.segment ? sql`AND p.market_segment = ${f.segment}` : sql``;
  const tenureFilter =
    f.tenure === "freehold"
      ? sql`AND (p.tenure ILIKE ${"%freehold%"} OR p.tenure ILIKE ${"%999%"})`
      : f.tenure === "leasehold"
      ? sql`AND p.tenure ILIKE ${"%99 yrs%"}`
      : sql``;
  const mrtFilter =
    f.mrtOp && f.mrtVal != null
      ? f.mrtOp === "gte"
        ? sql`AND p.mrt_distance_m >= ${f.mrtVal}`
        : f.mrtOp === "lte"
        ? sql`AND p.mrt_distance_m <= ${f.mrtVal}`
        : sql`AND p.mrt_distance_m = ${f.mrtVal}`
      : sql``;
  const unitsFilter =
    f.unitsOp && f.unitsVal != null
      ? f.unitsOp === "gte"
        ? sql`AND p.total_units >= ${f.unitsVal}`
        : f.unitsOp === "lte"
        ? sql`AND p.total_units <= ${f.unitsVal}`
        : sql`AND p.total_units = ${f.unitsVal}`
      : sql``;
  const psfFilter =
    f.psfOp && f.psfVal != null
      ? f.psfOp === "gte"
        ? sql`AND t.median_psf >= ${f.psfVal}`
        : f.psfOp === "lte"
        ? sql`AND t.median_psf <= ${f.psfVal}`
        : sql`AND t.median_psf = ${f.psfVal}`
      : sql``;
  const ageFilter =
    f.ageOp && f.ageVal != null
      ? f.ageOp === "gte"
        ? sql`AND (EXTRACT(YEAR FROM CURRENT_DATE) - p.completion_year) >= ${f.ageVal}`
        : f.ageOp === "lte"
        ? sql`AND (EXTRACT(YEAR FROM CURRENT_DATE) - p.completion_year) <= ${f.ageVal}`
        : sql`AND (EXTRACT(YEAR FROM CURRENT_DATE) - p.completion_year) = ${f.ageVal}`
      : sql``;
  const minTxn = f.minTxnCount ?? 3;
  const priceFilter = f.ignorePriceBand
    ? sql``
    : sql`AND t.median_price BETWEEN ${f.minPrice} AND ${f.maxPrice}`;
  const queryFilter = f.query
    ? sql`AND p.name ILIKE ${"%" + f.query + "%"}`
    : sql``;
  const typeFilter = f.unitType
    ? sql`AND t.unit_type = ${f.unitType}`
    : sql``;
  const minYieldFilter = f.minYieldPct
    ? sql`AND (r.median_rent * 12.0 / NULLIF(t.median_price, 0)) * 100 >= ${f.minYieldPct}`
    : sql``;

  const rows = await db.execute(sql`
    WITH tx_typed AS (
      SELECT
        project_id,
        price::numeric AS price,
        psf_sqft::numeric AS psf,
        area_sqm::numeric * 10.7639 AS sqft,
        CASE
          WHEN area_sqm::numeric * 10.7639 < 450 THEN 'Studio'
          WHEN area_sqm::numeric * 10.7639 < 700 THEN '1BR'
          WHEN area_sqm::numeric * 10.7639 < 1000 THEN '2BR'
          WHEN area_sqm::numeric * 10.7639 < 1400 THEN '3BR'
          ELSE '4BR+'
        END AS unit_type
      FROM transactions
      WHERE contract_date >= (CURRENT_DATE - INTERVAL '24 months')
        AND area_sqm IS NOT NULL
    ),
    rent_typed AS (
      SELECT
        project_id,
        monthly_rent::numeric AS rent,
        lease_date,
        (
          SELECT AVG(m[1]::int) FROM regexp_matches(area_sqft, '(\\d+)', 'g') AS m
        ) AS sqft_mid,
        CASE
          WHEN (SELECT AVG(m[1]::int) FROM regexp_matches(area_sqft, '(\\d+)', 'g') AS m) < 450 THEN 'Studio'
          WHEN (SELECT AVG(m[1]::int) FROM regexp_matches(area_sqft, '(\\d+)', 'g') AS m) < 700 THEN '1BR'
          WHEN (SELECT AVG(m[1]::int) FROM regexp_matches(area_sqft, '(\\d+)', 'g') AS m) < 1000 THEN '2BR'
          WHEN (SELECT AVG(m[1]::int) FROM regexp_matches(area_sqft, '(\\d+)', 'g') AS m) < 1400 THEN '3BR'
          ELSE '4BR+'
        END AS unit_type
      FROM rentals
      WHERE area_sqft IS NOT NULL AND area_sqft ~ '\\d'
    ),
    recent_tx AS (
      SELECT project_id, unit_type,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf)   AS median_psf,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sqft)  AS median_sqft,
             COUNT(*) AS txn_count
      FROM tx_typed
      GROUP BY project_id, unit_type
    ),
    recent_rent AS (
      SELECT project_id, unit_type,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rent) AS median_rent,
             COUNT(*) AS rental_count,
             COUNT(*) * 12.0 /
               GREATEST(1,
                 EXTRACT(MONTH FROM AGE(MAX(lease_date), MIN(lease_date))) +
                 12 * EXTRACT(YEAR FROM AGE(MAX(lease_date), MIN(lease_date))) + 1
               ) AS rentals_per_year
      FROM rent_typed
      GROUP BY project_id, unit_type
    ),
    project_rent AS (
      SELECT project_id,
             COUNT(*) * 12.0 /
               GREATEST(1,
                 EXTRACT(MONTH FROM AGE(MAX(lease_date), MIN(lease_date))) +
                 12 * EXTRACT(YEAR FROM AGE(MAX(lease_date), MIN(lease_date))) + 1
               ) AS project_rentals_per_year
      FROM rent_typed
      GROUP BY project_id
    )
    SELECT p.id, p.name, p.street, p.market_segment, p.tenure,
           p.nearest_mrt, p.mrt_distance_m, p.total_units, p.completion_year,
           t.unit_type,
           t.median_psf, t.median_price, t.median_sqft,
           r.median_rent,
           (r.median_rent * 12.0 / NULLIF(t.median_price, 0)) * 100 AS gross_yield_pct,
           t.txn_count, r.rental_count, r.rentals_per_year,
           pr.project_rentals_per_year,
           CASE WHEN p.total_units IS NOT NULL AND p.total_units > 0
             THEN (pr.project_rentals_per_year / p.total_units) * 100
             ELSE NULL END AS turnover_pct
    FROM projects p
    JOIN recent_tx t ON t.project_id = p.id
    JOIN recent_rent r ON r.project_id = p.id AND r.unit_type = t.unit_type
    JOIN project_rent pr ON pr.project_id = p.id
    WHERE t.txn_count >= ${minTxn}
      AND r.rental_count >= 3
      ${priceFilter}
      ${segmentFilter}
      ${tenureFilter}
      ${mrtFilter}
      ${unitsFilter}
      ${psfFilter}
      ${ageFilter}
      ${queryFilter}
      ${typeFilter}
      ${minYieldFilter}
  `);

  const data =
    (rows as unknown as { rows: Record<string, unknown>[] }).rows ??
    (rows as unknown as Record<string, unknown>[]);
  return data.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    street: (r.street as string) ?? null,
    marketSegment: (r.market_segment as string) ?? null,
    tenure: (r.tenure as string) ?? null,
    nearestMrt: (r.nearest_mrt as string) ?? null,
    mrtDistanceM: r.mrt_distance_m != null ? Number(r.mrt_distance_m) : null,
    unitType: r.unit_type as UnitType,
    medianPsf: Number(r.median_psf),
    medianPrice: Number(r.median_price),
    medianRent: Number(r.median_rent),
    medianSqft: Number(r.median_sqft),
    grossYieldPct: Number(r.gross_yield_pct),
    txnCount: Number(r.txn_count),
    rentalCount: Number(r.rental_count),
    rentalsPerYear: Number(r.rentals_per_year),
    totalUnits: r.total_units != null ? Number(r.total_units) : null,
    completionYear: r.completion_year != null ? Number(r.completion_year) : null,
    projectRentalsPerYear: Number(r.project_rentals_per_year),
    turnoverPct: r.turnover_pct != null ? Number(r.turnover_pct) : null,
  }));
}
