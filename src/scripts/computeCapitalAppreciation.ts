/**
 * Computes per-(project, unit-type) capital-appreciation metrics and bulk-upserts
 * them into `project_metrics`. Runs entirely off the `transactions` table already
 * ingested from URA — no external calls, no user input.
 *
 * Pipeline:
 *   1. Pull quarterly median PSF per (project, unit_type) for the last 20 quarters.
 *   2. For each series, fit a weighted linear regression (recency × sqrt(n)) →
 *      slope → momentum_pct_yr; residual σ → volatility + forecast band.
 *   3. Compute 1km peer cohort per project via haversine (grid-indexed).
 *      Peer PSF series = distance-weighted median of peers' "Overall" quarterly PSF.
 *      Peer spread = (subject PSF − peer PSF) / peer PSF.
 *   4. Rank-percentile each of {momentum, −peer_spread, volume, −volatility}
 *      within each unit_type cohort → composite ca_score (0–100).
 *   5. Upsert into project_metrics.
 *
 * Run: `npx tsx src/scripts/computeCapitalAppreciation.ts`
 */

import "dotenv/config";
import { db } from "@/lib/db";
import { projectMetrics } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { haversineMeters } from "@/lib/geo";
import { fhEquivFactor, leaseDecayPctYr, leaseRunwayScore, yearsRemaining } from "@/lib/lease";

// ─── Tunables ────────────────────────────────────────────────────────────────
const LOOKBACK_QUARTERS = 20;
const FORECAST_QUARTERS = 4;
const MIN_TXNS = 3;
const MIN_QUARTERS = 3;
const PEER_RADIUS_M_PRIMARY = 1000;
const PEER_RADIUS_M_FALLBACK = 2000;
const MIN_PEERS = 3;
const RECENCY_TAU = 8; // quarters
const CA_WEIGHTS = { momentum: 0.30, spread: 0.20, volume: 0.15, volatility: 0.10, leaseRunway: 0.25 };

type UnitType = "Studio" | "1BR" | "2BR" | "3BR" | "4BR+" | "Overall";
const ALL_UNIT_TYPES: UnitType[] = ["Studio", "1BR", "2BR", "3BR", "4BR+", "Overall"];

type QuarterPoint = { qIdx: number; qLabel: string; psf: number; n: number };
type PeerProjectInfo = {
  id: number;
  name: string;
  tenure: string | null;
  leaseYr: number | null;
  distanceM: number;
  currentPsf: number | null;
};
type ProjectLoc = {
  id: number;
  name: string;
  tenure: string | null;
  lat: number;
  lng: number;
  leaseYr: number | null;
};

type Metrics = {
  projectId: number;
  unitType: UnitType;
  momentumPctYr: number | null;
  peerSpreadPct: number | null;
  volumeTxnsYr: number | null;
  volatilityPct: number | null;
  currentPsf: number | null;
  fairValuePsf: number | null;
  forecastLowPsf: number | null;
  forecastMidPsf: number | null;
  forecastHighPsf: number | null;
  trendSeries: Array<{ q: string; psf: number; n: number }>;
  peerSeries: Array<{ q: string; psf: number; nPeers: number }>;
  peerCount: number;
  peerRadiusM: number;
  peerProjectsList: PeerProjectInfo[];
  sampleSize: number;
  caScore: number | null;
  leaseYearsRemaining: number | null;
  leaseDecayPctYr: number | null;
};

// ─── Quarter helpers ─────────────────────────────────────────────────────────
// Quarter index is months since epoch / 3, monotonically increasing.
function quarterIndexFromDate(iso: string): number {
  const d = new Date(iso);
  return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
}
function labelFromQuarterIndex(qIdx: number): string {
  const year = Math.floor(qIdx / 4);
  const q = (qIdx % 4) + 1;
  return `${year}-Q${q}`;
}

// ─── Weighted linear regression ──────────────────────────────────────────────
function weightedLinearFit(pts: Array<{ x: number; y: number; w: number }>): {
  slope: number;
  intercept: number;
  residualStd: number;
  meanY: number;
} | null {
  const sw = pts.reduce((s, p) => s + p.w, 0);
  if (sw <= 0 || pts.length < 2) return null;
  const xBar = pts.reduce((s, p) => s + p.w * p.x, 0) / sw;
  const yBar = pts.reduce((s, p) => s + p.w * p.y, 0) / sw;
  let num = 0,
    den = 0;
  for (const p of pts) {
    num += p.w * (p.x - xBar) * (p.y - yBar);
    den += p.w * (p.x - xBar) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = yBar - slope * xBar;
  let resSumSq = 0;
  for (const p of pts) {
    const yHat = intercept + slope * p.x;
    resSumSq += p.w * (p.y - yHat) ** 2;
  }
  const residualStd = Math.sqrt(resSumSq / sw);
  return { slope, intercept, residualStd, meanY: yBar };
}

// ─── Per-series metrics ──────────────────────────────────────────────────────
function seriesMetrics(
  series: QuarterPoint[],
  latestQIdx: number
): {
  momentumPctYr: number;
  volatilityPct: number;
  volumeTxnsYr: number;
  currentPsf: number;
  forecast: { low: number; mid: number; high: number };
  sampleSize: number;
} | null {
  if (series.length < MIN_QUARTERS) return null;
  const total = series.reduce((s, p) => s + p.n, 0);
  if (total < MIN_TXNS) return null;

  // Build regression points. x = quarter index. Weight = sqrt(n) × recency decay.
  const pts = series.map((p) => {
    const lag = latestQIdx - p.qIdx; // 0 for newest
    const recency = Math.exp(-lag / RECENCY_TAU);
    return { x: p.qIdx, y: p.psf, w: Math.sqrt(p.n) * recency };
  });
  const fit = weightedLinearFit(pts);
  if (!fit) return null;

  // Current PSF = weighted average of last 2 quarters (or latest one if only one).
  const recent = series.slice(-2);
  const currentPsf =
    recent.reduce((s, p) => s + p.psf * p.n, 0) / recent.reduce((s, p) => s + p.n, 0);

  const momentumPctYr = fit.meanY > 0 ? ((fit.slope * 4) / fit.meanY) * 100 : 0;
  const volatilityPct = fit.meanY > 0 ? (fit.residualStd / fit.meanY) * 100 : 0;

  // Volume: txns/yr averaged over the last 8 quarters (2 years).
  const lookbackCutoff = latestQIdx - 7;
  const recentTxns = series.filter((p) => p.qIdx >= lookbackCutoff).reduce((s, p) => s + p.n, 0);
  const volumeTxnsYr = recentTxns / 2;

  // Forecast 4 quarters out, 90% band from residual σ.
  const fMidX = latestQIdx + FORECAST_QUARTERS;
  const fMid = fit.intercept + fit.slope * fMidX;
  const halfBand = 1.65 * fit.residualStd;
  const forecast = {
    low: Math.max(0, fMid - halfBand),
    mid: Math.max(0, fMid),
    high: Math.max(0, fMid + halfBand),
  };

  return {
    momentumPctYr,
    volatilityPct,
    volumeTxnsYr,
    currentPsf,
    forecast,
    sampleSize: total,
  };
}

// ─── Grid index for peer lookup ──────────────────────────────────────────────
const GRID_DEG = 0.01; // ~1.1 km
function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_DEG)},${Math.floor(lng / GRID_DEG)}`;
}
function neighborCells(lat: number, lng: number, rings: number): string[] {
  const baseLat = Math.floor(lat / GRID_DEG);
  const baseLng = Math.floor(lng / GRID_DEG);
  const keys: string[] = [];
  for (let dy = -rings; dy <= rings; dy++) {
    for (let dx = -rings; dx <= rings; dx++) {
      keys.push(`${baseLat + dy},${baseLng + dx}`);
    }
  }
  return keys;
}

function findPeers(
  subject: ProjectLoc,
  grid: Map<string, ProjectLoc[]>,
  radiusM: number
): Array<{ id: number; distanceM: number }> {
  const rings = Math.ceil(radiusM / (GRID_DEG * 111_000)) + 1;
  const peers: Array<{ id: number; distanceM: number }> = [];
  for (const key of neighborCells(subject.lat, subject.lng, rings)) {
    const bucket = grid.get(key);
    if (!bucket) continue;
    for (const p of bucket) {
      if (p.id === subject.id) continue;
      const d = haversineMeters(subject, p);
      if (d <= radiusM) peers.push({ id: p.id, distanceM: d });
    }
  }
  return peers;
}

// Distance-weighted median over peer projects' quarterly PSF for a given unit type,
// with an optional per-peer multiplier (used for FH-equivalent normalisation).
// Peers that lack data for the specified unit type are skipped entirely.
function peerWeightedSeries(
  peers: Array<{ id: number; distanceM: number }>,
  allSeries: Map<number, Map<UnitType, QuarterPoint[]>>,
  unitType: UnitType,
  psfMultiplierById: Map<number, number>
): { series: Array<{ q: string; psf: number; nPeers: number }>; includedPeerIds: number[] } {
  const byQuarter = new Map<number, Array<{ psf: number; w: number }>>();
  const includedPeerIds: number[] = [];
  for (const peer of peers) {
    const peerSeries = allSeries.get(peer.id)?.get(unitType);
    if (!peerSeries || !peerSeries.length) continue;
    includedPeerIds.push(peer.id);
    const mult = psfMultiplierById.get(peer.id) ?? 1;
    // Bucketed distance weight: 0–250m = 1.0, 250–500m = 0.5, 500–1000m = 0.2
    const w = peer.distanceM <= 250 ? 1.0 : peer.distanceM <= 500 ? 0.5 : 0.2;
    for (const pt of peerSeries) {
      const arr = byQuarter.get(pt.qIdx) ?? [];
      arr.push({ psf: pt.psf * mult, w: w * pt.n });
      byQuarter.set(pt.qIdx, arr);
    }
  }
  const out: Array<{ q: string; psf: number; nPeers: number; qIdx: number }> = [];
  for (const [qIdx, arr] of byQuarter) {
    const totalW = arr.reduce((s, a) => s + a.w, 0);
    if (totalW === 0) continue;
    arr.sort((a, b) => a.psf - b.psf);
    let cum = 0;
    let medianPsf = arr[arr.length - 1].psf;
    for (const a of arr) {
      cum += a.w;
      if (cum >= totalW / 2) {
        medianPsf = a.psf;
        break;
      }
    }
    out.push({ q: labelFromQuarterIndex(qIdx), psf: medianPsf, nPeers: arr.length, qIdx });
  }
  return {
    series: out.sort((a, b) => a.qIdx - b.qIdx).map(({ qIdx: _q, ...rest }) => rest),
    includedPeerIds,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Loading project locations…");
  const projRows = (await db.execute(sql`
    SELECT id, name, tenure, latitude, longitude, tenure_start_year, completion_year
    FROM projects
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `)) as unknown as { rows?: Record<string, unknown>[] };
  const projectList: ProjectLoc[] = (projRows.rows ?? (projRows as unknown as Record<string, unknown>[]))
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      tenure: (r.tenure as string) ?? null,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      leaseYr: yearsRemaining(
        (r.tenure as string) ?? null,
        r.tenure_start_year != null ? Number(r.tenure_start_year) : null,
        r.completion_year != null ? Number(r.completion_year) : null
      ),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  console.log(`  ${projectList.length} projects with coords`);
  const withLease = projectList.filter((p) => p.leaseYr != null).length;
  console.log(`  ${withLease} resolved lease years; ${projectList.length - withLease} unknown (treated as freehold)`);

  // Bala-based FH-equivalent factor per project (multiply observed PSF by this
  // to normalise to a fresh-99 / freehold basis).
  const fhFactorById = new Map<number, number>();
  for (const p of projectList) {
    fhFactorById.set(p.id, fhEquivFactor(p.leaseYr));
  }
  const leaseYrById = new Map<number, number | null>();
  for (const p of projectList) leaseYrById.set(p.id, p.leaseYr);

  // Grid index for peer scan
  const grid = new Map<string, ProjectLoc[]>();
  for (const p of projectList) {
    const k = gridKey(p.lat, p.lng);
    const arr = grid.get(k) ?? [];
    arr.push(p);
    grid.set(k, arr);
  }

  console.log("Aggregating quarterly PSF from transactions…");
  // Per-unit-type rows + an "Overall" rollup computed via UNION ALL in SQL.
  const aggRows = (await db.execute(sql`
    WITH tx_typed AS (
      SELECT
        project_id,
        area_sqm::numeric * 10.7639 AS sqft,
        psf_sqft::numeric AS psf,
        contract_date,
        CASE
          WHEN area_sqm::numeric * 10.7639 < 450 THEN 'Studio'
          WHEN area_sqm::numeric * 10.7639 < 700 THEN '1BR'
          WHEN area_sqm::numeric * 10.7639 < 1000 THEN '2BR'
          WHEN area_sqm::numeric * 10.7639 < 1400 THEN '3BR'
          ELSE '4BR+'
        END AS unit_type
      FROM transactions
      WHERE contract_date >= (CURRENT_DATE - INTERVAL '60 months')
        AND area_sqm IS NOT NULL
        AND psf_sqft IS NOT NULL
        AND psf_sqft::numeric BETWEEN 200 AND 10000
    ),
    per_type AS (
      SELECT
        project_id,
        unit_type,
        DATE_TRUNC('quarter', contract_date)::date AS quarter,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) AS median_psf,
        COUNT(*)::int AS n
      FROM tx_typed
      GROUP BY project_id, unit_type, DATE_TRUNC('quarter', contract_date)
    ),
    overall AS (
      SELECT
        project_id,
        'Overall' AS unit_type,
        DATE_TRUNC('quarter', contract_date)::date AS quarter,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) AS median_psf,
        COUNT(*)::int AS n
      FROM tx_typed
      GROUP BY project_id, DATE_TRUNC('quarter', contract_date)
    )
    SELECT * FROM per_type
    UNION ALL
    SELECT * FROM overall
  `)) as unknown as { rows?: Record<string, unknown>[] };
  const aggData = aggRows.rows ?? (aggRows as unknown as Record<string, unknown>[]);
  console.log(`  ${aggData.length} (project, unit_type, quarter) rows`);

  // Group into Map<projectId, Map<unitType, QuarterPoint[]>>
  const allSeries = new Map<number, Map<UnitType, QuarterPoint[]>>();
  for (const row of aggData) {
    const pid = Number(row.project_id);
    const ut = row.unit_type as UnitType;
    const qIdx = quarterIndexFromDate(String(row.quarter));
    const pt: QuarterPoint = {
      qIdx,
      qLabel: labelFromQuarterIndex(qIdx),
      psf: Number(row.median_psf),
      n: Number(row.n),
    };
    let byType = allSeries.get(pid);
    if (!byType) {
      byType = new Map();
      allSeries.set(pid, byType);
    }
    const arr = byType.get(ut) ?? [];
    arr.push(pt);
    byType.set(ut, arr);
  }
  // Sort and clip each series to the last LOOKBACK_QUARTERS quarters.
  const now = quarterIndexFromDate(new Date().toISOString().slice(0, 10));
  const cutoff = now - LOOKBACK_QUARTERS;
  for (const byType of allSeries.values()) {
    for (const [ut, arr] of byType) {
      const sorted = arr.filter((p) => p.qIdx >= cutoff).sort((a, b) => a.qIdx - b.qIdx);
      byType.set(ut, sorted);
    }
  }
  const latestQIdx = now; // inclusive horizon for weighting/forecast

  // ─── Pass 1: project-level metrics from Overall series + per-type currentPsf
  // Momentum, volatility, volume, forecast are project-level (same building,
  // same location → appreciates as a whole). Only peer spread is type-specific.
  console.log("Computing project-level metrics (Overall) + per-type currentPsf…");
  const pending: Metrics[] = [];
  // currentPsf keyed by "projectId-unitType" — used for type-specific peer comparison
  const currentPsfLookup = new Map<string, number>();
  // Project-level metrics from the Overall series
  type ProjectMetricsBase = {
    momentumPctYr: number;
    volatilityPct: number;
    volumeTxnsYr: number;
    forecastLow: number;
    forecastMid: number;
    forecastHigh: number;
    trendSeries: Array<{ q: string; psf: number; n: number }>;
    sampleSize: number;
    currentPsf: number;
  };
  const projectBaseMetrics = new Map<number, ProjectMetricsBase>();

  // First pass: compute Overall metrics + all per-type currentPsf lookups
  for (const proj of projectList) {
    const byType = allSeries.get(proj.id);
    if (!byType) continue;

    // Compute Overall project-level metrics
    const overallSeries = byType.get("Overall");
    if (overallSeries && overallSeries.length) {
      const m = seriesMetrics(overallSeries, latestQIdx);
      if (m) {
        projectBaseMetrics.set(proj.id, {
          momentumPctYr: m.momentumPctYr,
          volatilityPct: m.volatilityPct,
          volumeTxnsYr: m.volumeTxnsYr,
          forecastLow: m.forecast.low,
          forecastMid: m.forecast.mid,
          forecastHigh: m.forecast.high,
          trendSeries: overallSeries.map((p) => ({ q: p.qLabel, psf: p.psf, n: p.n })),
          sampleSize: m.sampleSize,
          currentPsf: m.currentPsf,
        });
        currentPsfLookup.set(`${proj.id}-Overall`, m.currentPsf);
      }
    }

    // Build per-type currentPsf (for peer spread only)
    for (const ut of ALL_UNIT_TYPES) {
      if (ut === "Overall") continue;
      const series = byType.get(ut);
      if (!series || !series.length) continue;
      const m = seriesMetrics(series, latestQIdx);
      if (m) {
        currentPsfLookup.set(`${proj.id}-${ut}`, m.currentPsf);
      }
    }
  }

  // Emit rows: one per (project, unit-type) that has EITHER Overall metrics OR
  // per-type currentPsf. Project-level metrics come from Overall; currentPsf
  // is type-specific (for the peer spread tile) with Overall fallback.
  for (const proj of projectList) {
    const base = projectBaseMetrics.get(proj.id);
    if (!base) continue; // skip projects without Overall data
    const byType = allSeries.get(proj.id);
    if (!byType) continue;

    for (const ut of ALL_UNIT_TYPES) {
      // For non-Overall types, only emit if there's at least some type data OR if it's Overall
      if (ut !== "Overall" && !currentPsfLookup.has(`${proj.id}-${ut}`)) continue;

      const typePsf = currentPsfLookup.get(`${proj.id}-${ut}`) ?? base.currentPsf;

      pending.push({
        projectId: proj.id,
        unitType: ut,
        // Project-level metrics (from Overall series)
        momentumPctYr: base.momentumPctYr,
        volatilityPct: base.volatilityPct,
        volumeTxnsYr: base.volumeTxnsYr,
        forecastLowPsf: base.forecastLow,
        forecastMidPsf: base.forecastMid,
        forecastHighPsf: base.forecastHigh,
        trendSeries: base.trendSeries,
        sampleSize: base.sampleSize,
        // Type-specific currentPsf (for peer comparison)
        currentPsf: typePsf,
        // Filled in Pass 2
        peerSpreadPct: null,
        fairValuePsf: null,
        peerSeries: [],
        peerCount: 0,
        peerRadiusM: 0,
        peerProjectsList: [],
        caScore: null,
        // Project-level lease
        leaseYearsRemaining: proj.leaseYr,
        leaseDecayPctYr: leaseDecayPctYr(proj.leaseYr),
      });
    }
  }
  console.log(`  ${pending.length} rows with metrics (project-level + per-type)`);

  // ─── Pass 2: peer cohort + peer spread (per unit type)
  // Peers are matched by haversine (cached per project), then filtered to only
  // those with data for the SAME unit type. Peers without data for the viewed
  // type are excluded from computation AND from the peer projects list.
  console.log("Computing per-unit-type peer cohorts + peer spreads…");
  const locById = new Map<number, ProjectLoc>(projectList.map((p) => [p.id, p]));

  // Identity multipliers for display series (raw observed PSF).
  const identityFactors = new Map<number, number>();
  for (const p of projectList) identityFactors.set(p.id, 1);

  // Cache haversine peer lookups per project (same for all unit types).
  const geoPeersCache = new Map<number, { peers: Array<{ id: number; distanceM: number }>; radius: number }>();

  for (const m of pending) {
    // Get or compute geo peers for this project
    let geoEntry = geoPeersCache.get(m.projectId);
    if (!geoEntry) {
      const proj = locById.get(m.projectId)!;
      let peers = findPeers(proj, grid, PEER_RADIUS_M_PRIMARY);
      let radius = PEER_RADIUS_M_PRIMARY;
      if (peers.length < MIN_PEERS) {
        peers = findPeers(proj, grid, PEER_RADIUS_M_FALLBACK);
        radius = PEER_RADIUS_M_FALLBACK;
      }
      geoEntry = { peers, radius };
      geoPeersCache.set(m.projectId, geoEntry);
    }

    // Filter to peers with sufficient data for THIS unit type — they must have
    // passed the seriesMetrics threshold (≥6 txns, ≥4 quarters) and thus have
    // a currentPsf entry. Peers with sparse data are excluded entirely.
    const peersWithType = geoEntry.peers.filter((peer) =>
      currentPsfLookup.has(`${peer.id}-${m.unitType}`)
    );

    if (peersWithType.length < MIN_PEERS || m.currentPsf == null) {
      m.peerSpreadPct = null;
      m.peerSeries = [];
      m.peerCount = 0;
      m.peerRadiusM = geoEntry.radius;
      m.peerProjectsList = [];
      continue;
    }

    // Display series: observed peer PSF for this unit type
    const { series: peerSeriesObserved, includedPeerIds } = peerWeightedSeries(
      peersWithType, allSeries, m.unitType, identityFactors
    );

    // Spread: FH-equivalent-normalised for this unit type
    const subjectFhEquiv = m.currentPsf * (fhFactorById.get(m.projectId) ?? 1);
    const { series: peerSeriesFhEquiv } = peerWeightedSeries(
      peersWithType, allSeries, m.unitType, fhFactorById
    );
    const latestPeerFh = peerSeriesFhEquiv.slice(-2);
    const peerCurrentFh =
      latestPeerFh.length > 0
        ? latestPeerFh.reduce((s, p) => s + p.psf, 0) / latestPeerFh.length
        : null;
    m.peerSpreadPct =
      peerCurrentFh && peerCurrentFh > 0
        ? ((subjectFhEquiv - peerCurrentFh) / peerCurrentFh) * 100
        : null;
    // Fair value PSF = peer FH-equiv median converted back to subject's lease basis.
    // This is what the property "should" trade at if it were priced in line with peers.
    const subjectBalaFraction = 1 / (fhFactorById.get(m.projectId) ?? 1); // e.g. 0.905 for 83yr
    m.fairValuePsf = peerCurrentFh != null ? peerCurrentFh * subjectBalaFraction : null;
    m.peerSeries = peerSeriesObserved;
    m.peerCount = includedPeerIds.length;
    m.peerRadiusM = geoEntry.radius;

    // Build peer project info list with per-type PSF (sorted by distance)
    const includedSet = new Set(includedPeerIds);
    m.peerProjectsList = peersWithType
      .filter((peer) => includedSet.has(peer.id))
      .sort((a, b) => a.distanceM - b.distanceM)
      .map((peer) => {
        const pLoc = locById.get(peer.id);
        const peerPsf = currentPsfLookup.get(`${peer.id}-${m.unitType}`) ?? null;
        return {
          id: peer.id,
          name: pLoc?.name ?? "",
          tenure: pLoc?.tenure ?? null,
          leaseYr: pLoc?.leaseYr ?? null,
          distanceM: Math.round(peer.distanceM),
          currentPsf: peerPsf != null ? Math.round(peerPsf) : null,
        };
      });
  }
  void leaseYrById;

  // ─── Pass 3: percentile-rank within unit_type cohort → ca_score
  console.log("Percentile-ranking composite CA score…");
  function percentileRank(sorted: number[], x: number): number {
    // Returns 0–100. Uses lower-bound position for ties.
    if (!sorted.length) return 50;
    let lo = 0,
      hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return (lo / sorted.length) * 100;
  }

  const byUnitType = new Map<UnitType, Metrics[]>();
  for (const m of pending) {
    const arr = byUnitType.get(m.unitType) ?? [];
    arr.push(m);
    byUnitType.set(m.unitType, arr);
  }
  for (const [, metrics] of byUnitType) {
    const sortedMomentum = metrics.map((m) => m.momentumPctYr ?? 0).sort((a, b) => a - b);
    const sortedNegSpread = metrics
      .filter((m) => m.peerSpreadPct != null)
      .map((m) => -(m.peerSpreadPct as number))
      .sort((a, b) => a - b);
    const sortedVolume = metrics.map((m) => m.volumeTxnsYr ?? 0).sort((a, b) => a - b);
    const sortedNegVol = metrics.map((m) => -(m.volatilityPct ?? 0)).sort((a, b) => a - b);
    const sortedLeaseRunway = metrics.map((m) => leaseRunwayScore(m.leaseYearsRemaining)).sort((a, b) => a - b);

    for (const m of metrics) {
      const rMom = percentileRank(sortedMomentum, m.momentumPctYr ?? 0);
      const rawSpread =
        m.peerSpreadPct == null ? 50 : percentileRank(sortedNegSpread, -m.peerSpreadPct);
      const rVol = percentileRank(sortedVolume, m.volumeTxnsYr ?? 0);
      const rNegVar = percentileRank(sortedNegVol, -(m.volatilityPct ?? 0));
      const lrScore = leaseRunwayScore(m.leaseYearsRemaining);
      const rLease = percentileRank(sortedLeaseRunway, lrScore);
      // Scale peer spread by lease runway: short-lease "discounts" are structural
      // (age + lease burn), not mean-reversion opportunities. Full credit only
      // for freehold/long-lease properties where undervaluation is actionable.
      const rSpread = rawSpread * (lrScore / 100);
      m.caScore =
        CA_WEIGHTS.momentum * rMom +
        CA_WEIGHTS.spread * rSpread +
        CA_WEIGHTS.volume * rVol +
        CA_WEIGHTS.volatility * rNegVar +
        CA_WEIGHTS.leaseRunway * rLease;
    }
  }

  // ─── Upsert
  console.log(`Upserting ${pending.length} rows into project_metrics…`);
  // Clear stale rows that are no longer present (e.g. project deleted or lost data).
  // Simpler approach: truncate the table and insert fresh. Safe because the data is
  // fully derived from transactions.
  await db.execute(sql`TRUNCATE TABLE project_metrics RESTART IDENTITY`);

  const CHUNK = 500;
  const num2 = (n: number | null) =>
    n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;
  const num1 = (n: number | null) =>
    n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const batch = pending.slice(i, i + CHUNK);
    await db.insert(projectMetrics).values(
      batch.map((m) => ({
        projectId: m.projectId,
        unitType: m.unitType,
        momentumPctYr: num2(m.momentumPctYr)?.toString() ?? null,
        peerSpreadPct: num2(m.peerSpreadPct)?.toString() ?? null,
        volumeTxnsYr: num2(m.volumeTxnsYr)?.toString() ?? null,
        volatilityPct: num2(m.volatilityPct)?.toString() ?? null,
        caScore: num1(m.caScore)?.toString() ?? null,
        currentPsf: num2(m.currentPsf)?.toString() ?? null,
        fairValuePsf: num2(m.fairValuePsf)?.toString() ?? null,
        forecastLowPsf: num2(m.forecastLowPsf)?.toString() ?? null,
        forecastMidPsf: num2(m.forecastMidPsf)?.toString() ?? null,
        forecastHighPsf: num2(m.forecastHighPsf)?.toString() ?? null,
        trendSeries: m.trendSeries,
        peerSeries: m.peerSeries,
        peerCount: m.peerCount,
        peerRadiusM: m.peerRadiusM,
        peerProjects: m.peerProjectsList,
        sampleSize: m.sampleSize,
        leaseYearsRemaining: m.leaseYearsRemaining,
        leaseDecayPctYr: num2(m.leaseDecayPctYr)?.toString() ?? null,
      }))
    );
    console.log(`  ${Math.min(i + CHUNK, pending.length)}/${pending.length}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
