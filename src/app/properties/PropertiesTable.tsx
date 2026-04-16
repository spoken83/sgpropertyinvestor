"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, Chip } from "@heroui/react";
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

const segmentColor = (s: string | null): "primary" | "secondary" | "default" => {
  if (s === "CCR") return "primary";
  if (s === "RCR") return "secondary";
  return "default";
};

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
    <Card shadow="sm" className="border border-default-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            {/* Project-side */}
            <col className="w-[20%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            {/* Unit-side */}
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead>
            <tr className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-default-200 text-tiny uppercase tracking-wider text-default-500 font-medium">
              <th className="px-3 py-2.5 text-left bg-default-50">Project</th>
              <th className="px-2 py-2.5 text-left bg-default-50">Tenure</th>
              <th className="px-2 py-2.5 text-right bg-default-50" title="Total units in the development">Units</th>
              <th className="px-2 py-2.5 text-right bg-default-50" title="Temporary Occupation Permit (TOP) year and age in years.">TOP</th>
              <th className="px-2 py-2.5 text-left bg-default-50 border-r border-default-200">MRT</th>
              <th className="px-2 py-2.5 text-left bg-content1">Type</th>
              <SortHeader k="medianPrice" label="Price" active={sortKey} dir={dir} sortUrls={sortUrls} />
              <SortHeader k="medianPsf" label="PSF" active={sortKey} dir={dir} sortUrls={sortUrls} />
              <SortHeader k="medianRent" label="Rent" active={sortKey} dir={dir} sortUrls={sortUrls} />
              <SortHeader k="grossYieldPct" label="Gross yield" active={sortKey} dir={dir} sortUrls={sortUrls} tip="Annual rent ÷ price" />
              <SortHeader k="cashOnCashPct" label="Cash ROI" active={sortKey} dir={dir} sortUrls={sortUrls} tip="Annual cash flow ÷ cash put down. Uses your saved profile." />
              <SortHeader k="turnoverPct" label="Activity" active={sortKey} dir={dir} sortUrls={sortUrls} tip="Project rentals/yr ÷ total units. Higher = stronger demand. Shown as ~N/yr when units unknown." />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <motion.tr
                key={`${r.id}-${r.unitType}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: r.inBudget ? 1 : 0.4, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(idx, 12) * 0.012 }}
                className="border-b border-default-100 last:border-0 hover:bg-default-50/60 transition-colors"
                title={!r.inBudget ? "Outside your current price band" : undefined}
              >
                <td className="px-3 py-3 bg-default-50/40">
                  <Link
                    href={`/properties/${r.id}?type=${encodeURIComponent(r.unitType)}`}
                    className="font-medium text-primary-700 hover:text-primary-900 hover:underline block truncate"
                    title={r.name}
                  >
                    {r.name}
                  </Link>
                  <div className="text-tiny text-default-500 flex items-center gap-1.5 mt-0.5">
                    <span className="truncate" title={r.street ?? undefined}>{r.street}</span>
                    {r.marketSegment && (
                      <Chip size="sm" variant="flat" color={segmentColor(r.marketSegment)} className="text-[10px] h-4 px-1.5 flex-shrink-0">
                        {r.marketSegment}
                      </Chip>
                    )}
                  </div>
                </td>
                <td className="px-2 py-3 bg-default-50/40 text-tiny text-default-700 truncate" title={r.tenure ?? undefined}>
                  {shortTenure(r.tenure)}
                </td>
                <td className="px-2 py-3 bg-default-50/40 text-right tabular-nums text-tiny text-default-700">
                  {r.totalUnits ?? <span className="text-default-300">—</span>}
                </td>
                <td className="px-2 py-3 bg-default-50/40 text-right tabular-nums text-tiny">
                  {r.completionYear != null ? (
                    <>
                      <div className="text-default-700">{r.completionYear}</div>
                      <div className="text-default-400 text-[10px]">{new Date().getFullYear() - r.completionYear}y</div>
                    </>
                  ) : (
                    <span className="text-default-300">—</span>
                  )}
                </td>
                <td className="px-2 py-3 bg-default-50/40 text-tiny truncate border-r border-default-100" title={`${r.nearestMrt} · ${r.mrtDistanceM}m`}>
                  <div className="truncate text-default-700">{r.nearestMrt}</div>
                  {r.mrtDistanceM != null && <div className="text-default-400 text-[10px]">{r.mrtDistanceM}m</div>}
                </td>
                <td className="px-2 py-3">
                  <Chip size="sm" variant="flat" className="text-[11px] h-5">{r.unitType}</Chip>
                </td>
                <td className="px-2 py-3 text-right tabular-nums font-medium">{fmt(r.medianPrice)}</td>
                <td className="px-2 py-3 text-right tabular-nums text-default-700">${r.medianPsf.toFixed(0)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{fmt(r.medianRent)}</td>
                <td className="px-2 py-3 text-right tabular-nums font-semibold">{r.grossYieldPct.toFixed(2)}%</td>
                <td className={`px-2 py-3 text-right tabular-nums font-semibold ${r.cashOnCashPct >= 0 ? "text-success-700" : "text-danger-600"}`}>
                  {r.cashOnCashPct >= 0 ? "+" : ""}{r.cashOnCashPct.toFixed(1)}%
                </td>
                <td
                  className="px-2 py-3 text-right tabular-nums text-tiny text-default-600"
                  title={`Project rentals/yr: ${r.projectRentalsPerYear.toFixed(1)}${r.totalUnits ? ` · ${r.totalUnits} units` : " · no unit count"}`}
                >
                  {r.turnoverPct != null ? `${r.turnoverPct.toFixed(1)}%` : (
                    <span className="text-default-400">~{r.rentalsPerYear.toFixed(0)}/y</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
    <th className="px-2 py-2.5 text-right bg-content1" title={tip}>
      <button
        type="button"
        onClick={() => go(sortUrls[k])}
        title={tip}
        className={`inline-flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors ${isActive ? "text-foreground font-semibold" : ""}`}
      >
        {label}
        <span className="text-[10px] w-2 text-primary-600">{isActive ? (dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}
