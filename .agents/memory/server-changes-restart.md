---
name: Server changes need workflow restart
description: Why backend edits may appear ineffective while frontend HMR continues working.
---

Changes under `server/` are not hot-reloaded by the current development workflow. Vite HMR can show fresh frontend code while the Node process still serves an older backend route implementation.

**Why:** This caused an API to keep returning an obsolete validation error even though the current route source already supported the request. Restarting the application workflow immediately loaded the correct behavior.

**How to apply:** After any backend route, storage, middleware, or server configuration change, restart the configured application workflow before validating API behavior or diagnosing a mismatch between source and runtime.