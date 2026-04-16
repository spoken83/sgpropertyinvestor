"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader, Chip } from "@heroui/react";
import { MapPin, Buildings, Calendar, Users } from "@phosphor-icons/react/dist/ssr";
import RoiCalculator from "./RoiCalculator";
import BackButton from "@/components/BackButton";
import ExpandableHistory from "./ExpandableHistory";
import type { ProjectDetail } from "@/lib/projectDetail";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

const fmtN = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : n.toLocaleString("en-SG", { maximumFractionDigits: d });

type Props = {
  project: ProjectDetail;
  type: string | undefined;
  analysisPrice: number | null;
  analysisRent: number | null;
  analysisSqft: number;
  outOfBudget: boolean;
  affMaxPrice: number;
  profileCash: number;
  profileCpf: number;
  profileAge: number;
  profileRate: number;
};

export default function PropertyDetailView({
  project: p,
  type,
  analysisPrice,
  analysisRent,
  analysisSqft,
  outOfBudget,
  affMaxPrice,
  profileCash,
  profileCpf,
  profileAge,
  profileRate,
}: Props) {
  const typeRow = type ? p.byUnitType.find((u) => u.unitType === type) : undefined;

  return (
    <main className={`max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5 ${outOfBudget ? "opacity-80" : ""}`}>
      <BackButton fallback="/properties" />

      {outOfBudget && (
        <Card className="border-warning-200 bg-warning-50">
          <CardBody className="text-warning-800 text-sm space-y-1">
            <div className="font-semibold">Outside your current budget</div>
            <div>
              {typeRow ? `${type} median` : "Median"} price {fmt(analysisPrice)} exceeds your max affordable price{" "}
              <span className="font-semibold">{fmt(affMaxPrice)}</span> (cash {fmt(profileCash)}, CPF {fmt(profileCpf)}, age {profileAge}, rate {profileRate}%).
              <Link href="/" className="ml-1 text-primary-600 hover:underline">Edit profile</Link>
            </div>
          </CardBody>
        </Card>
      )}

      {p.byUnitType.length > 0 && (
        <Card className="border-primary-200 bg-primary-50/60">
          <CardBody className="flex-row items-center justify-between flex-wrap gap-3 text-sm">
            <div className="text-primary-900">
              {typeRow ? (
                <>Analysing <span className="font-semibold">{type}</span> units ({typeRow.txnCount} sales · {typeRow.rentalCount} rentals).</>
              ) : (
                <>Analysing <span className="font-semibold">all unit types</span> · pick a type below to drill in.</>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {p.byUnitType.map((u) => (
                <Link key={u.unitType} href={`?type=${encodeURIComponent(u.unitType)}`}>
                  <Chip
                    size="sm"
                    variant={u.unitType === type ? "solid" : "bordered"}
                    color="primary"
                    className="cursor-pointer"
                  >
                    {u.unitType}
                  </Chip>
                </Link>
              ))}
              <Link href={`/properties/${p.id}`}>
                <Chip
                  size="sm"
                  variant={!type ? "solid" : "bordered"}
                  color="primary"
                  className="cursor-pointer"
                >
                  Overall
                </Chip>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      <header className="space-y-3">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">{p.name}</h1>
        <div className="flex items-center gap-2 text-default-600 flex-wrap">
          <MapPin className="w-4 h-4" />
          <span>{p.street}</span>
          <span className="text-default-300">·</span>
          <span>District {p.postalDistrict}</span>
          {p.marketSegment && (
            <>
              <span className="text-default-300">·</span>
              <Chip size="sm" variant="flat" color="primary">{p.marketSegment}</Chip>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap text-tiny text-default-500">
          {p.tenure && <Chip size="sm" variant="flat">{p.tenure}</Chip>}
          {p.completionYear && (
            <Chip size="sm" variant="flat" startContent={<Calendar className="w-3 h-3" />}>
              Built {p.completionYear} · {new Date().getFullYear() - p.completionYear} yrs
            </Chip>
          )}
          {p.totalUnits && (
            <Chip size="sm" variant="flat" startContent={<Users className="w-3 h-3" />}>
              {p.totalUnits} units
            </Chip>
          )}
          {p.nearestMrt && (
            <Chip size="sm" variant="flat" startContent={<MapPin className="w-3 h-3" />}>
              {p.nearestMrt} · {p.mrtDistanceM}m
            </Chip>
          )}
          {p.developerName && (
            <Chip size="sm" variant="flat" startContent={<Buildings className="w-3 h-3" weight="duotone" />}>
              {p.developerName}
            </Chip>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label={typeRow ? `${type} median price` : "Median price (24mo)"}
          value={fmt(typeRow ? typeRow.medianPrice : p.medianPrice)}
        />
        <Stat
          label={typeRow ? `${type} median PSF` : "Median PSF"}
          value={(typeRow ? typeRow.medianPsf : p.medianPsf) ? `$${fmtN(typeRow ? typeRow.medianPsf : p.medianPsf)}` : "—"}
        />
        <Stat
          label={typeRow ? `${type} median rent` : "Median rent"}
          value={fmt(typeRow ? typeRow.medianRent : p.medianRent)}
        />
        <Stat
          label={typeRow ? `${type} gross yield` : "Gross yield"}
          value={
            (typeRow ? typeRow.grossYieldPct : p.grossYieldPct)
              ? `${(typeRow ? typeRow.grossYieldPct! : p.grossYieldPct!).toFixed(2)}%`
              : "—"
          }
          emphasize
        />
        <Stat
          label={typeRow ? `${type} sale txns (24mo)` : "Sale txns (24mo)"}
          value={String(typeRow ? typeRow.txnCount : p.txnCount)}
        />
        <Stat
          label={typeRow ? `${type} rental contracts` : "Rental contracts"}
          value={String(typeRow ? typeRow.rentalCount : p.rentalCount)}
        />
        <Stat label="Rentals / year (project)" value={fmtN(p.rentalsPerYear, 1)} />
      </section>

      <Card className="border border-default-200" shadow="sm">
        <CardHeader className="font-semibold">By unit type</CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 tabular-nums">
            <thead className="border-b border-default-200 text-left text-tiny uppercase tracking-wider text-default-500">
              <tr>
                <th>Type</th>
                <th className="text-right">Median price</th>
                <th className="text-right">Median PSF</th>
                <th className="text-right">Median rent</th>
                <th className="text-right">Gross yield</th>
                <th className="text-right">Txns</th>
                <th className="text-right">Rentals</th>
              </tr>
            </thead>
            <tbody>
              {p.byUnitType.map((r) => (
                <tr key={r.unitType} className="border-b border-default-100 last:border-0">
                  <td className="font-medium">{r.unitType}</td>
                  <td className="text-right">{fmt(r.medianPrice)}</td>
                  <td className="text-right">{r.medianPsf ? `$${fmtN(r.medianPsf)}` : "—"}</td>
                  <td className="text-right">{fmt(r.medianRent)}</td>
                  <td className="text-right font-semibold">{r.grossYieldPct ? `${r.grossYieldPct.toFixed(2)}%` : "—"}</td>
                  <td className="text-right text-tiny text-default-500">{r.txnCount}</td>
                  <td className="text-right text-tiny text-default-500">{r.rentalCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {analysisPrice && analysisRent && (
        <RoiCalculator
          price={analysisPrice}
          monthlyRent={analysisRent}
          sqft={analysisSqft}
          segment={p.marketSegment as "CCR" | "RCR" | "OCR" | null}
          tenure={p.tenure}
          propertyType={p.recentTxns[0]?.propertyType ?? null}
        />
      )}

      <section className="grid md:grid-cols-2 gap-4">
        <ExpandableHistory title="Recent sales" total={p.recentTxns.length}>
          {(limit) => (
            <table className="w-full text-xs [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-1.5 tabular-nums">
              <thead className="border-b border-default-200 text-left text-tiny text-default-500 uppercase tracking-wider">
                <tr>
                  <th>Date</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Sqft</th>
                  <th className="text-right">PSF</th>
                  <th className="text-right">Floor</th>
                </tr>
              </thead>
              <tbody>
                {p.recentTxns.slice(0, limit).map((t, i) => (
                  <tr key={i} className="border-b border-default-100 last:border-0">
                    <td>{t.contractDate}</td>
                    <td className="text-right">{fmt(t.price)}</td>
                    <td className="text-right">{fmtN(t.sqft)}</td>
                    <td className="text-right">${fmtN(t.psf)}</td>
                    <td className="text-right">{t.floorRange ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ExpandableHistory>
        <ExpandableHistory title="Recent rentals" total={p.recentRentals.length}>
          {(limit) => (
            <table className="w-full text-xs [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-1.5 tabular-nums">
              <thead className="border-b border-default-200 text-left text-tiny text-default-500 uppercase tracking-wider">
                <tr>
                  <th>Date</th>
                  <th className="text-right">Rent</th>
                  <th className="text-right">Sqft</th>
                  <th className="text-right">BR</th>
                </tr>
              </thead>
              <tbody>
                {p.recentRentals.slice(0, limit).map((r, i) => (
                  <tr key={i} className="border-b border-default-100 last:border-0">
                    <td>{r.leaseDate}</td>
                    <td className="text-right">{fmt(r.rent)}</td>
                    <td className="text-right">{r.sqft ? fmtN(r.sqft) : "—"}</td>
                    <td className="text-right">{r.bedrooms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ExpandableHistory>
      </section>
    </main>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <Card shadow="sm" className="border border-default-200">
      <CardBody className="gap-1">
        <div className="text-tiny text-default-500 uppercase tracking-wide">{label}</div>
        <div className={`${emphasize ? "text-2xl font-bold text-primary-700" : "text-base font-semibold"} tabular-nums`}>{value}</div>
      </CardBody>
    </Card>
  );
}
