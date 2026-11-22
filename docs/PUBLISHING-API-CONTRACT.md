# Publishing API Contract (`alerasoul-cms` v1)

Canonical REST contract for automated publishing clients (e.g. `payloadPublisher.js`) integrating with **Payload CMS v3** running on Cloudflare Workers, D1, and R2 at `https://alerasoul.net`.

Machine-readable JSON Schema: [`docs/publishing-api-contract.schema.json`](./publishing-api-contract.schema.json).

---

## 1. Base URL & Authentication

- **Base URL**: `https://alerasoul.net`
- **Authentication Header**:
  ```http
  Authorization: users API-Key <PAYLOAD_CMS_API_KEY>
  ```
- **Scoped Service Account**: `mvpfoundry-publisher` (`role: "publisher"` in `users` collection, API-Key enabled).
- **Access Isolation**:
  - Unauthenticated `GET /api/posts` returns **only** documents where `status === "published"`.
  - Authenticated `Authorization: users API-Key <key>` requests can read, create, and update `draft`, `scheduled`, and `published` posts as well as upload `media`.

---

## 2. Deterministic Categories

Seeded in D1 `categories` table with deterministic IDs and WordPress-equivalent slugs:

| Category ID | Slug | Display Name | Archive Route |
| :---: | :--- | :--- | :--- |
| `1` | `enterprise-architecture` | Enterprise Architecture & AI | `/category/enterprise-architecture/` |
| `2` | `personal` | Personal | `/category/personal/` |
| `3` | `psychology` | Psychology | `/category/psychology/` |

Clients may also verify IDs dynamically via `GET /api/categories?limit=20`.

---

## 3. Media Upload (`POST /api/media`)

Uploads binary assets (`.png`, `.webp`, `.svg`, `.jpg`, `.pdf`) directly to Cloudflare R2 (`alerasoul-cms-media`) via Payload Media collection.

- **Endpoint**: `POST /api/media`
- **Headers**:
  - `Authorization: users API-Key <PAYLOAD_CMS_API_KEY>`
  - Do **not** set a static `Content-Type`; pass a standard `FormData` body so `fetch` generates the `multipart/form-data` boundary.
- **FormData Parts**:
  - `file`: Binary `Blob` or `File` with clean filename (e.g. `azure-stencil-architecture-topology.png`).
  - `_payload`: JSON string:
    ```json
    {
      "alt": "Descriptive alt text for accessibility",
      "caption": "Optional caption"
    }
    ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "message": "Media successfully created.",
    "doc": {
      "id": 892,
      "alt": "Descriptive alt text for accessibility",
      "filename": "azure-stencil-architecture-topology.png",
      "mimeType": "image/png",
      "filesize": 184220,
      "url": "/api/media/file/azure-stencil-architecture-topology.png"
    }
  }
  ```
- **Legacy Media Compatibility**: All migrated WordPress attachments remain served at `/wp-content/uploads/<YYYY>/<MM>/<filename>` directly from R2 (`HTTP 200`, `Cache-Control: public, max-age=31536000, immutable`).

---

## 4. Upsert Lookup, Create & Update Posts

### 4.1 Lookup Existing Post by Slug
- **Endpoint**: `GET /api/posts?where[slug][equals]=<slug>&limit=1&depth=0`
- **Headers**: `Authorization: users API-Key <PAYLOAD_CMS_API_KEY>`
- Returns `{ docs: [...], totalDocs: 0 | 1 }`.

### 4.2 Create Post (`POST /api/posts`) / Update Post (`PATCH /api/posts/:id`)
- **Headers**:
  - `Authorization: users API-Key <PAYLOAD_CMS_API_KEY>`
  - `Content-Type: application/json`
- **JSON Request Body**:
  ```json
  {
    "title": "Authority Before Capability: Enterprise Agent Identity Graph",
    "slug": "authority-before-capability-enterprise-agent-identity-graph",
    "status": "scheduled",
    "publishedAt": "2026-12-01T08:00:00.000Z",
    "excerpt": "Plain-text summary capped at ~160-240 characters.",
    "legacyHtml": "<p class=\"sov-article-p\">Compiled clean HTML article body...</p>",
    "categories": [1],
    "tags": [
      { "tag": "Enterprise Architecture" },
      { "tag": "Azure" },
      { "tag": "AI Control Planes" }
    ],
    "featuredImage": 892,
    "githubRepoUrl": "https://github.com/ShahradGH/enterprise-agent-identity-graph",
    "seo": {
      "metaTitle": "Authority Before Capability: Enterprise Agent Identity Graph",
      "metaDescription": "Plain-text summary capped at ~160-240 characters."
    },
    "readingTimeMinutes": 6
  }
  ```

### 4.3 Field Rules & Server-Side Invariants
- **`status` Enum**: Strictly `"draft" | "scheduled" | "published"`.
  - `"scheduled"` requires an ISO-8601 UTC `publishedAt` timestamp. The Cloudflare Workers Cron trigger (`*/15 * * * *`) automatically promotes rows where `status = 'scheduled'` and `published_at <= now()` to `published`.
- **`slug` Policy (Silo Endeavours Invariant)**:
  - Must match `/%postname%/` kebab-case without leading internal sequence prefixes (`001-`, `idea-001-`). Server-side `beforeValidate` strips accidental Silo prefixes; edge middleware also issues permanent `301` redirects from legacy `^/00[1-9]-(.+)$` and `^/idea-\d{1,3}-(.+)$` paths to `/$1`.
- **Zero-Leak Server Guard**:
  - `beforeChange` rejects any payload containing non-RFC1918/non-RFC5737 public IPv4 literals or runtime-blocklisted internal domains.
- **`githubRepoUrl`**:
  - Optional; when provided must match `^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`. Rendered as a high-contrast CTA card on article pages and cards.
- **`featuredImage`**:
  - Integer `id` referencing a `media` document created via `POST /api/media`.

---

## 5. RSS Feed (`/feed/`) & Cache Semantics

- **Endpoint**: `GET /feed/` (and `/feed`)
- **Format**: RSS 2.0 XML (`Content-Type: application/rss+xml; charset=utf-8`), listing the 20 latest `published` posts sorted by `publishedAt DESC`.
- **Cache Headers**: `Cache-Control: public, max-age=300, s-maxage=300` (5-minute edge/browser TTL).
- **Visibility Guarantee**: Scheduled and draft posts are strictly excluded until `status === "published"`.

---

## 6. Contact Form Endpoint (`POST /api/contact`)

- **Endpoint**: `POST /api/contact`
- **Payload**: `{ "name": "...", "email": "...", "subject": "...", "message": "...", "turnstileToken": "..." }`
- **Behaviour**: Verifies `turnstileToken` server-side against `https://challenges.cloudflare.com/turnstile/v0/siteverify` using `TURNSTILE_SECRET_KEY`. Returns `403` on verification failure; persists verified submissions into `contact-submissions` (`201 Created`).
