// Loads total units per project from data.gov.sg "URA No of Dwelling Units".
// Aggregates block-level DU by PROJ_NAME; matches our `projects` table by name.

import { db } from "@/lib/db";
import { projects } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

type Feature = {
  properties: {
    PROJ_NAME: string;
    PROP_TYPE: "Landed" | "Non-Landed" | "EC";
    DU: number;
  };
};

async function main() {
  const path = process.argv[2] || "/tmp/du.geojson";
  const fc = JSON.parse(readFileSync(path, "utf8")) as { features: Feature[] };

  // Aggregate DU by project name (non-landed + EC only)
  const agg = new Map<string, number>();
  for (const f of fc.features) {
    const p = f.properties;
    if (p.PROP_TYPE === "Landed") continue;
    const name = (p.PROJ_NAME || "").trim().toUpperCase();
    if (!name) continue;
    agg.set(name, (agg.get(name) ?? 0) + (Number(p.DU) || 0));
  }
  console.log(`Aggregated ${agg.size} non-landed projects`);

  // Match by UPPER(name) — URA project names in our DB are already uppercase.
  let matched = 0;
  for (const [name, du] of agg) {
    const res = await db.execute(sql`
      UPDATE projects SET total_units = ${du}
      WHERE UPPER(name) = ${name}
    `);
    const rc = (res as unknown as { rowCount?: number }).rowCount ?? 0;
    matched += rc;
  }
  console.log(`Updated ${matched} project rows`);

  const summary = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE total_units IS NOT NULL) AS with_units,
           COUNT(*) AS total
    FROM projects
  `);
  const rows = (summary as unknown as { rows?: Record<string, unknown>[] }).rows ?? (summary as unknown as Record<string, unknown>[]);
  console.log("Coverage:", rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
