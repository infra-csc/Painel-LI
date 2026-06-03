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
