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
import { fhEquivFactor, leaseDecayPctYr, yearsRemaining } from "@/lib/lease";

// ─── Tunables ────────────────────────────────────────────────────────────────
const LOOKBACK_QUARTERS = 20;
const FORECAST_QUARTERS = 4;
const MIN_TXNS = 6;
const MIN_QUARTERS = 4;
const PEER_RADIUS_M_PRIMARY = 1000;
const PEER_RADIUS_M_FALLBACK = 2000;
const MIN_PEERS = 3;
const RECENCY_TAU = 8; // quarters
const CA_WEIGHTS = { momentum: 0.35, spread: 0.30, volume: 0.20, volatility: 0.15 };

type UnitType = "Studio" | "1BR" | "2BR" | "3BR" | "4BR+" | "Overall";
const ALL_UNIT_TYPES: UnitType[] = ["Studio", "1BR", "2BR", "3BR", "4BR+", "Overall"];

type QuarterPoint = { qIdx: number; qLabel: string; psf: number; n: number };
type ProjectLoc = {
  id: number;
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
  forecastLowPsf: number | null;
  forecastMidPsf: number | null;
  forecastHighPsf: number | null;
  trendSeries: Array<{ q: string; psf: number; n: number }>;
  peerSeries: Array<{ q: string; psf: number; nPeers: number }>;
  peerCount: number;
  peerRadiusM: number;
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

// Distance-weighted median over peer projects' "Overall" quarterly PSF, with
// an optional per-peer multiplier applied to each PSF point (used to
// FH-equivalent-normalise leasehold peers before comparison).
// Peers that lack data for a quarter are skipped for that quarter.
function peerWeightedSeries(
  peers: Array<{ id: number; distanceM: number }>,
  allSeries: Map<number, Map<UnitType, QuarterPoint[]>>,
  psfMultiplierById: Map<number, number>
): Array<{ q: string; psf: number; nPeers: number }> {
  const byQuarter = new Map<number, Array<{ psf: number; w: number }>>();
  for (const peer of peers) {
    const peerOverall = allSeries.get(peer.id)?.get("Overall");
    if (!peerOverall) continue;
    const mult = psfMultiplierById.get(peer.id) ?? 1;
    // Distance weight: Gaussian with σ = 500m. Nearby peers dominate.
    const w = Math.exp(-((peer.distanceM / 500) ** 2));
    for (const pt of peerOverall) {
      const arr = byQuarter.get(pt.qIdx) ?? [];
      arr.push({ psf: pt.psf * mult, w: w * pt.n });
      byQuarter.set(pt.qIdx, arr);
    }
  }
  const out: Array<{ q: string; psf: number; nPeers: number; qIdx: number }> = [];
  for (const [qIdx, arr] of byQuarter) {
    const totalW = arr.reduce((s, a) => s + a.w, 0);
    if (totalW === 0) continue;
    // Weighted median approximation: sort by psf, pick value where cumulative w crosses 50%.
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
  return out.sort((a, b) => a.qIdx - b.qIdx).map(({ qIdx: _q, ...rest }) => rest);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Loading project locations…");
  const projRows = (await db.execute(sql`
    SELECT id, latitude, longitude, tenure, tenure_start_year, completion_year
    FROM projects
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `)) as unknown as { rows?: Record<string, unknown>[] };
  const projectList: ProjectLoc[] = (projRows.rows ?? (projRows as unknown as Record<string, unknown>[]))
    .map((r) => ({
      id: Number(r.id),
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

  // ─── Pass 1: compute per-series raw metrics (still missing peer_spread + ca_score)
  console.log("Computing per-(project, unit-type) metrics…");
  const pending: Metrics[] = [];
  const subjectCurrentPsfByProject = new Map<number, number>(); // for peer spread

  for (const proj of projectList) {
    const byType = allSeries.get(proj.id);
    if (!byType) continue;
    for (const ut of ALL_UNIT_TYPES) {
      const series = byType.get(ut);
      if (!series || !series.length) continue;
      const m = seriesMetrics(series, latestQIdx);
      if (!m) continue;

      if (ut === "Overall") subjectCurrentPsfByProject.set(proj.id, m.currentPsf);

      pending.push({
        projectId: proj.id,
        unitType: ut,
        momentumPctYr: m.momentumPctYr,
        peerSpreadPct: null, // filled below
        volumeTxnsYr: m.volumeTxnsYr,
        volatilityPct: m.volatilityPct,
        currentPsf: m.currentPsf,
        forecastLowPsf: m.forecast.low,
        forecastMidPsf: m.forecast.mid,
        forecastHighPsf: m.forecast.high,
        trendSeries: series.map((p) => ({ q: p.qLabel, psf: p.psf, n: p.n })),
        peerSeries: [],
        peerCount: 0,
        peerRadiusM: 0,
        sampleSize: m.sampleSize,
        caScore: null,
        leaseYearsRemaining: proj.leaseYr,
        leaseDecayPctYr: leaseDecayPctYr(proj.leaseYr),
      });
    }
  }
  console.log(`  ${pending.length} rows with metrics`);

  // ─── Pass 2: peer cohort + peer spread (once per project, applied to all its unit types)
  console.log("Computing peer cohorts + peer spreads…");
  const locById = new Map<number, ProjectLoc>(projectList.map((p) => [p.id, p]));

  type PeerResult = {
    spreadPct: number | null;
    peerSeries: Array<{ q: string; psf: number; nPeers: number }>;
    peerCount: number;
    peerRadiusM: number;
  };
  const peerByProject = new Map<number, PeerResult>();
  // Identity multipliers for the display series — chart shows raw observed peer PSF.
  const identityFactors = new Map<number, number>();
  for (const p of projectList) identityFactors.set(p.id, 1);

  for (const proj of projectList) {
    const subjectPsf = subjectCurrentPsfByProject.get(proj.id);
    let peers = findPeers(proj, grid, PEER_RADIUS_M_PRIMARY);
    let radius = PEER_RADIUS_M_PRIMARY;
    if (peers.length < MIN_PEERS) {
      peers = findPeers(proj, grid, PEER_RADIUS_M_FALLBACK);
      radius = PEER_RADIUS_M_FALLBACK;
    }
    if (peers.length < MIN_PEERS || subjectPsf == null) {
      peerByProject.set(proj.id, {
        spreadPct: null,
        peerSeries: [],
        peerCount: peers.length,
        peerRadiusM: radius,
      });
      continue;
    }

    // Display series: observed peer PSF (chart readability).
    const peerSeriesObserved = peerWeightedSeries(peers, allSeries, identityFactors);

    // Spread series: FH-equivalent-normalised on both sides so a short-lease
    // subject next to freehold towers doesn't register a false discount.
    const subjectFhEquiv = subjectPsf * (fhFactorById.get(proj.id) ?? 1);
    const peerSeriesFhEquiv = peerWeightedSeries(peers, allSeries, fhFactorById);
    const latestPeerFh = peerSeriesFhEquiv.slice(-2);
    const peerCurrentFh =
      latestPeerFh.length > 0
        ? latestPeerFh.reduce((s, p) => s + p.psf, 0) / latestPeerFh.length
        : null;
    const spreadPct =
      peerCurrentFh && peerCurrentFh > 0
        ? ((subjectFhEquiv - peerCurrentFh) / peerCurrentFh) * 100
        : null;

    peerByProject.set(proj.id, {
      spreadPct,
      peerSeries: peerSeriesObserved,
      peerCount: peers.length,
      peerRadiusM: radius,
    });
  }
  for (const m of pending) {
    const pr = peerByProject.get(m.projectId);
    if (pr) {
      m.peerSpreadPct = pr.spreadPct;
      m.peerSeries = pr.peerSeries;
      m.peerCount = pr.peerCount;
      m.peerRadiusM = pr.peerRadiusM;
    }
  }
  void locById;
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

    for (const m of metrics) {
      const rMom = percentileRank(sortedMomentum, m.momentumPctYr ?? 0);
      const rSpread =
        m.peerSpreadPct == null ? 50 : percentileRank(sortedNegSpread, -m.peerSpreadPct);
      const rVol = percentileRank(sortedVolume, m.volumeTxnsYr ?? 0);
      const rNegVar = percentileRank(sortedNegVol, -(m.volatilityPct ?? 0));
      m.caScore =
        CA_WEIGHTS.momentum * rMom +
        CA_WEIGHTS.spread * rSpread +
        CA_WEIGHTS.volume * rVol +
        CA_WEIGHTS.volatility * rNegVar;
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
        forecastLowPsf: num2(m.forecastLowPsf)?.toString() ?? null,
        forecastMidPsf: num2(m.forecastMidPsf)?.toString() ?? null,
        forecastHighPsf: num2(m.forecastHighPsf)?.toString() ?? null,
        trendSeries: m.trendSeries,
        peerSeries: m.peerSeries,
        peerCount: m.peerCount,
        peerRadiusM: m.peerRadiusM,
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
