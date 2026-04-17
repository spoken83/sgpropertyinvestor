import Link from "next/link";
import { getAllRanked } from "@/lib/ranking";
import { getProfile } from "@/lib/profile";
import { computeRoi } from "@/lib/roi";
import PropertiesTable, { type Row, type SortKey } from "./PropertiesTable";
import PropertiesCardList from "./PropertiesCardList";
import FiltersBar from "./FiltersBar";
import { NavProvider } from "./NavContext";
import ResultsOverlay from "./ResultsOverlay";
import Pagination from "./Pagination";
import BackButton from "@/components/BackButton";
import RememberListUrl from "./RememberListUrl";

const fmt = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

const PAGE_SIZE = 50;

type SP = {
  max?: string;
  segment?: string;
  tenure?: string;
  mrtOp?: string;
  mrtVal?: string;
  unitsOp?: string;
  unitsVal?: string;
  psfOp?: string;
  psfVal?: string;
  ageOp?: string;
  ageVal?: string;
  q?: string;
  type?: string;
  minYield?: string;
  minCa?: string;
  positive?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const maxPrice = Number(sp.max ?? 5_000_000);
  const segment = (sp.segment as "CCR" | "RCR" | "OCR" | undefined) || undefined;
  const tenure = (sp.tenure as "freehold" | "leasehold" | undefined) || undefined;
  const mrtOp = (sp.mrtOp as "gte" | "lte" | "eq" | undefined) || undefined;
  const mrtVal = sp.mrtVal ? Number(sp.mrtVal) : undefined;
  const unitsOp = (sp.unitsOp as "gte" | "lte" | "eq" | undefined) || undefined;
  const unitsVal = sp.unitsVal ? Number(sp.unitsVal) : undefined;
  const psfOp = (sp.psfOp as "gte" | "lte" | "eq" | undefined) || undefined;
  const psfVal = sp.psfVal ? Number(sp.psfVal) : undefined;
  const ageOp = (sp.ageOp as "gte" | "lte" | "eq" | undefined) || undefined;
  const ageVal = sp.ageVal ? Number(sp.ageVal) : undefined;
  const query = (sp.q ?? "").trim();
  const unitType = (sp.type as "Studio" | "1BR" | "2BR" | "3BR" | "4BR+" | undefined) || undefined;
  const minYield = sp.minYield ? Number(sp.minYield) : undefined;
  const minCa = sp.minCa ? Number(sp.minCa) : undefined;
  const positiveOnly = sp.positive === "1";
  const sortKey = (sp.sort as SortKey) || "grossYieldPct";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page ?? 1));

  // Fetch full dataset from Next.js cache (1hr revalidate). Subsequent requests hit memory.
  const allRows = await getAllRanked();
  const profile = await getProfile();

  // Apply all filters in-memory — much faster than re-running SQL per navigation.
  const matchOp = (op: string | undefined, val: number | undefined, v: number | null) => {
    if (!op || val == null) return true;
    if (v == null) return false;
    if (op === "gte") return v >= val;
    if (op === "lte") return v <= val;
    return v === val;
  };
  const qLower = query.toLowerCase();
  const currentYear = new Date().getFullYear();
  const filtered = allRows.filter((r) => {
    if (segment && r.marketSegment !== segment) return false;
    if (tenure === "freehold" && !(/freehold/i.test(r.tenure ?? "") || /999/.test(r.tenure ?? ""))) return false;
    if (tenure === "leasehold" && !/99 yrs/i.test(r.tenure ?? "")) return false;
    if (unitType && r.unitType !== unitType) return false;
    if (!matchOp(mrtOp, mrtVal, r.mrtDistanceM)) return false;
    if (!matchOp(unitsOp, unitsVal, r.totalUnits)) return false;
    if (!matchOp(psfOp, psfVal, r.medianPsf)) return false;
    if (!matchOp(ageOp, ageVal, r.completionYear != null ? currentYear - r.completionYear : null)) return false;
    if (minYield != null && r.grossYieldPct < minYield) return false;
    if (minCa != null && (r.caScore == null || r.caScore < minCa)) return false;
    if (query) {
      if (!r.name.toLowerCase().includes(qLower)) return false;
    } else {
      if (r.medianPrice > maxPrice) return false;
    }
    return true;
  });

  const rowsWithRoi: Row[] = filtered
    .map((r) => {
      const roi = computeRoi({
        price: r.medianPrice,
        monthlyRent: r.medianRent,
        sqft: r.medianSqft || (r.medianPsf > 0 ? r.medianPrice / r.medianPsf : 1000),
        segment: r.marketSegment as "CCR" | "RCR" | "OCR" | null,
        tenure: r.tenure,
        cash: profile.cash,
        cpf: profile.cpf,
        age: profile.age,
        loanRatePct: profile.rate,
        vacancyMonthsPerYear: profile.vacancyMonths,
        rentalIncomeTaxPct: profile.includeTax ? profile.taxRate : 0,
      });
      const inBudget = r.medianPrice <= maxPrice;
      return { ...r, cashOnCashPct: roi.cashOnCashPct, inBudget };
    })
    .filter((r) => (positiveOnly ? r.cashOnCashPct >= 0 : true));

  const getVal = (r: Row, k: SortKey): number => {
    const v = r[k];
    return typeof v === "number" ? v : dir === "asc" ? Infinity : -Infinity;
  };
  rowsWithRoi.sort((a, b) => {
    const av = getVal(a, sortKey);
    const bv = getVal(b, sortKey);
    return dir === "asc" ? av - bv : bv - av;
  });

  const totalRows = rowsWithRoi.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rowsWithRoi.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const buildUrl = (overrides: Partial<SP>) => {
    const merged: SP = { ...sp, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== "") params.set(k, String(v));
    }
    return `/properties?${params.toString()}`;
  };

  const sortKeys: SortKey[] = [
    "medianPrice",
    "medianPsf",
    "medianRent",
    "grossYieldPct",
    "cashOnCashPct",
    "turnoverPct",
    "caScore",
  ];
  const sortUrls = Object.fromEntries(
    sortKeys.map((k) => {
      const nextDir: "asc" | "desc" = sortKey === k ? (dir === "desc" ? "asc" : "desc") : "desc";
      return [k, buildUrl({ sort: k, dir: nextDir, page: "1" })];
    })
  ) as Record<SortKey, string>;
  const prevUrl = currentPage > 1 ? buildUrl({ page: String(currentPage - 1) }) : null;
  const nextUrl = currentPage < totalPages ? buildUrl({ page: String(currentPage + 1) }) : null;

  return (
    <NavProvider>
      <RememberListUrl />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <BackButton fallback="/" />
          <div className="space-y-1 flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold">
            {query ? (
              <>Search: <span className="text-blue-700">&ldquo;{query}&rdquo;</span></>
            ) : (
              <>Projects up to {fmt(maxPrice)}</>
            )}
          </h1>
          <p className="text-sm text-gray-600">
            {query
              ? "Matches across all projects; out-of-budget results are greyed out."
              : "Min 3 sale txns (last 24mo) + 3 rental records."}
            <span className="ml-2 text-gray-400">· {totalRows} {totalRows === 1 ? "result" : "results"}</span>
          </p>
          <p className="text-xs text-gray-500">
            Cash ROI uses your saved profile: cash {fmt(profile.cash)}, CPF {fmt(profile.cpf)}, age {profile.age}, rate {profile.rate}%.
            <Link href="/" className="ml-2 text-blue-600 hover:underline">Edit</Link>
          </p>
          </div>
        </div>

        <FiltersBar
          defaults={{
            max: String(maxPrice),
            segment: segment ?? "",
            tenure: tenure ?? "",
            mrtOp: sp.mrtOp ?? "",
            mrtVal: sp.mrtVal ?? "",
            unitsOp: sp.unitsOp ?? "",
            unitsVal: sp.unitsVal ?? "",
            psfOp: sp.psfOp ?? "",
            psfVal: sp.psfVal ?? "",
            ageOp: sp.ageOp ?? "",
            ageVal: sp.ageVal ?? "",
            q: query,
            type: unitType ?? "",
            minYield: sp.minYield ?? "",
            minCa: sp.minCa ?? "",
            positive: positiveOnly ? "1" : "",
          }}
        />

        <ResultsOverlay>
          {pageRows.length === 0 ? (
            <p className="text-gray-500 mt-10">
              {query ? `No projects match "${query}".` : "No projects match these filters."}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Table: shown on wide screens OR when device is in landscape. */}
              <div className="hidden landscape:block md:block">
                <PropertiesTable rows={pageRows} sortKey={sortKey} dir={dir} sortUrls={sortUrls} />
              </div>
              {/* Cards: shown only on narrow + portrait (mobile phone held upright). */}
              <div className="landscape:hidden md:hidden">
                <PropertiesCardList rows={pageRows} />
              </div>
              {totalPages > 1 && (
                <Pagination currentPage={currentPage} totalPages={totalPages} prevUrl={prevUrl} nextUrl={nextUrl} />
              )}
            </div>
          )}
        </ResultsOverlay>
      </main>
    </NavProvider>
  );
}
