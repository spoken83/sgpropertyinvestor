// Ingest URA PMI_Resi_Pipeline: upcoming / under-construction projects.
// Fields: project, street, district, totalUnits, expectedTOPYear, developerName,
// plus unit-type breakdown (apartment/condo/terrace/semi-d/detached).

import { db } from "@/lib/db";
import { projects } from "@/lib/schema";
import { getToken } from "@/lib/ura";
import { districtToSegment } from "@/lib/segment";
import { sql } from "drizzle-orm";

type PipelineRow = {
  project: string;
  street: string;
  district: string;
  totalUnits: number;
  expectedTOPYear: string; // "2028" or "na"
  developerName: string;
  noOfApartment: number;
  noOfCondo: number;
  noOfSemiDetached: number;
  noOfTerrace: number;
  noOfDetachedHouse: number;
};

async function main() {
  const token = await getToken();
  const res = await fetch(
    "https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Pipeline",
    { headers: { AccessKey: process.env.URA_ACCESS_KEY!, Token: token } }
  );
  const json = (await res.json()) as { Status: string; Result: PipelineRow[] };
  if (json.Status !== "Success") throw new Error(`URA pipeline failed: ${JSON.stringify(json).slice(0, 200)}`);

  console.log(`Got ${json.Result.length} pipeline projects`);

  let inserted = 0;
  let updated = 0;
  for (const row of json.Result) {
    // Skip pure-landed pipeline rows
    const nonLanded = (row.noOfApartment ?? 0) + (row.noOfCondo ?? 0);
    if (nonLanded === 0) continue;

    const top = row.expectedTOPYear && row.expectedTOPYear !== "na" ? Number(row.expectedTOPYear) : null;

    const result = await db
      .insert(projects)
      .values({
        name: row.project,
        street: row.street,
        postalDistrict: row.district,
        marketSegment: districtToSegment(row.district) ?? undefined,
        totalUnits: row.totalUnits,
        expectedTopYear: top,
        developerName: row.developerName,
        pipelineStatus: "upcoming",
      })
      .onConflictDoUpdate({
        target: [projects.name, projects.street],
        set: {
          totalUnits: row.totalUnits,
          expectedTopYear: top,
          developerName: row.developerName,
          pipelineStatus: "upcoming",
          updatedAt: new Date(),
        },
      })
      .returning({ id: projects.id });
    if (result.length > 0) {
      // Can't easily distinguish insert vs update here; count any touch
      updated++;
    }
  }
  console.log(`Upserted ${updated} pipeline rows`);

  const summary = await db.execute(sql`
    SELECT pipeline_status, COUNT(*) FROM projects
    WHERE pipeline_status IS NOT NULL GROUP BY 1
  `);
  console.log((summary as unknown as { rows: Record<string, unknown>[] }).rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
