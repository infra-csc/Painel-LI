---
name: Cross-site session cookie for SSO-launched app
description: Why prod session cookies must be SameSite=None+Secure (app is opened from an external portal), and the CSRF tradeoff that follows.
---

# Cross-site session cookie (SSO / Portal Norte)

This app is launched from an external "Norte Portal" via SSO. In that cross-site
(redirect/iframe) context a `SameSite=Lax` cookie is dropped by the browser, so the
session cookie is never sent back: every request gets a fresh SessionID with
`UserID: none` and mutating endpoints return 401. Read-only/top-level flows may still
work for some users, so the failure looks intermittent.

**Rule:** the session cookie must be `sameSite:'none'` + `secure:true` in production,
and stay `sameSite:'lax'` + `secure:false` in development (localhost is http, so Secure
would break dev login). Gate on `process.env.NODE_ENV === 'production'`. `trust proxy`
must be set (it is) so Express honors `X-Forwarded-Proto: https` and emits Secure cookies.

**Why:** Lax cookies are only sent on same-site requests and top-level navigations;
they are blocked in cross-site sub-requests (fetch/XHR from a portal-embedded or
portal-redirected context). None+Secure is the only combo that survives cross-site over HTTPS.

**How to apply:** any time prod session auth "randomly" 401s while dev works, check the
cookie's SameSite first. Symptom in deployment logs: new SessionID per request + UserID none.

## CSRF tradeoff (do not drop)
SameSite=None removes the browser's built-in CSRF protection, so there is a fail-open
Origin check in `server/index.ts` (after the session debug middleware): for non-GET
methods, if an `Origin` header is present and its host is not among the request's
host / `x-forwarded-host`, respond 403. Missing Origin, unparseable Origin, or
indeterminate host are allowed through (fail-open) so server-to-server and ambiguous
proxy cases are never blocked. Browsers send Origin on POST/PATCH/DELETE, so real CSRF
from another site is blocked while same-origin app calls pass.
**Why fail-open:** prod can't be tested live before publishing; a strict check that
mismatches host behind the proxy would lock every mutation out — worse than the CSRF risk.

## Reminder
Cookie/session config only takes effect in prod after re-publishing the deployment.
