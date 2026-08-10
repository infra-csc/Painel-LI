---
name: Phase 1 Security Fixes
description: Security hardening applied — requireAuth middleware, _userId removal, isActive checks, MIME allowlist, Content-Disposition.
---

## Fixes applied (2026-08-10)

### 1. `requireAuth` middleware — `server/middleware/requireAuth.ts`
- Blocks all `/api/*` routes without a session.
- Exempt: `/api/auth/`, `/api/integration/`.
- Applied globally in `server/index.ts` via `app.use(requireAuth)` — replaced the old audit-only middleware.

**Why:** The previous middleware only logged (`console.warn`) unauthenticated requests and called `next()`, so every endpoint was publicly accessible.

**How to apply:** When adding new routes, they are protected by default. To make a new endpoint truly public, add its prefix to `PUBLIC_PREFIXES` in `requireAuth.ts` with a comment explaining why.

---

### 2. `_userId` body fallback — removed from all routes
- Pattern `req.session.userId || req.body?._userId` replaced with `req.session.userId` everywhere.
- Destructuring like `const { _userId, ...bodyData } = req.body` kept for body cleaning but `_userId` is renamed to `_ignoredUserId` and never used as actor.
- `updatedBy: req.body.updatedBy` in tickets/accommodations/financial PATCH → `req.session?.userId`.
- `createdBy: req.body.userId` in budget-actual duplication → `req.session?.userId`.

**Why:** Any client could pass `_userId: "<victim-id>"` and act as that user on ~20 endpoints.

**How to apply:** Actor identity MUST come from `req.session.userId` only. Never read userId/actorId from the request body. `requireAuth` guarantees the session is populated.

---

### 3. `isActive` check in auth flows
- Login (`/api/auth/login`): added `|| user.isActive === false` to the rejection condition.
- SSO endpoint (`/api/portal/sso`): replaced auto-approve of non-approved users with rejection when `status !== 'approved' || isActive === false`.
- `/api/auth/me`: added `|| user.status !== 'approved' || user.isActive === false` before returning the session user.

**Why:** A disabled user (`isActive=false`) could previously authenticate via direct login or SSO. `/api/auth/me` would also return a valid session for them.

---

### 4. Upload MIME allowlist — multer `fileFilter`
- Allowed: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/plain`.
- Rejects everything else with a Portuguese error message.
- Auth on upload endpoints covered by global `requireAuth`.

**Why:** Unrestricted MIME type upload is a stored-XSS vector if SVG or HTML is served back.

---

### 5. `Content-Disposition: attachment` on `/api/attachments/:id/view`
- Changed from `inline` to `attachment`.

**Why:** Serving user-uploaded files inline executes HTML/SVG in the browser origin.
