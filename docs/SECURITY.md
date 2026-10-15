# Security model

What is in place now, and the rule each piece enforces. Later milestones add their own sections (agents, sandbox, uploads, sockets).

## Authentication

| Mechanism          | Detail                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passwords          | Argon2id (19 MiB, t=2, p=1). 10–128 characters. Unknown emails still run one hash verification so timing doesn't reveal accounts.                                                                                                                      |
| Access token       | HS256 JWT, 15 minutes, held only in memory by the SPA. Sent as `Authorization: Bearer`. Claims: `sub`, `role`, `typ: "access"`.                                                                                                                        |
| Refresh token      | 32 random bytes in an `httpOnly`, `Secure` (production), `SameSite=Strict` cookie scoped to `/api/v1/auth`. Stored hashed. Rotated on every use; reuse revokes the family.                                                                             |
| CSRF               | Only `/auth/refresh` and `/auth/logout` read the cookie, and both require the `x-studywidbuddy-csrf` header. A cross-site page can't add custom headers without a CORS preflight, which the origin allowlist rejects. All other routes ignore cookies. |
| Email tokens       | Single-use, SHA-256 stored, 24 h (verification) / 1 h (reset). Reset revokes every session. `forgot-password` always returns 204.                                                                                                                      |
| Email verification | Required before applying to projects (applications start paid AI interviews). Not required to learn.                                                                                                                                                   |

## Authorization

- A global guard requires a valid access token on every route unless it is explicitly `@Public()`.
- Ownership is checked in services, not controllers. Another user's enrollment, application or private profile returns **404**, so existence isn't leaked.
- Profile visibility (`PUBLIC` / `CONNECTIONS` / `PRIVATE`) is enforced server-side. Until connections exist, `CONNECTIONS` behaves like `PRIVATE`.
- Client guards only decide which screen to show.

## Input and output

- Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`: unknown fields are rejected, which blocks mass assignment (e.g. sending `role: "ADMIN"`).
- Prisma parameterises every query; the only raw SQL uses tagged templates.
- Responses are mapped DTOs; password hashes and token hashes never leave the service layer.
- One exception filter shapes every error as `{ error: { code, message, details? } }` and logs 5xx stack traces server-side only.
- Angular escapes all interpolation; no `innerHTML` with user content.

## Abuse limits

`@nestjs/throttler`: 120 requests/minute per IP by default; 10/minute on login, register, verify and reset; 5/minute on forgot-password; 3/minute on resend-verification.

## Headers and transport

`helmet` defaults on the API; CORS allowlist from `WEB_ORIGIN`; nginx (container build) adds `nosniff` and a strict referrer policy. TLS terminates in front of the containers in any real deployment.

## Secrets

Only environment variables. `apps/api/.env.example` documents each one; `.env` files are gitignored. The API refuses to boot with a missing or short `JWT_ACCESS_SECRET`.
