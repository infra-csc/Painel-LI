---
name: apiRequest error shape (masked toasts)
description: Why frontend onError toasts showed a generic message instead of the real server error, and the compatibility shim that fixes it.
---

# apiRequest error shape

`apiRequest` (client/src/lib/queryClient.ts) throws a plain `Error("<status>: <body>")`.
Many mutation `onError` handlers were written as `err?.response?.json?.()` — but the
thrown Error had no `.response`, so they always fell back to a generic message (e.g.
"Erro ao criar solicitação"), masking the real cause (often a 401).

**Fix in place:** `throwIfResNotOk` now enriches the thrown error with `.status`,
`.body` (parsed JSON, or `{message:text}` fallback), and a `.response = { status,
json: async () => body }` shim. This makes the existing `err.response.json()` handlers
surface the real server message without touching all of them. New handlers should prefer
`err.status` / `err.body.message` directly.

**How to apply:** when a toast shows a vague error and the network tab shows a real JSON
message, the handler is reading the wrong shape — use `err.status`/`err.body`, don't
reintroduce `err.response` assumptions beyond the shim.
