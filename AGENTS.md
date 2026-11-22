# Sovereign Conductor & Cloudflare PaaS Operating Guidelines

Author: Shahrad Alerasoul | Platform: ShahradGH Sovereign Estate (`alerasoul-cms`)

---

## 1. Governance & Legal Compliance Engine

- **Personal Identity & Provenance**: All commits must use personal git credentials (`ShahradAlerasoul <4907864+ShahradGH@users.noreply.github.com>`). Never include employer keywords, active client identifiers, internal sequence numbers (`001`, `idea-XX`), secrets, tokens, or non-RFC1918/non-RFC5737 IPv4 literals.
- **Core Business Hours Compliance**: Commencing **30 November 2026**, commits and automated writes are prohibited during Monday–Friday `08:30–17:30 UK` local time.
- **Zero-Leak Server Guard**: `Posts` collection `beforeChange` hooks and `src/lib/zero-leak.ts` strictly reject payloads containing leaked internal endpoints or public IPv4 literals.
- **British English**: Author all repository documentation, commit messages, and technical prose in British English (`standardise`, `optimise`, `artefact`, `licence`).

---

## 2. Cloudflare Zero-VPS PaaS Architecture (`alerasoul.net`)

- **Production Runtime**: Official **Payload CMS v3** running on **Cloudflare Workers** (`@opennextjs/cloudflare`), **Cloudflare D1** (`alerasoul_cms` via `@payloadcms/db-d1-sqlite`), **Cloudflare R2** (`alerasoul-cms-media` via `@payloadcms/storage-r2`), and **Cloudflare Turnstile** (`POST /api/contact`).
- **Zero Trust & Non-Bypassable Edge Controls**: `wrangler.jsonc` MUST keep `"workers_dev": false` and `"preview_urls": false` so unauthenticated `*.workers.dev` preview URLs are never exposed. Admin routes (`/admin/*`) are governed by **Cloudflare Zero Trust Access** (Entra ID OIDC) while public blog routes and scoped `Authorization: users API-Key` endpoints remain accessible to automated publishers (`mvpfoundry`).
- **Workers Cron & Edge Middleware**:
  - Workers Cron (`*/15 * * * *`) promotes due `scheduled` posts to `published` (`src/lib/cron-publisher.ts`).
  - Edge middleware (`src/lib/edge-middleware.ts`) handles `www` → apex `301`, Silo Endeavours legacy prefix `301` redirects, WordPress probe blocking (`403`), and zero-404 `/wp-content/uploads/*` serving from R2.
- **Portability Escape Hatch**: `Dockerfile` (12 lines, starting with `# PORTABILITY_ESCAPE_HATCH_ONLY — Live production runs on Cloudflare Workers/PaaS`) supports portable Node.js 24 OCI execution (`pnpm start`) without altering CMS logic.
- **Deployment**: Run `pnpm run deploy` (`opennextjs-cloudflare build && opennextjs-cloudflare deploy` / `wrangler deploy`) or trigger `.github/workflows/deploy.yml`.
