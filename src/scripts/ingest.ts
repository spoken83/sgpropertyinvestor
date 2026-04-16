import { db } from "@/lib/db";
import { projects, transactions, rentals } from "@/lib/schema";
import { getToken, fetchTransactions, fetchRentals, parseUraDate, UraTxn, UraRent } from "@/lib/ura";
import { districtToSegment } from "@/lib/segment";
import { sql } from "drizzle-orm";

async function upsertProject(p: { name: string; street: string; marketSegment?: string; district?: string; tenure?: string; x?: string; y?: string }) {
  const res = await db
    .insert(projects)
    .values({
      name: p.name,
      street: p.street,
      marketSegment: p.marketSegment,
      postalDistrict: p.district,
      tenure: p.tenure,
      svy21X: p.x ?? null,
      svy21Y: p.y ?? null,
    })
    .onConflictDoUpdate({
      target: [projects.name, projects.street],
      set: {
        marketSegment: sql`COALESCE(${p.marketSegment ?? null}, ${projects.marketSegment})`,
        tenure: sql`COALESCE(${p.tenure ?? null}, ${projects.tenure})`,
        svy21X: sql`COALESCE(${p.x ?? null}, ${projects.svy21X})`,
        svy21Y: sql`COALESCE(${p.y ?? null}, ${projects.svy21Y})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: projects.id });
  return res[0].id;
}

async function ingestTransactions() {
  const token = await getToken();
  console.log("Got URA token");

  for (const batch of [1, 2, 3, 4] as const) {
    console.log(`Fetching transactions batch ${batch}...`);
    const results = await fetchTransactions(token, batch);
    console.log(`  ${results.length} projects`);
    for (const row of results) {
      // Private non-landed only: Condominium, Apartment, Executive Condominium
      const privateNonLanded = (row.transaction ?? []).filter((t) =>
        ["Condominium", "Apartment", "Executive Condominium"].includes(t.propertyType)
      );
      if (!privateNonLanded.length) continue;
      const first = privateNonLanded[0];
      const projectId = await upsertProject({
        name: row.project,
        street: row.street,
        marketSegment: first.marketSegment ?? districtToSegment(first.district) ?? undefined,
        district: first.district,
        tenure: first.tenure,
      });
      const vals = privateNonLanded.map((t) => ({
        projectId,
        contractDate: parseUraDate(t.contractDate),
        price: t.price,
        areaSqm: t.area || null,
        psfSqft:
          t.price && t.area
            ? String(Number(t.price) / (Number(t.area) * 10.7639))
            : null,
        floorRange: t.floorRange,
        typeOfSale: t.typeOfSale,
        propertyType: t.propertyType,
        tenure: t.tenure,
        noOfUnits: t.noOfUnits ? Number(t.noOfUnits) : null,
      }));
      // batch insert
      for (let i = 0; i < vals.length; i += 500) {
        await db.insert(transactions).values(vals.slice(i, i + 500));
      }
    }
  }
}

async function ingestRentals() {
  const token = await getToken();
  // Last 20 quarters (~5 years, matching URA's rental contract window)
  const now = new Date();
  const quarters: string[] = [];
  for (let i = 0; i < 20; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    quarters.push(`${String(d.getFullYear()).slice(2)}q${q}`);
  }
  for (const refPeriod of quarters) {
    console.log(`Fetching rentals ${refPeriod}...`);
    const results = await fetchRentals(token, refPeriod);
    console.log(`  ${results.length} projects`);
    for (const row of results) {
      const nonLanded = (row.rental ?? []).filter((r) =>
        ["Non-landed Properties", "Executive Condominium"].includes(r.propertyType)
      );
      if (!nonLanded.length) continue;
      const projectId = await upsertProject({
        name: row.project,
        street: row.street,
        district: nonLanded[0].district,
        marketSegment: districtToSegment(nonLanded[0].district) ?? undefined,
        x: row.x,
        y: row.y,
      });
      const vals = nonLanded.map((r) => ({
        projectId,
        leaseDate: parseUraDate(r.leaseDate),
        monthlyRent: String(r.rent),
        areaSqft: r.areaSqft,
        bedrooms: r.noOfBedRoom && r.noOfBedRoom !== "NA" ? Number(r.noOfBedRoom) : null,
        propertyType: r.propertyType,
      }));
      for (let i = 0; i < vals.length; i += 500) {
        await db.insert(rentals).values(vals.slice(i, i + 500));
      }
    }
  }
}

async function main() {
  const mode = process.argv[2] || "all";
  if (mode === "all" || mode === "txn") await ingestTransactions();
  if (mode === "all" || mode === "rent") await ingestRentals();
  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
