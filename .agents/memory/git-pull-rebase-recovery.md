---
name: Git pull recovery
description: Recovering Pull operations that leave an apparent rebase, merge, or index lock in the Replit Git UI.
---

When the Git UI reports an unsupported rebase/merge or a locked index, inspect `git status`, `.git/rebase-*`, `.git/MERGE_HEAD`, active Git processes, and `.git/index.lock` before taking action. Resolve staged conflicts and continue the existing operation; remove `index.lock` only when no Git/editor process is active.

**Why:** The Git UI can start a Pull/rebase independently of the agent and can remain on a stale editor or lock state after a previous operation, while the workspace itself is still recoverable.

**How to apply:** Never start another Pull over an existing operation. Finish or abort the detected rebase/merge first, then validate that there are no unmerged files or conflict markers.