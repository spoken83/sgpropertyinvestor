import { db } from "@/lib/db";
import { projects } from "@/lib/schema";
import { svy21ToLatLng } from "@/lib/geo";
import { sql, isNotNull, and, isNull } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({ id: projects.id, x: projects.svy21X, y: projects.svy21Y })
    .from(projects)
    .where(and(isNotNull(projects.svy21X), isNotNull(projects.svy21Y), isNull(projects.latitude)));
  console.log(`Converting ${rows.length} projects...`);
  let done = 0;
  for (const r of rows) {
    const { lat, lng } = svy21ToLatLng(Number(r.x), Number(r.y));
    await db
      .update(projects)
      .set({ latitude: String(lat), longitude: String(lng) })
      .where(sql`id = ${r.id}`);
    if (++done % 500 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
