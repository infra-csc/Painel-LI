---
name: Swap badge & banner counts
description: How pending-swap badge/banner counts must be derived so they never disagree with what the user can actually see.
---

# Swap badge / banner counts must match the displayable set

In the tickets/scaling/accommodation swap flows, a "pending swap" count drives a
sidebar badge and an in-page banner. These counts must be derived from the SAME
filtered/deduplicated set that the table actually renders — not a parallel,
broader status check.

**Why:** Two phantom bugs came from counting independently of what's displayable:
1. Sidebar `scalingSwapCount` used `!alreadyHandledStatuses.has(status)`. When the
   inclusion status was `undefined` (inclusion not yet loaded or not in the map),
   `!has(undefined) === true`, so it counted a phantom → red badge on "Escalação"
   leading nowhere. Guard with `!!st && !handled.has(st)` so undefined never counts.
   A `passagem_comprada` inclusion belongs to the Passagem badge, not Escalação.
2. Tickets banner counted swaps by a broad "escalated" status set, independent of
   the `needsTicket` + dedup + filters the table applies → banner showed N while the
   table showed 0. Derive the banner from `deduplicatedInclusions ∩ pendingSwapByInclusion`.

**Also:** the `filteredTicketInclusions` memo applies the `showOnlyPendingSwaps`
toggle and `pendingSwapByInclusion` in its body — both MUST be in its dependency
array, or clicking the banner filter never recomputes the table (stale/empty rows).

**How to apply:** any new swap badge/banner — count over the exact set the
corresponding view renders, treat undefined/unloaded status as "don't count," and
keep every value referenced inside a `useMemo` in its dependency array.

**Sidebar routing must not depend on a second query.** The sidebar originally
routed swap badges (Passagem / Hospedagem / Escalação) by joining swaps to a
SEPARATE `/api/team-inclusions` query that was `enabled` only for purchasing roles.
When that query was slow/unloaded the inclusion status was undefined and badges
mis-routed. Fix: `/api/swap-requests` now embeds `inclusion_status` and
`inclusion_deleted_at` (LEFT JOIN team_inclusions), and the sidebar reads the
embedded status (helper falls back to the old map). Badge stage by inclusion status:
`passagem_comprada`/`hospedagem_passagem_comprada` → Passagem; `hospedagem_comprada`
→ Hospedagem; anything else still pending → Escalação; deleted inclusion → no badge.

**Dev and prod swap data diverge — verify production when a count complaint can't be
reproduced.** A "badge says 1 but I can't find it" report was unreproducible in dev
(dev's pending swap was a `passagem_comprada` inclusion) but in prod the pending swap
was on an `escalado` inclusion, so the Escalação badge was actually CORRECT. The real
problem was findability among 1000+ rows. Use the database skill (environment:
"production", read-only) to check the actual prod rows before assuming a logic bug.

**Escalação page has a "Ver trocas pendentes" banner/shortcut** mirroring the
tickets/passagem pattern: a banner appears when any rendered inclusion has a pending
swap; clicking filters both tabs to swap-only and jumps to the tab holding the match.
The filter auto-clears when the visible pending count hits 0 (otherwise the only
"Mostrar todos" escape hatch disappears and the view gets stuck empty). The Escalação
tabs are CONTROLLED state for this reason, not `defaultValue`.
