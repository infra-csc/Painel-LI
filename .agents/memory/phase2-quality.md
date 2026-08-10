---
name: Phase 2 Quality & Stability
description: Indexes, transactions, Zod middleware applied. What was done and key decisions.
---

## Indexes applied (2026-08-10) — dev DB only

9 `CREATE INDEX IF NOT EXISTS` applied via executeSql to dev; **must reapply in production after deploy**.
Run this in prod DB:
```sql
CREATE INDEX IF NOT EXISTS idx_team_inclusions_event_id        ON team_inclusions(event_id);
CREATE INDEX IF NOT EXISTS idx_function_managers_user_id       ON function_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_function_users_user_id          ON function_users(user_id);
CREATE INDEX IF NOT EXISTS idx_team_inclusion_logs_ti_id       ON team_inclusion_logs(team_inclusion_id);
CREATE INDEX IF NOT EXISTS idx_comments_team_inclusion_id      ON comments(team_inclusion_id);
CREATE INDEX IF NOT EXISTS idx_budget_planned_event_id         ON budget_planned(event_id);
CREATE INDEX IF NOT EXISTS idx_budget_actual_event_id          ON budget_actual(event_id);
CREATE INDEX IF NOT EXISTS idx_invoices_event_id               ON invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_function_values_function_id     ON function_values(function_id);
```

**Why:** Zero pgIndex declarations in schema.ts before this. All FK columns used in WHERE/JOIN had no indexes.

---

## Transactions added (routes.ts)

Three operations wrapped in `db.transaction()`:

| Operation | Route | What was atomic before | Now atomic |
|---|---|---|---|
| Split de vaga | `POST /api/budget-actual/:id/split` | No — child insert + parent update were separate | Yes |
| Swap approve | `PATCH /api/swap-requests/:id/approve` | No — team_inclusion update + swap_request update were separate | Yes |
| RH action (lote) | `POST /api/budget-actual/rh-action` | No — N independent updates | Yes (Flash debits intentionally outside) |
| Enviar para revisão | `POST /api/budget-actual/send-for-review` | No — N independent updates | Yes |

**Flash debits are intentionally OUTSIDE the rh-action transaction** — a Flash ledger failure must not roll back the RH approval. The unique constraint prevents duplicates on retry.

**How to apply:** When adding new multi-step write operations, use `db.transaction(async (tx) => { ... })`. Storage methods use the global `db` — for transactional inlining, use `tx.update(...).set(...).where(...).returning()` directly.

---

## Zod validation middleware — `server/middleware/validate.ts`

`validateBody(schema)` and `validateQuery(schema)` middleware factory functions.
- Replace ad-hoc `schema.parse(req.body)` calls with `app.post("/route", validateBody(schema), handler)`.
- Returns `{ message, errors: fieldErrors }` on failure — structured for inline form display.
- **Not yet applied** to routes — Phase 2 listed it as an item; apply progressively to mutation routes.

---

## Pending Phase 2 items

- **Paginação server-side** on 3 main tables (team_inclusions, collaborators, tickets) — deferred; requires frontend changes too.
- **Filtros e ordenação para SQL** — deferred; currently in-memory in many storage methods.
- **Zod middleware wiring** — created but not applied to routes yet; apply progressively.
