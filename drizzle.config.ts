import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";
// Load .env first, then .env.local (latter overrides for dev-local tweaks).
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default {
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
