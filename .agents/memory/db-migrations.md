---
name: DB migrations
description: How to safely apply Postgres schema changes in this repl
---

Apply schema changes by editing `shared/schema.ts` AND running raw `ALTER TABLE`
SQL via a throwaway script: `npx tsx -e "import {Pool} from 'pg'; ..."` (or a temp
file). Run the ALTER for new columns/tables, then keep `shared/schema.ts` in sync.

**Why:** `npm run db:push` (drizzle-kit) produces dangerous false-positive diffs on
the `session` table and timestamp defaults, and offers to drop/recreate columns —
risking data loss. The DB is Neon serverless (`@neondatabase/serverless` Pool).

**How to apply:** new field/table → add to schema.ts, then ALTER TABLE via pg Pool
script. Never run db:push.
