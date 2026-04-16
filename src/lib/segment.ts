// URA Market Segment classification by postal district.
// CCR = Core Central Region (prime), RCR = Rest of Central, OCR = Outside Central.
// Source: URA's standard segmentation used in Real Estate Information System.
const CCR = new Set(["01", "02", "04", "06", "09", "10", "11"]);
const RCR = new Set(["03", "05", "07", "08", "12", "13", "14", "15", "20"]);

export function districtToSegment(district: string | null | undefined): "CCR" | "RCR" | "OCR" | null {
  if (!district) return null;
  const d = district.padStart(2, "0");
  if (CCR.has(d)) return "CCR";
  if (RCR.has(d)) return "RCR";
  return "OCR";
}
