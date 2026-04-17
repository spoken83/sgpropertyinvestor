import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectDetail } from "@/lib/projectDetail";
import { getProfile } from "@/lib/profile";
import { computeAffordability } from "@/lib/affordability";
import PropertyDetailView from "./PropertyDetailView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getProjectDetail(Number(id));
  return { title: p?.name ?? "Property" };
}

function medianSqft(p: Awaited<ReturnType<typeof getProjectDetail>>): number {
  if (!p) return 1000;
  const sqfts = p.recentTxns.map((t) => t.sqft).filter((n) => n > 0).sort((a, b) => a - b);
  return sqfts.length ? sqfts[Math.floor(sqfts.length / 2)] : 1000;
}

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
  const aff = computeAffordability({
    cash: profile.cash,
    cpf: profile.cpf,
    age: profile.age,
    annualRatePct: profile.rate,
    includeTdsr: profile.includeTdsr,
    salary: profile.salary,
    monthlyDebts: profile.monthlyDebts,
    tdsrPct: profile.tdsrPct,
    stressRate: profile.stressRate,
  });

  const typeRow = type ? p.byUnitType.find((u) => u.unitType === type) : undefined;
  const analysisPrice = typeRow?.medianPrice ?? p.medianPrice;
  const analysisRent = typeRow?.medianRent ?? p.medianRent;
  const analysisSqft = typeRow
    ? (typeRow.medianPrice && typeRow.medianPsf ? typeRow.medianPrice / typeRow.medianPsf : medianSqft(p))
    : medianSqft(p);
  const outOfBudget = analysisPrice != null && analysisPrice > aff.maxPrice;

  return (
    <PropertyDetailView
      project={p}
      type={type}
      analysisPrice={analysisPrice}
      analysisRent={analysisRent}
      analysisSqft={analysisSqft}
      outOfBudget={outOfBudget}
      affMaxPrice={aff.maxPrice}
      profileCash={profile.cash}
      profileCpf={profile.cpf}
      profileAge={profile.age}
      profileRate={profile.rate}
      profileIncludeTdsr={profile.includeTdsr}
      profileSalary={profile.salary}
      profileMonthlyDebts={profile.monthlyDebts}
      profileTdsrPct={profile.tdsrPct}
      profileStressRate={profile.stressRate}
    />
  );
}
