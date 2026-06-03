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
