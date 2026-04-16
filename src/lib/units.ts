// Classify a unit by floor area (sqft) into bedroom bands.
// SG market rules of thumb — imprecise but good enough for ranking/medians.
export type UnitType = "1BR" | "2BR" | "3BR" | "4BR+" | "Studio";

export function unitTypeFromSqft(sqft: number): UnitType {
  if (sqft < 450) return "Studio";
  if (sqft < 700) return "1BR";
  if (sqft < 1000) return "2BR";
  if (sqft < 1400) return "3BR";
  return "4BR+";
}

// Area comes from URA in sqm for transactions, sqft range (e.g., "1000 to 1100") for rentals.
export function sqmToSqft(sqm: number): number {
  return sqm * 10.7639;
}

export function parseSqftRange(range: string | null | undefined): number | null {
  if (!range) return null;
  const m = range.match(/(\d+)\s*(?:to|-)\s*(\d+)/i);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const n = Number(range);
  return Number.isFinite(n) ? n : null;
}
