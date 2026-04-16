"use client";

import Link from "next/link";
import { useNav } from "./NavContext";

const fmt = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

function shortTenure(t: string | null): string {
  if (!t) return "—";
  if (/freehold/i.test(t)) return "Freehold";
  const m = t.match(/(\d+)\s*yrs?.*?(\d{4})?/i);
  if (m) return m[2] ? `${m[1]}yr · ${m[2]}` : `${m[1]}yr`;
  return t;
}

export type Row = {
  id: number;
  name: string;
  street: string | null;
  marketSegment: string | null;
  tenure: string | null;
  nearestMrt: string | null;
  mrtDistanceM: number | null;
  unitType: "Studio" | "1BR" | "2BR" | "3BR" | "4BR+";
  medianPrice: number;
  medianPsf: number;
  medianRent: number;
  medianSqft: number;
  grossYieldPct: number;
  cashOnCashPct: number;
  rentalsPerYear: number;
  projectRentalsPerYear: number;
  turnoverPct: number | null;
  totalUnits: number | null;
  completionYear: number | null;
  inBudget: boolean;
};

export type SortKey =
  | "medianPrice"
  | "medianPsf"
  | "medianRent"
  | "grossYieldPct"
  | "cashOnCashPct"
  | "turnoverPct";

// Project-side cells get a subtle slate tint; unit-side cells default white.
const projCell = "bg-slate-50/70";
const projHead = "bg-slate-100";

export default function PropertiesTable({
  rows,
  sortKey,
  dir,
  sortUrls,
}: {
  rows: Row[];
  sortKey: SortKey;
  dir: "asc" | "desc";
  sortUrls: Record<SortKey, string>;
}) {
  return (
    <div className="border rounded">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          {/* Project-side */}
          <col className="w-[17%]" />
          <col className="w-[9%]" />
          <col className="w-[5%]" />
          <col className="w-[5%]" />
          <col className="w-[10%]" />
          {/* Unit-side */}
          <col className="w-[5%]" />
          <col className="w-[9%]" />
          <col className="w-[6%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[9%]" />
        </colgroup>
        <thead className="text-left text-xs uppercase tracking-wider text-gray-600 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b">
          <tr>
            <th className={`px-3 py-2 ${projHead}`}>Project</th>
            <th className={`px-2 py-2 ${projHead}`}>Tenure</th>
            <th className={`px-2 py-2 text-right ${projHead}`} title="Total units in the development">No. units</th>
            <th className={`px-2 py-2 text-right ${projHead}`} title="Temporary Occupation Permit (TOP) year and age in years. Blank when unknown.">TOP / Age</th>
            <th className={`px-2 py-2 ${projHead} border-r`}>MRT</th>
            <th className="px-2 py-2 bg-white">Type</th>
            <SortHeader k="medianPrice" label="Median price" active={sortKey} dir={dir} sortUrls={sortUrls} />
            <SortHeader k="medianPsf" label="PSF" active={sortKey} dir={dir} sortUrls={sortUrls} />
            <SortHeader k="medianRent" label="Median rent" active={sortKey} dir={dir} sortUrls={sortUrls} />
            <SortHeader k="grossYieldPct" label="Gross yield" active={sortKey} dir={dir} sortUrls={sortUrls} tip="Annual rent ÷ price" />
            <SortHeader k="cashOnCashPct" label="Cash ROI" active={sortKey} dir={dir} sortUrls={sortUrls} tip="Cash-on-cash ROI: annual cash flow ÷ cash put down. Uses your saved profile." />
            <SortHeader
              k="turnoverPct"
              label="Rental Activity"
              active={sortKey}
              dir={dir}
              sortUrls={sortUrls}
              tip="Share of the project's units leased per year (project rentals/yr ÷ total units). Higher = stronger rental demand or shorter leases. Shown as ~N/yr when unit count is unknown."
            />
          </tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-3 [&_td]:align-top">
          {rows.map((r) => (
            <tr
              key={`${r.id}-${r.unitType}`}
              className={`border-t hover:bg-blue-50/40 ${!r.inBudget ? "opacity-40" : ""}`}
              title={!r.inBudget ? "Outside your current price band" : undefined}
            >
              <td className={`!px-3 ${projCell}`}>
                <Link
                  href={`/properties/${r.id}?type=${encodeURIComponent(r.unitType)}`}
                  className="font-medium text-blue-700 hover:underline block truncate"
                  title={r.name}
                >
                  {r.name}
                </Link>
                <div className="text-xs text-gray-500 truncate" title={r.street ?? undefined}>
                  {r.street}
                  {r.marketSegment && <span className="ml-1 text-gray-400">({r.marketSegment})</span>}
                </div>
              </td>
              <td className={`text-xs truncate ${projCell}`} title={r.tenure ?? undefined}>
                {shortTenure(r.tenure)}
              </td>
              <td className={`text-right tabular-nums text-xs text-gray-700 ${projCell}`}>
                {r.totalUnits ?? "—"}
              </td>
              <td className={`text-right tabular-nums text-xs ${projCell}`}>
                {r.completionYear != null ? (
                  <>
                    <div className="text-gray-700">{r.completionYear}</div>
                    <div className="text-gray-400">{new Date().getFullYear() - r.completionYear} yrs</div>
                  </>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td
                className={`text-xs truncate ${projCell} border-r`}
                title={`${r.nearestMrt} · ${r.mrtDistanceM}m`}
              >
                <div className="truncate">{r.nearestMrt}</div>
                {r.mrtDistanceM != null && <div className="text-gray-400">{r.mrtDistanceM}m</div>}
              </td>
              <td className="text-xs font-medium">{r.unitType}</td>
              <td className="text-right tabular-nums">{fmt(r.medianPrice)}</td>
              <td className="text-right tabular-nums">${r.medianPsf.toFixed(0)}</td>
              <td className="text-right tabular-nums">{fmt(r.medianRent)}</td>
              <td className="text-right tabular-nums font-semibold">{r.grossYieldPct.toFixed(2)}%</td>
              <td className={`text-right tabular-nums font-semibold ${r.cashOnCashPct >= 0 ? "text-green-700" : "text-red-700"}`}>
                {r.cashOnCashPct.toFixed(1)}%
              </td>
              <td
                className="text-right tabular-nums text-xs text-gray-600"
                title={`Project rentals/yr: ${r.projectRentalsPerYear.toFixed(1)}${r.totalUnits ? ` · ${r.totalUnits} units` : " · no unit count"}`}
              >
                {r.turnoverPct != null ? `${r.turnoverPct.toFixed(1)}%` : `~${r.rentalsPerYear.toFixed(0)}/yr`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  k,
  label,
  active,
  dir,
  sortUrls,
  tip,
}: {
  k: SortKey;
  label: string;
  active: SortKey;
  dir: "asc" | "desc";
  sortUrls: Record<SortKey, string>;
  tip?: string;
}) {
  const isActive = active === k;
  const { go } = useNav();
  return (
    <th className="px-2 py-2 text-right bg-white" title={tip}>
      <button
        type="button"
        onClick={() => go(sortUrls[k])}
        title={tip}
        className={`inline-flex items-center gap-1 hover:text-black cursor-pointer ${isActive ? "text-black" : ""}`}
      >
        {label}
        <span className="text-[10px] w-2">{isActive ? (dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}
