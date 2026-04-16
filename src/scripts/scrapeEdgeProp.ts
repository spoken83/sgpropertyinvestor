// Scrape EdgeProp /condo-apartment/<slug> pages for project metadata.
// Parses __NEXT_DATA__ preloaded state; no interaction with encrypted XHR endpoints.
// Rate-limit: 3s between requests. Resumable via edgeprop_scraped_at column.
//
// Usage:
//   npx tsx src/scripts/scrapeEdgeProp.ts              # process unvisited
//   npx tsx src/scripts/scrapeEdgeProp.ts --limit 10   # first 10 unvisited
//   npx tsx src/scripts/scrapeEdgeProp.ts --id 3       # single project by db id
//   npx tsx src/scripts/scrapeEdgeProp.ts --retry      # re-try failed ones

import { db } from "@/lib/db";
import { projects } from "@/lib/schema";
import { eq, isNull, or, sql as dsql } from "drizzle-orm";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DELAY_MS = 3000;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchProjectPage(slug: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://www.edgeprop.sg/condo-apartment/${slug}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-SG,en;q=0.9" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

type Scraped = {
  developer?: string;
  completion_year?: number;
  total_units?: number;
  tenure?: string;
  property_type?: string;
  architect?: string;
  land_size_sqft?: number;
  plot_ratio?: number;
  planning_area?: string;
  latitude?: number;
  longitude?: number;
  market_segment?: string;
  edgeprop_id?: string;
  edgeprop_alias?: string;
  resolved_name?: string;
};

function extractFields(nextData: Record<string, unknown>, expectedName: string): Scraped | null {
  const pageProps = (nextData as { props?: { pageProps?: Record<string, unknown> } }).props?.pageProps;
  if (!pageProps) return null;
  const pd = pageProps.projectDetail as Record<string, unknown> | undefined;
  const pi = (pageProps.projectInfo as { data?: Record<string, unknown> } | undefined)?.data;
  if (!pd || !pi) return null;

  const resolvedName = String((pd.name as string | undefined) ?? "").toUpperCase().trim();
  if (!resolvedName) return null;

  // Guard against wrong-slug match: EdgeProp redirects / returns closest; we only accept close string match.
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (norm(resolvedName) !== norm(expectedName)) {
    // Allow prefix-containing (e.g., "THE INTERLACE" vs "INTERLACE, THE")
    if (!norm(resolvedName).includes(norm(expectedName)) && !norm(expectedName).includes(norm(resolvedName))) {
      return null;
    }
  }

  const display = (v: unknown) =>
    (v && typeof v === "object" && "display" in v ? String((v as { display?: string }).display ?? "") : "") || "";

  const out: Scraped = { resolved_name: resolvedName };

  const dev = display(pi.developer);
  if (dev) out.developer = dev;

  const comp = display(pi.completion);
  const compMatch = comp.match(/\b(19|20)\d{2}\b/);
  if (compMatch) out.completion_year = Number(compMatch[0]);

  const nu = display(pi.number_of_units);
  const nuMatch = nu.replace(/,/g, "").match(/\d+/);
  if (nuMatch) out.total_units = Number(nuMatch[0]);

  const ten = display(pi.tenure);
  if (ten) out.tenure = ten;

  const pt = display(pi.property_type);
  if (pt) out.property_type = pt;

  const arch = display(pi.architect);
  if (arch) out.architect = arch;

  const ls = display(pi.land_size).replace(/,/g, "");
  const lsn = Number(ls);
  if (Number.isFinite(lsn) && lsn > 0) out.land_size_sqft = Math.round(lsn);

  const pr = Number(display(pi.plot_ratio));
  if (Number.isFinite(pr) && pr > 0) out.plot_ratio = pr;

  const region = display(pi.project_region);
  if (["CCR", "RCR", "OCR"].includes(region)) out.market_segment = region;

  if (pd.planning_area) out.planning_area = String(pd.planning_area);
  const lat = Number(pd.lat);
  const lon = Number(pd.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    out.latitude = lat;
    out.longitude = lon;
  }
  if (pd.id) out.edgeprop_id = String(pd.id);
  if (pd.alias) out.edgeprop_alias = String(pd.alias);

  return out;
}

async function processOne(proj: { id: number; name: string }): Promise<"ok" | "404" | "mismatch" | "error"> {
  const slug = slugify(proj.name);
  try {
    const data = await fetchProjectPage(slug);
    if (!data) return "404";
    const s = extractFields(data, proj.name);
    if (!s) return "mismatch";

    await db
      .update(projects)
      .set({
        developerName: s.developer,
        completionYear: s.completion_year,
        totalUnits: s.total_units,
        tenure: s.tenure,
        propertyType: s.property_type,
        architect: s.architect,
        landSizeSqft: s.land_size_sqft,
        plotRatio: s.plot_ratio != null ? String(s.plot_ratio) : null,
        planningArea: s.planning_area,
        latitude: s.latitude != null ? String(s.latitude) : null,
        longitude: s.longitude != null ? String(s.longitude) : null,
        marketSegment: s.market_segment ?? undefined,
        edgepropId: s.edgeprop_id,
        edgepropAlias: s.edgeprop_alias,
        edgepropScrapedAt: new Date(),
      })
      .where(eq(projects.id, proj.id));
    return "ok";
  } catch (e) {
    console.error(`  err for ${proj.name}:`, (e as Error).message);
    return "error";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const idArg = args.indexOf("--id");
  const retry = args.includes("--retry");

  let targets: { id: number; name: string }[];
  if (idArg >= 0) {
    const id = Number(args[idArg + 1]);
    targets = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, id));
  } else {
    const where = retry ? undefined : isNull(projects.edgepropScrapedAt);
    const q = db.select({ id: projects.id, name: projects.name }).from(projects);
    targets = where ? await q.where(where) : await q;
  }
  if (limitArg >= 0) targets = targets.slice(0, Number(args[limitArg + 1]));

  console.log(`Scraping ${targets.length} projects, ${DELAY_MS}ms between requests`);

  const stats = { ok: 0, "404": 0, mismatch: 0, error: 0 };
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const r = await processOne(t);
    stats[r]++;
    const mark = { ok: "✓", "404": "⤬", mismatch: "?", error: "!" }[r];
    console.log(`${mark} [${i + 1}/${targets.length}] ${t.name}`);
    // For non-ok, still mark scraped_at so we don't retry unless --retry.
    if (r !== "ok") {
      await db.update(projects).set({ edgepropScrapedAt: new Date() }).where(eq(projects.id, t.id));
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  console.log("Done:", stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
