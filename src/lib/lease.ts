// Singapore lease valuation helpers.
//
// Bala's Table (SLA) expresses the value of a leasehold property as a percentage
// of the same property with a fresh 99-year lease (freehold-equivalent for our
// purposes, since the small gap between freehold and 99yr-new is immaterial for
// a comparables analysis). Used to:
//   1. Normalise PSFs to a common tenure basis before comparing to 1km peers.
//   2. Derive the annual structural decay rate for a leasehold property.

// SLA-published anchors, 5-year granularity.
// Source: https://www.sla.gov.sg/land-matters/state-land-and-properties/tables-of-value-for-leasehold
const BALA: ReadonlyArray<readonly [number, number]> = [
  [100, 100.0],
  [99, 100.0],
  [95, 98.8],
  [90, 96.3],
  [85, 93.3],
  [80, 90.5],
  [75, 87.4],
  [70, 84.1],
  [65, 80.5],
  [60, 76.7],
  [55, 72.5],
  [50, 67.9],
  [45, 62.9],
  [40, 57.4],
  [35, 51.3],
  [30, 44.5],
  [25, 36.9],
  [20, 28.5],
  [15, 19.5],
  [10, 10.0],
  [5, 3.0],
  [0, 0.0],
];

// Linear interpolation between adjacent anchors.
export function balaValuePct(yearsRemaining: number): number {
  if (!Number.isFinite(yearsRemaining)) return 100;
  if (yearsRemaining >= 99) return 100;
  if (yearsRemaining <= 0) return 0;
  for (let i = 0; i < BALA.length - 1; i++) {
    const [yHi, vHi] = BALA[i];
    const [yLo, vLo] = BALA[i + 1];
    if (yearsRemaining <= yHi && yearsRemaining >= yLo) {
      const t = (yearsRemaining - yLo) / (yHi - yLo);
      return vLo + t * (vHi - vLo);
    }
  }
  return 0;
}

// Ratio: observedPsf * tenureAdjustment gives the freehold-equivalent PSF.
export function fhEquivFactor(yearsRemaining: number | null): number {
  if (yearsRemaining == null) return 1; // treat unknown as freehold — safer than stripping value
  const v = balaValuePct(yearsRemaining);
  if (v <= 0) return 1;
  return 100 / v;
}

// Expected structural change in property value per year from lease burn alone.
// Returns a negative number for leaseholds (value decays), 0 for freehold/unknown.
export function leaseDecayPctYr(yearsRemaining: number | null): number {
  if (yearsRemaining == null || yearsRemaining >= 99) return 0;
  if (yearsRemaining <= 1) return 0;
  const vNow = balaValuePct(yearsRemaining);
  const vNext = balaValuePct(yearsRemaining - 1);
  if (vNow <= 0) return 0;
  return ((vNext - vNow) / vNow) * 100; // negative
}

// Lease runway score (0–100) reflecting real-world financing cliffs.
// Unlike Bala's smooth theoretical curve, this captures the demand-side
// reality: CPF restrictions at ~60yr, bank financing collapse at ~40yr,
// cash-only market below ~30yr.
//
//   100  FH / 999yr / 75+ yr remaining  — full financing, full CPF
//    95  70–74 yr remaining             — minor CPF pro-rating starts
//    85  60–69 yr remaining             — CPF restrictions bite, buyer pool shrinks
//    60  50–59 yr remaining             — significant financing headwinds
//    35  40–49 yr remaining             — approaching severe cliff
//    15  30–39 yr remaining             — most banks won't lend to most ages
//     5  20–29 yr remaining             — effectively cash-only
//     0  <20 yr remaining               — near-zero appreciation potential
export function leaseRunwayScore(yearsRemaining: number | null): number {
  if (yearsRemaining == null || yearsRemaining >= 75) return 100;
  if (yearsRemaining >= 70) return 95;
  if (yearsRemaining >= 60) return 85 - (69 - yearsRemaining) * 2.5; // 85 → 60
  if (yearsRemaining >= 50) return 60 - (59 - yearsRemaining) * 2.5; // 60 → 35
  if (yearsRemaining >= 40) return 35 - (49 - yearsRemaining) * 2.0; // 35 → 15
  if (yearsRemaining >= 30) return 15 - (39 - yearsRemaining) * 1.0; // 15 → 5
  if (yearsRemaining >= 20) return 5;
  return 0;
}

// Extract lease length + start year from a URA tenure text + metadata.
// URA returns strings like:
//   "Freehold"
//   "99 yrs lease commencing from 01/06/2015"
//   "99 yrs from 2015"
//   "999 yrs lease commencing from ..."
//   sometimes the commencement date is absent → fall back to completionYear.
export function yearsRemaining(
  tenureText: string | null | undefined,
  tenureStartYear: number | null | undefined,
  completionYear: number | null | undefined,
  today: Date = new Date()
): number | null {
  if (!tenureText) return null;
  const t = tenureText.toLowerCase();
  if (t.includes("freehold") || /\b999\b/.test(t)) return 100; // cap
  const lenMatch = t.match(/(\d{2,4})\s*yrs?/);
  if (!lenMatch) return null;
  const leaseLen = Number(lenMatch[1]);
  if (!Number.isFinite(leaseLen) || leaseLen <= 0) return null;
  const inlineYear = t.match(/(?:commencing\s*from|from)\s.*?(\d{4})/);
  const startYear =
    (inlineYear ? Number(inlineYear[1]) : undefined) ??
    tenureStartYear ??
    completionYear ??
    null;
  if (!startYear) return null;
  const elapsed = today.getUTCFullYear() - startYear;
  return Math.max(0, Math.min(leaseLen, leaseLen - elapsed));
}
