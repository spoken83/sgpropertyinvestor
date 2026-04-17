"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Card, CardBody, CardHeader, Chip } from "@heroui/react";
import { TrendUp, TrendDown, Minus, Info } from "@phosphor-icons/react/dist/ssr";
import type { CaMetrics } from "@/lib/projectDetail";

type Props = {
  ca: CaMetrics | undefined;
  // Label for what the user is looking at — e.g. "2BR" or "Overall".
  viewLabel: string;
};

const PRIMARY = "#6366F1"; // indigo-500
const PEER = "#9CA3AF"; // gray-400
const BAND = "#6366F1";

const fmtPsf = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `$${n.toLocaleString("en-SG", { maximumFractionDigits: 0 })}`;

const pctFmt = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

// "2025-Q4" + 4 → "2026-Q4"
function addQuarters(label: string, steps: number): string {
  const [y, q] = label.split("-Q").map(Number);
  const idx = y * 4 + (q - 1) + steps;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}

function scoreBadgeColor(score: number | null): "success" | "warning" | "danger" | "default" {
  if (score == null) return "default";
  if (score >= 65) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

function verbalHint(m: CaMetrics): string {
  const parts: string[] = [];
  if (m.momentumPctYr != null) {
    if (m.momentumPctYr >= 4) parts.push("rising momentum");
    else if (m.momentumPctYr <= -2) parts.push("falling momentum");
    else parts.push("flat momentum");
  }
  if (m.peerSpreadPct != null) {
    if (m.peerSpreadPct <= -10) parts.push("discount to 1km peers");
    else if (m.peerSpreadPct >= 10) parts.push("premium vs peers");
    else parts.push("in line with peers");
  }
  return parts.length ? parts.join(" · ") : "limited signal";
}

export default function CapitalAppreciation({ ca, viewLabel }: Props) {
  if (!ca || ca.trendSeries.length < 3) {
    return (
      <Card className="border border-default-200" shadow="sm">
        <CardHeader className="font-semibold flex items-center gap-2">
          Capital appreciation
          <Chip size="sm" variant="flat">
            {viewLabel}
          </Chip>
        </CardHeader>
        <CardBody className="text-sm text-default-500">
          Not enough recent transactions to estimate a trend for this unit type. Try the Overall view
          or a different unit-type.
        </CardBody>
      </Card>
    );
  }

  // Build chart data: historical rows + 4 forecast rows.
  // History: subjectPsf (and peerPsf for matching quarter).
  // Forecast: range = [low, high] and forecastMid, linearly interpolated from
  // the last historical quarter forward.
  const peerByQ = new Map(ca.peerSeries.map((p) => [p.q, p.psf]));

  const lastTrend = ca.trendSeries[ca.trendSeries.length - 1];
  const currentPsf = ca.currentPsf ?? lastTrend.psf;
  const fMid = ca.forecastMidPsf ?? currentPsf;
  const fLow = ca.forecastLowPsf ?? currentPsf;
  const fHigh = ca.forecastHighPsf ?? currentPsf;

  type Row = {
    q: string;
    subjectPsf?: number;
    peerPsf?: number;
    forecastMid?: number;
    range?: [number, number];
  };

  const rows: Row[] = ca.trendSeries.map((p) => ({
    q: p.q,
    subjectPsf: p.psf,
    peerPsf: peerByQ.get(p.q),
  }));

  // Anchor point so the forecast cone starts from the most recent PSF (zero width there).
  rows[rows.length - 1] = {
    ...rows[rows.length - 1],
    range: [currentPsf, currentPsf],
    forecastMid: currentPsf,
  };

  for (let i = 1; i <= 4; i++) {
    const fraction = i / 4;
    const low = currentPsf + (fLow - currentPsf) * fraction;
    const high = currentPsf + (fHigh - currentPsf) * fraction;
    const mid = currentPsf + (fMid - currentPsf) * fraction;
    rows.push({
      q: addQuarters(lastTrend.q, i),
      range: [low, high],
      forecastMid: mid,
    });
  }

  const sparseXTicks = rows.filter((_, i) => i % 4 === 0).map((r) => r.q);

  return (
    <Card className="border border-default-200" shadow="sm">
      <CardHeader className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 font-semibold">
          Capital appreciation
          <Chip size="sm" variant="flat">
            {viewLabel}
          </Chip>
        </div>
        {ca.caScore != null && (
          <div className="flex items-center gap-2">
            <Chip size="lg" color={scoreBadgeColor(ca.caScore)} variant="flat">
              CA Score · {ca.caScore.toFixed(0)}
            </Chip>
            <span className="text-tiny text-default-500 hidden sm:inline">{verbalHint(ca)}</span>
          </div>
        )}
      </CardHeader>
      <CardBody className="gap-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile
            label="Momentum"
            value={pctFmt(ca.momentumPctYr)}
            direction={ca.momentumPctYr}
            tip="Recency-weighted slope of this project's quarterly median PSF over the last 5 years, annualised."
          />
          <Tile
            label="vs 1km peers"
            sublabel="lease-adjusted"
            value={pctFmt(ca.peerSpreadPct)}
            direction={ca.peerSpreadPct == null ? null : -ca.peerSpreadPct}
            tip={`FH-equivalent PSF of this project vs distance-weighted median of ${
              ca.peerCount ?? 0
            } private projects within ${ca.peerRadiusM ?? 0}m, each normalised by remaining lease (Bala's Table). Negative = cheaper than neighbours after tenure adjustment.`}
          />
          <Tile
            label="Volume / yr"
            value={
              ca.volumeTxnsYr != null
                ? ca.volumeTxnsYr.toLocaleString("en-SG", { maximumFractionDigits: 1 })
                : "—"
            }
            direction={ca.volumeTxnsYr}
            tip="Average sale transactions per year over the last 2 years. Higher = more liquid, easier to exit."
          />
          <Tile
            label="Volatility"
            value={pctFmt(ca.volatilityPct, 1)}
            direction={ca.volatilityPct == null ? null : -ca.volatilityPct}
            tip="Standard deviation of quarterly medians around the trend line, as % of mean PSF. Lower = more predictable."
          />
          <Tile
            label="Lease decay"
            sublabel={
              ca.leaseYearsRemaining != null
                ? ca.leaseYearsRemaining >= 99
                  ? "freehold / 999yr"
                  : `${ca.leaseYearsRemaining} yrs left`
                : "unknown"
            }
            value={
              ca.leaseDecayPctYr == null || ca.leaseYearsRemaining == null
                ? "—"
                : ca.leaseYearsRemaining >= 99
                ? "0%/yr"
                : `${ca.leaseDecayPctYr.toFixed(2)}%/yr`
            }
            direction={
              ca.leaseDecayPctYr == null
                ? null
                : ca.leaseDecayPctYr >= -0.05
                ? 0
                : ca.leaseDecayPctYr
            }
            tip="Expected annual value loss from lease burn alone, from Bala's Table at current years remaining. Not included in CA Score — shown separately as structural headwind."
          />
        </div>

        <div className="h-72 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="q"
                ticks={sparseXTicks}
                tick={{ fontSize: 11 }}
                stroke="#9CA3AF"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `$${v}`}
                stroke="#9CA3AF"
                width={58}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "range" && Array.isArray(value)) {
                    const [lo, hi] = value as [number, number];
                    return [`${fmtPsf(lo)} – ${fmtPsf(hi)}`, "Forecast band"];
                  }
                  return [fmtPsf(value as number), labelFor(name as string)];
                }}
                labelClassName="font-semibold"
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(v) => labelFor(v as string)}
                iconType="line"
              />
              <Area
                dataKey="range"
                stroke="none"
                fill={BAND}
                fillOpacity={0.14}
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                dataKey="peerPsf"
                stroke={PEER}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="subjectPsf"
                stroke={PRIMARY}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="forecastMid"
                stroke={PRIMARY}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="text-xs text-default-500 grid sm:grid-cols-2 gap-x-6 gap-y-1">
          <div>
            <span className="font-medium text-default-700">Projected PSF in 12 months:</span>{" "}
            {fmtPsf(ca.forecastLowPsf)} – {fmtPsf(ca.forecastHighPsf)}{" "}
            <span className="text-default-400">(90% band)</span>
          </div>
          <div>
            <span className="font-medium text-default-700">Peer cohort:</span>{" "}
            {ca.peerCount ?? 0} projects within {ca.peerRadiusM ?? 0}m, distance-weighted.
          </div>
        </div>
        <p className="text-tiny text-default-400 leading-relaxed">
          Continuation of the last 5-year PSF trend if conditions hold. Not a forecast; wider bands
          mean the trend is noisier and less reliable. Peer comparison includes all private
          residential within the radius — no tenure normalisation.
        </p>
      </CardBody>
    </Card>
  );
}

function labelFor(dataKey: string): string {
  switch (dataKey) {
    case "subjectPsf":
      return "This project";
    case "peerPsf":
      return "1km peers";
    case "forecastMid":
      return "Forecast (mid)";
    case "range":
      return "Forecast band";
    default:
      return dataKey;
  }
}

function Tile({
  label,
  sublabel,
  value,
  tip,
  direction,
}: {
  label: string;
  sublabel?: string;
  value: string;
  tip: string;
  direction: number | null | undefined;
}) {
  const icon =
    direction == null
      ? <Minus className="w-3.5 h-3.5 text-default-400" />
      : direction > 0.2
      ? <TrendUp className="w-3.5 h-3.5 text-success-600" weight="bold" />
      : direction < -0.2
      ? <TrendDown className="w-3.5 h-3.5 text-danger-600" weight="bold" />
      : <Minus className="w-3.5 h-3.5 text-default-400" />;
  return (
    <div className="rounded-lg border border-default-200 p-3 bg-default-50/40">
      <div className="flex items-center gap-1 text-tiny text-default-500 uppercase tracking-wide">
        {label}
        <span title={tip} className="cursor-help text-default-400">
          <Info className="w-3 h-3" />
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 font-semibold text-base tabular-nums">
        {icon}
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] text-default-400 mt-0.5 truncate" title={sublabel}>
          {sublabel}
        </div>
      )}
    </div>
  );
}
