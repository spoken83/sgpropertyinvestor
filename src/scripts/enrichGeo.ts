import { db } from "@/lib/db";
import { projects } from "@/lib/schema";
import { haversineMeters } from "@/lib/geo";
import { sql, isNotNull, and } from "drizzle-orm";
import mrtData from "../data/mrt.json";

type Mrt = { name: string; code: string | null; lat: number; lng: number };

async function main() {
  const stations = mrtData as Mrt[];
  console.log(`Loaded ${stations.length} MRT stations`);

  const rows = await db
    .select({ id: projects.id, lat: projects.latitude, lng: projects.longitude })
    .from(projects)
    .where(and(isNotNull(projects.latitude), isNotNull(projects.longitude)));
  console.log(`Enriching ${rows.length} projects...`);

  let done = 0;
  for (const r of rows) {
    const p = { lat: Number(r.lat), lng: Number(r.lng) };
    let nearest: Mrt | null = null;
    let minDist = Infinity;
    for (const s of stations) {
      const d = haversineMeters(p, s);
      if (d < minDist) {
        minDist = d;
        nearest = s;
      }
    }
    if (nearest) {
      await db
        .update(projects)
        .set({ nearestMrt: nearest.name, mrtDistanceM: Math.round(minDist) })
        .where(sql`id = ${r.id}`);
    }
    if (++done % 500 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
