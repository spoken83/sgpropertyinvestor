"use client";

import Link from "next/link";
import { Card, CardBody, Chip } from "@heroui/react";
import { motion } from "framer-motion";
import type { Row } from "./PropertiesTable";

const fmt = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

function shortTenure(t: string | null): string {
  if (!t) return "—";
  if (/freehold/i.test(t)) return "Freehold";
  const m = t.match(/(\d+)\s*yrs?.*?(\d{4})?/i);
  if (m) return m[2] ? `${m[1]}yr · ${m[2]}` : `${m[1]}yr`;
  return t;
}

const segmentColor = (s: string | null): "primary" | "secondary" | "default" => {
  if (s === "CCR") return "primary";
  if (s === "RCR") return "secondary";
  return "default";
};

function caChipColor(score: number | null): "success" | "warning" | "danger" | "default" {
  if (score == null) return "default";
  if (score >= 55) return "success";
  if (score >= 30) return "warning";
  return "danger";
}

export default function PropertiesCardList({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r, idx) => (
        <motion.div
          key={`${r.id}-${r.unitType}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: r.inBudget ? 1 : 0.55, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(idx, 8) * 0.015 }}
        >
          <Card shadow="sm" className="border border-default-200">
            <CardBody className="gap-2">
              <Link
                href={`/properties/${r.id}?type=${encodeURIComponent(r.unitType)}`}
                className="block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-primary-700 truncate">{r.name}</div>
                    <div className="text-tiny text-default-500 truncate mt-0.5">
                      {r.street}
                      {r.marketSegment && (
                        <Chip
                          size="sm"
                          variant="flat"
                          color={segmentColor(r.marketSegment)}
                          className="ml-1.5 text-[10px] h-4 px-1.5"
                        >
                          {r.marketSegment}
                        </Chip>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className={`text-base font-bold tabular-nums ${r.cashOnCashPct >= 0 ? "text-success-700" : "text-danger-600"}`}>
                        {r.cashOnCashPct >= 0 ? "+" : ""}{r.cashOnCashPct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-default-500 uppercase tracking-wide">Cash ROI</div>
                    </div>
                    <div className="text-right border-l border-default-200 pl-3 flex flex-col items-end gap-0.5">
                      <Chip size="sm" variant="flat" color={caChipColor(r.caScore)} className="text-[11px] font-bold tabular-nums">
                        {r.caScore != null ? r.caScore.toFixed(0) : "—"}
                      </Chip>
                      <div className="text-[10px] text-default-500 uppercase tracking-wide">CA</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Chip size="sm" variant="flat" className="text-[11px] h-5">{r.unitType}</Chip>
                  <Chip size="sm" variant="flat" className="text-[11px] h-5">{shortTenure(r.tenure)}</Chip>
                  {r.completionYear != null && (
                    <Chip size="sm" variant="flat" className="text-[11px] h-5">
                      {r.completionYear} · {new Date().getFullYear() - r.completionYear}y
                    </Chip>
                  )}
                  {r.totalUnits != null && (
                    <Chip size="sm" variant="flat" className="text-[11px] h-5">
                      {r.totalUnits} units
                    </Chip>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-default-100">
                  <Metric label="Price" value={fmt(r.medianPrice)} />
                  <Metric label="PSF" value={`$${r.medianPsf.toFixed(0)}`} />
                  <Metric label="Rent/mo" value={fmt(r.medianRent)} />
                  <Metric
                    label="MRT"
                    value={r.nearestMrt ? `${r.mrtDistanceM}m` : "—"}
                    sub={r.nearestMrt ?? undefined}
                  />
                  <Metric
                    label="Activity"
                    value={r.turnoverPct != null ? `${r.turnoverPct.toFixed(1)}%` : `~${r.rentalsPerYear.toFixed(0)}/y`}
                  />
                  <Metric label="Yield" value={`${r.grossYieldPct.toFixed(2)}%`} />
                </div>
              </Link>
            </CardBody>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-success-700" : tone === "bad" ? "text-danger-600" : "";
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-default-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums truncate ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-default-400 truncate">{sub}</div>}
    </div>
  );
}
