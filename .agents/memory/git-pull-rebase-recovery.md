---
name: Git pull recovery
description: Recovering Pull operations that leave an apparent rebase, merge, or index lock in the Replit Git UI.
---

When the Git UI reports an unsupported rebase/merge or a locked index, inspect `git status`, `.git/rebase-*`, `.git/MERGE_HEAD`, active Git processes, and `.git/index.lock` before taking action. Resolve staged conflicts and continue the existing operation; remove `index.lock` only when no Git/editor process is active. If a rebase is trying to replay many local commits over a small number of remote commits, prefer aborting that rebase and merging the remote snapshot while preserving both histories.

**Why:** The Git UI can start a Pull/rebase independently of the agent and can remain on a stale editor or lock state after a previous operation, while the workspace itself is still recoverable. Aborting alone may only temporarily clear the error: the UI can immediately issue another `pull --rebase`, even when `pull.rebase` is configured false, because its command explicitly requests a rebase. Integrating the remote commits closes the divergence that triggers the repeated attempt.

**How to apply:** Never start another Pull over an existing operation. Finish or abort the detected rebase/merge first; if aborting, merge the remote tip when syncing is intended, resolve actual conflicts without discarding local commits, and validate that there are no unmerged files or conflict markers. Do not reset or skip commits to silence the UI.