---
name: Maratona integration API
description: Read-only API the external "Maratona" system consumes; durable constraints on IDs and PII.
---

# Maratona integration (read-only API)

Three token-protected GET endpoints under `/api/integration/*` (employees, events,
participations) feed the external "Maratona" system, authed by Bearer
`MARATONA_API_TOKEN`.

## Durable constraints (not obvious from code)
- **`externalId` must stay the table's stable uuid primary key, forever.** Maratona
  reconciles/updates records by `externalId`; changing the ID source (or regenerating
  PKs) would make Maratona duplicate every record. Same for `eventExternalId` /
  `employeeExternalId` in participations.
- **CPF (`document`) and `phone` are exposed on purpose** — the Maratona contract
  explicitly requested them. This is intentional PII over a shared token, not an oversight.
- The contract asks for some fields the schema doesn't have (collaborator email/department;
  event clientName/city/state); they're intentionally omitted as optional.
- `participations` come from `team_inclusions`; `confirmed` = status not in
  (`planejado`, `cancelado`); soft-deleted and collaborator-less rows are excluded.

**Why it matters:** any schema/PK refactor or "privacy cleanup" that drops these fields
or changes ID sources will silently break the external sync (duplicates or missing people).
