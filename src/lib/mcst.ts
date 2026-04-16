// Rough MCST monthly fee estimator for SG private non-landed properties.
// Calibrated to the typical $300–$700/month range.
// Drivers: unit size (bigger = more per month), segment (tier proxy), age/size adjustments.

export type McstInput = {
  sqft: number;
  segment: "CCR" | "RCR" | "OCR" | null | undefined;
  tenure?: string | null;       // if contains "99" we treat as mass-market; freehold nudges up
  propertyType?: string | null; // "Executive Condominium" = -15%
  completionYear?: number | null;
  totalUnits?: number | null;
};

export function estimateMcstMonthly(input: McstInput): number {
  const baseBySegment = {
    CCR: 0.50,
    RCR: 0.40,
    OCR: 0.32,
  } as const;
  const base = input.segment ? baseBySegment[input.segment] : 0.35;

  let fee = base * input.sqft;

  // Small development or very old → weaker economies of scale.
  const age = input.completionYear ? new Date().getFullYear() - input.completionYear : null;
  if ((input.totalUnits != null && input.totalUnits < 100) || (age != null && age > 25)) {
    fee *= 1.2;
  }

  // ECs have lower fees than private condos.
  if (input.propertyType === "Executive Condominium") {
    fee *= 0.85;
  }

  return Math.round(Math.max(300, Math.min(700, fee)));
}
