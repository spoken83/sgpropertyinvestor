import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectDetail } from "@/lib/projectDetail";
import { getProfile } from "@/lib/profile";
import { computeAffordability } from "@/lib/affordability";
import RoiCalculator from "./RoiCalculator";
import BackLink from "@/components/BackLink";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

const fmtN = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : n.toLocaleString("en-SG", { maximumFractionDigits: d });

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const p = await getProjectDetail(Number(id));
  if (!p) notFound();

  const profile = await getProfile();
  const aff = computeAffordability({ cash: profile.cash, cpf: profile.cpf, age: profile.age, annualRatePct: profile.rate });

  // If ?type=X, use that unit type's medians as the analysis target. Fall back to project-level.
  const typeRow = type ? p.byUnitType.find((u) => u.unitType === type) : undefined;
  const analysisPrice = typeRow?.medianPrice ?? p.medianPrice;
  const analysisRent = typeRow?.medianRent ?? p.medianRent;
  const analysisSqft = typeRow
    ? (typeRow.medianPrice && typeRow.medianPsf ? typeRow.medianPrice / typeRow.medianPsf : medianSqft(p))
    : medianSqft(p);
  const outOfBudget = analysisPrice != null && analysisPrice > aff.maxPrice;

  return (
    <main className={`max-w-5xl mx-auto p-8 space-y-6 ${outOfBudget ? "opacity-70" : ""}`}>
      <BackLink fallback="/properties">← Back to list</BackLink>
      {outOfBudget && (
        <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded p-4 text-sm space-y-1">
          <div className="font-semibold">Outside your current budget</div>
          <div>
            {typeRow ? `${type} median` : "Median"} price {fmt(analysisPrice)} exceeds your max affordable price{" "}
            <span className="font-semibold">{fmt(aff.maxPrice)}</span> (cash {fmt(profile.cash)}, CPF {fmt(profile.cpf)}, age {profile.age}, rate {profile.rate}%).
            <Link href="/" className="ml-1 text-blue-600 hover:underline">Edit profile</Link>
          </div>
        </div>
      )}
      {typeRow && (
        <div className="border border-blue-300 bg-blue-50 text-blue-900 rounded p-3 text-sm flex items-center justify-between flex-wrap gap-2">
          <div>
            Analysing <span className="font-semibold">{type}</span> units at this project ({typeRow.txnCount} sales · {typeRow.rentalCount} rentals).
          </div>
          <div className="flex gap-2 text-xs">
            {p.byUnitType.map((u) => (
              <Link
                key={u.unitType}
                href={`?type=${encodeURIComponent(u.unitType)}`}
                className={`px-2 py-1 rounded border ${u.unitType === type ? "bg-blue-600 text-white border-blue-600" : "bg-white border-blue-200 hover:bg-blue-100"}`}
              >
                {u.unitType}
              </Link>
            ))}
            <Link
              href={`/properties/${p.id}`}
              className={`px-2 py-1 rounded border ${!type ? "bg-blue-600 text-white border-blue-600" : "bg-white border-blue-200 hover:bg-blue-100"}`}
            >
              Overall
            </Link>
          </div>
        </div>
      )}
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{p.name}</h1>
        <p className="text-gray-600">{p.street} · District {p.postalDistrict} · {p.marketSegment}</p>
        <p className="text-sm text-gray-500">
          {p.tenure}
          {p.completionYear && ` · Built ${p.completionYear} (${new Date().getFullYear() - p.completionYear} yrs old)`}
          {p.totalUnits && ` · ${p.totalUnits} units`}
          {" · "}Nearest MRT: {p.nearestMrt ?? "—"} ({p.mrtDistanceM != null ? `${p.mrtDistanceM}m` : "—"})
          {p.developerName && ` · Developer: ${p.developerName}`}
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Median price (24mo)" value={fmt(p.medianPrice)} />
        <Stat label="Median PSF" value={p.medianPsf ? `$${fmtN(p.medianPsf)}` : "—"} />
        <Stat label="Median rent" value={fmt(p.medianRent)} />
        <Stat label="Gross yield" value={p.grossYieldPct ? `${p.grossYieldPct.toFixed(2)}%` : "—"} emphasize />
        <Stat label="Sale txns (24mo)" value={String(p.txnCount)} />
        <Stat label="Rental contracts" value={String(p.rentalCount)} />
        <Stat label="Rentals / year" value={fmtN(p.rentalsPerYear, 1)} />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">By unit type</h2>
        <table className="w-full text-sm border-collapse">
          <thead className="border-b text-left">
            <tr>
              <th className="py-2">Type</th>
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
              <tr key={r.unitType} className="border-b">
                <td className="py-2 font-medium">{r.unitType}</td>
                <td className="text-right">{fmt(r.medianPrice)}</td>
                <td className="text-right">{r.medianPsf ? `$${fmtN(r.medianPsf)}` : "—"}</td>
                <td className="text-right">{fmt(r.medianRent)}</td>
                <td className="text-right font-semibold">{r.grossYieldPct ? `${r.grossYieldPct.toFixed(2)}%` : "—"}</td>
                <td className="text-right text-xs text-gray-500">{r.txnCount}</td>
                <td className="text-right text-xs text-gray-500">{r.rentalCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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

      <section className="grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-3">Recent sales</h2>
          <table className="w-full text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 tabular-nums">
            <thead className="border-b text-left text-gray-500 uppercase tracking-wider">
              <tr>
                <th>Date</th>
                <th className="text-right">Price</th>
                <th className="text-right">Sqft</th>
                <th className="text-right">PSF</th>
                <th className="text-right">Floor</th>
              </tr>
            </thead>
            <tbody>
              {p.recentTxns.map((t, i) => (
                <tr key={i} className="border-b">
                  <td>{t.contractDate}</td>
                  <td className="text-right">{fmt(t.price)}</td>
                  <td className="text-right">{fmtN(t.sqft)}</td>
                  <td className="text-right">${fmtN(t.psf)}</td>
                  <td className="text-right">{t.floorRange ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-3">Recent rentals</h2>
          <table className="w-full text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 tabular-nums">
            <thead className="border-b text-left text-gray-500 uppercase tracking-wider">
              <tr>
                <th>Date</th>
                <th className="text-right">Rent</th>
                <th className="text-right">Sqft</th>
                <th className="text-right">BR</th>
              </tr>
            </thead>
            <tbody>
              {p.recentRentals.map((r, i) => (
                <tr key={i} className="border-b">
                  <td>{r.leaseDate}</td>
                  <td className="text-right">{fmt(r.rent)}</td>
                  <td className="text-right">{r.sqft ? fmtN(r.sqft) : "—"}</td>
                  <td className="text-right">{r.bedrooms ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function medianSqft(p: Awaited<ReturnType<typeof getProjectDetail>>): number {
  if (!p) return 1000;
  const sqfts = p.recentTxns.map((t) => t.sqft).filter((n) => n > 0).sort((a, b) => a - b);
  return sqfts.length ? sqfts[Math.floor(sqfts.length / 2)] : 1000;
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="border rounded p-4 bg-gray-50">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 ${emphasize ? "text-2xl font-semibold" : "text-base font-medium"}`}>{value}</div>
    </div>
  );
}
