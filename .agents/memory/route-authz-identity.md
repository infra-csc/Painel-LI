---
name: Route authz identity source
description: Where Express routes must read the current user's identity from, especially for destructive/role-gated endpoints.
---

# Identity source for role-gated / destructive routes

On any route that enforces a role check or performs a destructive action (DELETE, role-restricted mutations), derive the acting user's identity from `req.session.userId` ONLY.

**Why:** Several older routes in `server/routes.ts` use the pattern `const userId = req.session.userId || req.body?._userId;` (e.g. payment-companies delete). The `_userId` body fallback is client-controlled, so when the session is absent/invalid a caller can spoof identity and bypass the role gate (privilege escalation). The stricter swap-request approve/reject routes correctly use `req.session?.userId` only.

**How to apply:** When adding or copying a role-gated handler, drop the `|| req.body?._userId` fallback. Pattern:
```
const userId = req.session?.userId;
if (!userId) return res.status(401).json({ message: "Não autenticado" });
const currentUser = await storage.getUser(userId);
const allowed = currentUser && ['admin','administrator','administrador','purchasing'].includes(currentUser.role);
if (!allowed) return res.status(403).json({ message: "Sem permissão" });
```
Do not blindly mirror the payment-companies pattern — it carries the spoofable fallback.

## Protected fields must not be writable via the generic PATCH

`PATCH /api/collaborators/:id` has NO auth and accepts `insertCollaboratorSchema.partial()`. Any field that lives in the insert schema is writable by anyone through it. So when you add a field that should only change through a gated/validated endpoint (e.g. `active`/`inactiveReason`/`inactivatedAt`, only settable via `/inactivate` + `/reactivate` with admin/purchasing role + mandatory reason), you MUST `delete` those keys from the parsed body inside the PATCH handler — otherwise the dedicated endpoint's role gate and validation are trivially bypassed.

**Why:** A code review caught that the soft-inactivate role gate + mandatory reason were fully bypassable via the unauthenticated PATCH route until protected keys were stripped there.

**How to apply:** For every new "privileged" collaborator (or similar) field, either strip it in PATCH or move PATCH behind auth. Default to stripping.

Note: `tsx server/index.ts` runs WITHOUT watch — server route changes need a workflow restart to take effect (frontend gets Vite HMR, backend does not).
