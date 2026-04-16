import { notFound } from "next/navigation";
import { getProjectDetail } from "@/lib/projectDetail";
import { getProfile } from "@/lib/profile";
import { computeAffordability } from "@/lib/affordability";
import PropertyDetailView from "./PropertyDetailView";

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
    />
  );
}
