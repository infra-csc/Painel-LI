---
name: Logistics suggestions (Espelho Operacional)
description: Design rules for auto room/uber grouping in the operational mirror
---

The operational mirror auto-suggests hotel room-sharing and Uber groupings per
event. Suggestions live in `hotel_room_groups`/`uber_groups` (+ member tables) with
`suggested`/`confirmed` flags.

**Rule:** recalculation must read confirmed groups first, lock their members,
delete ONLY non-confirmed groups, then regenerate suggestions excluding locked
members. Never overwrite a confirmed group.

**Why:** users manually confirm groups; a recalc that wiped confirmations would
destroy human decisions. The whole recalc is idempotent and safely re-runnable, so
a mid-run failure just means re-run it — no DB transaction is required.

**How to apply:** room pairing = same gender + same check-in/out dates + same hotel
(triple only if `allow_triple_room`). Uber grouping bucket key = date + airport +
hotel (so people heading to different places aren't merged), then split by time
window (`uber_group_time_window_minutes`) and `uber_max_people_per_car`. Config
read from `system_settings` with sensible defaults.
