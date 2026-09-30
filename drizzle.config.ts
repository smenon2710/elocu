import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same .env.local the app reads, so DATABASE_URL only has to be set once.
loadEnvConfig(process.cwd());

// `npm run db:generate` turns changes in lib/db/schema.ts into a new SQL
// migration under drizzle/ (committed); `npm run db:migrate` applies pending
// ones to whatever DATABASE_URL points at — local Postgres, or Neon for
// production. See README "Database".
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
