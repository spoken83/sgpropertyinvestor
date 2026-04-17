import { db } from "./db";
import { sql } from "drizzle-orm";
import { unitTypeFromSqft, sqmToSqft, parseSqftRange, UnitType } from "./units";

export type CaMetrics = {
  unitType: UnitType | "Overall";
  momentumPctYr: number | null;
  peerSpreadPct: number | null;
  volumeTxnsYr: number | null;
  volatilityPct: number | null;
  caScore: number | null;
  currentPsf: number | null;
  forecastLowPsf: number | null;
  forecastMidPsf: number | null;
  forecastHighPsf: number | null;
  trendSeries: Array<{ q: string; psf: number; n: number }>;
  peerSeries: Array<{ q: string; psf: number; nPeers: number }>;
  peerCount: number | null;
  peerRadiusM: number | null;
  sampleSize: number | null;
  leaseYearsRemaining: number | null;
  leaseDecayPctYr: number | null;
};

export type ProjectDetail = {
  id: number;
  name: string;
  street: string | null;
  marketSegment: string | null;
  tenure: string | null;
  postalDistrict: string | null;
  nearestMrt: string | null;
  mrtDistanceM: number | null;
  latitude: number | null;
  longitude: number | null;
  completionYear: number | null;
  totalUnits: number | null;
  developerName: string | null;
  // summary
  medianPrice: number | null;
  medianPsf: number | null;
  medianRent: number | null;
  grossYieldPct: number | null;
  txnCount: number;
  rentalCount: number;
  rentalsPerYear: number;
  // breakdown
  byUnitType: Array<{
    unitType: UnitType;
    medianPrice: number | null;
    medianPsf: number | null;
    medianRent: number | null;
    grossYieldPct: number | null;
    txnCount: number;
    rentalCount: number;
  }>;
  recentTxns: Array<{ contractDate: string; price: number; sqft: number; psf: number; floorRange: string | null; propertyType: string | null }>;
  recentRentals: Array<{ leaseDate: string; rent: number; sqft: number | null; bedrooms: number | null }>;
  // Capital-appreciation metrics, one row per unit-type + "Overall".
  // Populated by `src/scripts/computeCapitalAppreciation.ts`; empty if not yet run.
  caByUnitType: CaMetrics[];
};

export async function getProjectDetail(id: number): Promise<ProjectDetail | null> {
  const projRows = await db.execute(sql`
    SELECT id, name, street, market_segment, tenure, postal_district,
           nearest_mrt, mrt_distance_m, latitude, longitude,
           completion_year, total_units, developer_name
    FROM projects WHERE id = ${id}
  `);
  const proj = ((projRows as { rows?: Record<string, unknown>[] }).rows ?? (projRows as unknown as Record<string, unknown>[]))[0];
  if (!proj) return null;

  // Pull recent txns + rentals
  const txRows = await db.execute(sql`
    SELECT contract_date, price, area_sqm, psf_sqft, floor_range, property_type
    FROM transactions WHERE project_id = ${id}
    ORDER BY contract_date DESC
  `);
  const txns = ((txRows as { rows?: Record<string, unknown>[] }).rows ?? (txRows as unknown as Record<string, unknown>[])).map((t) => ({
    contractDate: String(t.contract_date).slice(0, 10),
    price: Number(t.price),
    sqft: t.area_sqm ? sqmToSqft(Number(t.area_sqm)) : 0,
    psf: Number(t.psf_sqft),
    floorRange: (t.floor_range as string) ?? null,
    propertyType: (t.property_type as string) ?? null,
  }));

  const rentRows = await db.execute(sql`
    SELECT lease_date, monthly_rent, area_sqft, bedrooms
    FROM rentals WHERE project_id = ${id}
    ORDER BY lease_date DESC
  `);
  const rents = ((rentRows as { rows?: Record<string, unknown>[] }).rows ?? (rentRows as unknown as Record<string, unknown>[])).map((r) => ({
    leaseDate: String(r.lease_date).slice(0, 10),
    rent: Number(r.monthly_rent),
    sqft: parseSqftRange(r.area_sqft as string),
    bedrooms: r.bedrooms != null ? Number(r.bedrooms) : null,
  }));

  // Overall medians (last 24 months of txns, all rentals)
  // Linear-interpolated median to match PostgreSQL's PERCENTILE_CONT(0.5) used on the list.
  const medianOf = (arr: number[]) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = s.length / 2;
    if (s.length % 2 === 0) return (s[mid - 1] + s[mid]) / 2;
    return s[Math.floor(mid)];
  };
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const recentTx = txns.filter((t) => new Date(t.contractDate) >= twoYearsAgo);
  const medianPrice = medianOf(recentTx.map((t) => t.price));
  const medianPsf = medianOf(recentTx.map((t) => t.psf).filter((n) => Number.isFinite(n)));
  const medianRent = medianOf(rents.map((r) => r.rent));
  const grossYieldPct =
    medianRent && medianPrice ? (medianRent * 12) / medianPrice * 100 : null;

  // rentability: rentals/year over available window
  const rentDates = rents.map((r) => new Date(r.leaseDate).getTime());
  let rentalsPerYear = 0;
  if (rentDates.length >= 2) {
    const spanYears = (Math.max(...rentDates) - Math.min(...rentDates)) / (365.25 * 24 * 3600 * 1000);
    rentalsPerYear = rents.length / Math.max(1, spanYears);
  } else {
    rentalsPerYear = rents.length;
  }

  // Capital-appreciation metrics, per unit-type + Overall.
  const caRows = await db.execute(sql`
    SELECT unit_type, momentum_pct_yr, peer_spread_pct, volume_txns_yr, volatility_pct,
           ca_score, current_psf, forecast_low_psf, forecast_mid_psf, forecast_high_psf,
           trend_series, peer_series, peer_count, peer_radius_m, sample_size,
           lease_years_remaining, lease_decay_pct_yr
    FROM project_metrics
    WHERE project_id = ${id}
  `);
  const caByUnitType: CaMetrics[] = (
    (caRows as { rows?: Record<string, unknown>[] }).rows ??
    (caRows as unknown as Record<string, unknown>[])
  ).map((r) => ({
    unitType: r.unit_type as CaMetrics["unitType"],
    momentumPctYr: r.momentum_pct_yr != null ? Number(r.momentum_pct_yr) : null,
    peerSpreadPct: r.peer_spread_pct != null ? Number(r.peer_spread_pct) : null,
    volumeTxnsYr: r.volume_txns_yr != null ? Number(r.volume_txns_yr) : null,
    volatilityPct: r.volatility_pct != null ? Number(r.volatility_pct) : null,
    caScore: r.ca_score != null ? Number(r.ca_score) : null,
    currentPsf: r.current_psf != null ? Number(r.current_psf) : null,
    forecastLowPsf: r.forecast_low_psf != null ? Number(r.forecast_low_psf) : null,
    forecastMidPsf: r.forecast_mid_psf != null ? Number(r.forecast_mid_psf) : null,
    forecastHighPsf: r.forecast_high_psf != null ? Number(r.forecast_high_psf) : null,
    trendSeries: Array.isArray(r.trend_series) ? (r.trend_series as CaMetrics["trendSeries"]) : [],
    peerSeries: Array.isArray(r.peer_series) ? (r.peer_series as CaMetrics["peerSeries"]) : [],
    peerCount: r.peer_count != null ? Number(r.peer_count) : null,
    peerRadiusM: r.peer_radius_m != null ? Number(r.peer_radius_m) : null,
    sampleSize: r.sample_size != null ? Number(r.sample_size) : null,
    leaseYearsRemaining: r.lease_years_remaining != null ? Number(r.lease_years_remaining) : null,
    leaseDecayPctYr: r.lease_decay_pct_yr != null ? Number(r.lease_decay_pct_yr) : null,
  }));

  // By unit type
  const types: UnitType[] = ["Studio", "1BR", "2BR", "3BR", "4BR+"];
  const byUnitType = types.map((ut) => {
    const tForType = recentTx.filter((t) => t.sqft && unitTypeFromSqft(t.sqft) === ut);
    const rForType = rents.filter((r) => r.sqft && unitTypeFromSqft(r.sqft) === ut);
    const mp = medianOf(tForType.map((t) => t.price));
    const mpsf = medianOf(tForType.map((t) => t.psf).filter((n) => Number.isFinite(n)));
    const mr = medianOf(rForType.map((r) => r.rent));
    const gy = mr && mp ? (mr * 12) / mp * 100 : null;
    return {
      unitType: ut,
      medianPrice: mp,
      medianPsf: mpsf,
      medianRent: mr,
      grossYieldPct: gy,
      txnCount: tForType.length,
      rentalCount: rForType.length,
    };
  }).filter((r) => r.txnCount > 0 || r.rentalCount > 0);

  return {
    id: Number(proj.id),
    name: String(proj.name),
    street: (proj.street as string) ?? null,
    marketSegment: (proj.market_segment as string) ?? null,
    tenure: (proj.tenure as string) ?? null,
    postalDistrict: (proj.postal_district as string) ?? null,
    nearestMrt: (proj.nearest_mrt as string) ?? null,
    mrtDistanceM: proj.mrt_distance_m != null ? Number(proj.mrt_distance_m) : null,
    latitude: proj.latitude != null ? Number(proj.latitude) : null,
    longitude: proj.longitude != null ? Number(proj.longitude) : null,
    completionYear: proj.completion_year != null ? Number(proj.completion_year) : null,
    totalUnits: proj.total_units != null ? Number(proj.total_units) : null,
    developerName: (proj.developer_name as string) ?? null,
    medianPrice,
    medianPsf,
    medianRent,
    grossYieldPct,
    txnCount: recentTx.length,
    rentalCount: rents.length,
    rentalsPerYear,
    byUnitType,
    recentTxns: txns.slice(0, 200),
    recentRentals: rents.slice(0, 200),
    caByUnitType,
  };
}
