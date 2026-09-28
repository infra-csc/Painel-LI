---
name: Vite browser errors and workflow
description: Why browser console messages must not terminate the development web server
---

Keep Vite's development error logger nonfatal when Vite and the API share a Node process. A client-side warning or exception must be logged, not terminate the entire application.

**Why:** Vite forwards browser `console.error` over HMR to its server logger. A logger configured to call `process.exit(1)` on every error caused the workflow to fail immediately after a React ref warning in a page; restarting alone only hid the problem until that page was opened again. Reproducing the forwarded error over the HMR channel confirmed the failure mechanism and that a nonfatal logger keeps the API serving.

**How to apply:** When adjusting Vite logging or investigating a workflow that stops without a server stack trace, check whether its last line is a forwarded `(client) [console.error]` message. Let Vite report recoverable client/transform errors while genuine startup failures still reject or throw normally.