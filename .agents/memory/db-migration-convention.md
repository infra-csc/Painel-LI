---
name: DB migration convention
description: How schema changes are applied in this project (NOT db:push / drizzle migrate)
---

# Schema changes are applied via manual ALTER TABLE, not migrations

Apply new columns with `npx tsx -e` using `import {Pool} from "pg"` and
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`. Then mirror the column in
`shared/schema.ts`. Do NOT run `db:push` and do NOT edit `drizzle.config.ts`.

**Why:** The `migrations/0000_*.sql` snapshot is stale — it predates whole tables
(e.g. `logistics_extra_costs` is absent from it). The live Postgres DB is the source
of truth, kept current by hand-run ALTERs; `shared/schema.ts` is the typed mirror.
Rebuilding from migrations would NOT reproduce the current schema.

**How to apply:** When adding columns, (1) ALTER the live DB via tsx+pg, (2) add the
field to `shared/schema.ts`. Do not try to "fix" the stale migration file — adding
columns there only deepens the inconsistency since it already omits later tables.
