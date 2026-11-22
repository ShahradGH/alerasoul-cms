#!/usr/bin/env node
/**
 * Deterministic WordPress -> Cloudflare D1 Migrator (`alerasoul_cms`).
 * - Generates clean SQLite SQL in `tmp-export/migrate-content.sql` (never committed)
 * - Executes via `wrangler d1 execute alerasoul_cms --remote --file=...` in seconds
 * - Provisions scoped `mvpfoundry-publisher` API user via Payload Local API and stores
 *   `PAYLOAD_CMS_API_KEY` strictly in gitignored `C:\Work\Repo\shwebsites\.env`.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'

const LOCAL_ENV_PATH = path.resolve(process.cwd(), '.env')
const SHWEBSITES_ENV_PATH = 'C:\\Work\\Repo\\shwebsites\\.env'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function upsertEnvKey(filePath, key, value) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${key}=${value}\n`, 'utf8')
    return
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  let replaced = false
  const updated = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      replaced = true
      return `${key}=${value}`
    }
    return line
  })
  if (!replaced) {
    if (updated.length > 0 && updated[updated.length - 1] !== '') {
      updated.push(`${key}=${value}`)
    } else if (updated.length > 0) {
      updated[updated.length - 1] = `${key}=${value}`
      updated.push('')
    } else {
      updated.push(`${key}=${value}`)
    }
  }
  fs.writeFileSync(filePath, updated.join('\n'), 'utf8')
}

function sqlLit(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL'
  return `'${String(val).replace(/'/g, "''")}'`
}

function decodeHtmlEntities(input) {
  if (!input) return ''
  return String(input)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
}

function rewriteLegacyHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/https?:\/\/(?:www\.)?alerasoul\.net\/wp-content\/uploads\//gi, '/wp-content/uploads/')
    .trim()
}

function extractCleanExcerpt(html, existingExcerpt, maxLen = 180) {
  const src = existingExcerpt && existingExcerpt.trim() ? existingExcerpt : html
  const plain = decodeHtmlEntities(String(src || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= maxLen) return plain
  const cut = plain.slice(0, maxLen)
  const sp = cut.lastIndexOf(' ')
  return (sp > 100 ? cut.slice(0, sp) : cut) + '...'
}

function computeReadingTime(html) {
  const plain = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = plain ? plain.split(' ').length : 0
  return Math.max(1, Math.ceil(words / 220))
}

function guessMime(filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.ico': 'image/x-icon',
  }
  return map[ext] || 'application/octet-stream'
}

function parsePhpImageDims(rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'string') return { width: null, height: null }
  const wMatch = rawMeta.match(/s:5:"width";i:(\d+);/)
  const hMatch = rawMeta.match(/s:6:"height";i:(\d+);/)
  return {
    width: wMatch ? Number(wMatch[1]) : null,
    height: hMatch ? Number(hMatch[1]) : null,
  }
}

async function d1Query(accountId, d1Id, token, sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${d1Id}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(json.errors || json)}`)
  }
  return json.result?.[0] || { results: [] }
}

async function main() {
  loadEnvFile(LOCAL_ENV_PATH)
  loadEnvFile(SHWEBSITES_ENV_PATH)

  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim()
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  const d1Id = (process.env.CLOUDFLARE_D1_ID || '').trim()
  if (!token || !accountId || !d1Id) {
    throw new Error('Missing CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, or CLOUDFLARE_D1_ID')
  }

  const exportPath = path.resolve(process.cwd(), 'tmp-export', 'wp_export.jsonl')
  const uploadsRoot = path.resolve(process.cwd(), 'tmp-export', 'uploads')
  if (!fs.existsSync(exportPath)) throw new Error(`Missing ${exportPath}`)

  const lines = fs.readFileSync(exportPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse)
  const postsRows = lines.filter((x) => x.kind === 'post')
  const metaRows = lines.filter((x) => x.kind === 'postmeta')
  const termRels = lines.filter((x) => x.kind === 'term_rel')

  const metaByPost = new Map()
  for (const m of metaRows) {
    if (!metaByPost.has(m.post_id)) metaByPost.set(m.post_id, {})
    metaByPost.get(m.post_id)[m.meta_key] = m.meta_value
  }

  const sqlStatements = []
  const nowIso = new Date().toISOString()

  // 1. Canonical Categories (IDs 1..3)
  const canonicalCategories = [
    {
      id: 1,
      slug: 'enterprise-architecture',
      name: 'Enterprise Architecture & AI',
      description: 'Enterprise Azure, AI Control Planes, Infrastructure Architecture & Falsifiable Engineering Decisions',
    },
    {
      id: 2,
      slug: 'personal',
      name: 'Personal',
      description: 'Engineering reflections and personal perspectives.',
    },
    {
      id: 3,
      slug: 'psychology',
      name: 'Psychology',
      description: 'Systems thinking, cognitive biases, and human-agent decision boundaries.',
    },
  ]
  const catIdBySlug = new Map()
  for (const c of canonicalCategories) {
    sqlStatements.push(
      `INSERT INTO categories (id, name, slug, description, created_at, updated_at) VALUES (${sqlLit(c.id)}, ${sqlLit(c.name)}, ${sqlLit(c.slug)}, ${sqlLit(c.description)}, ${sqlLit(nowIso)}, ${sqlLit(nowIso)}) ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at;`,
    )
    catIdBySlug.set(c.slug, c.id)
  }

  // 2. All 891 Media attachments
  const attachments = postsRows.filter((p) => p.post_type === 'attachment')
  const validMediaIds = new Set()
  for (const att of attachments) {
    const pm = metaByPost.get(att.ID) || {}
    const rel = pm._wp_attached_file
    if (!rel) continue
    const cleanRel = rel.replace(/\\/g, '/').replace(/^\/+/, '')
    const dir = path.posix.dirname(cleanRel)
    const filename = path.posix.basename(cleanRel)
    const prefix = dir && dir !== '.' ? `wp-content/uploads/${dir}` : 'wp-content/uploads'
    const diskPath = path.join(uploadsRoot, cleanRel)
    const filesize = fs.existsSync(diskPath) ? fs.statSync(diskPath).size : 0
    const { width, height } = parsePhpImageDims(pm._wp_attachment_metadata)
    const alt = decodeHtmlEntities(pm._wp_attachment_image_alt || att.post_title || filename).trim() || filename
    const caption = decodeHtmlEntities(att.post_excerpt || '').trim() || null
    const mime = guessMime(filename)
    const url = `/api/media/file/${encodeURIComponent(filename)}`
    const createdAt = att.post_date_gmt || nowIso
    const updatedAt = att.post_modified_gmt || createdAt

    sqlStatements.push(
      `INSERT INTO media (id, alt, caption, prefix, _objectkey, url, filename, mime_type, filesize, width, height, created_at, updated_at) VALUES (${sqlLit(att.ID)}, ${sqlLit(alt)}, ${sqlLit(caption)}, ${sqlLit(prefix)}, NULL, ${sqlLit(url)}, ${sqlLit(filename)}, ${sqlLit(mime)}, ${sqlLit(filesize)}, ${sqlLit(width)}, ${sqlLit(height)}, ${sqlLit(createdAt)}, ${sqlLit(updatedAt)}) ON CONFLICT(filename) DO UPDATE SET alt = excluded.alt, caption = excluded.caption, prefix = excluded.prefix, url = excluded.url, mime_type = excluded.mime_type, filesize = excluded.filesize, width = excluded.width, height = excluded.height, updated_at = excluded.updated_at;`,
    )
    validMediaIds.add(att.ID)
  }

  // 3. All 11 published + 30 scheduled posts
  const wpPosts = postsRows.filter(
    (p) => p.post_type === 'post' && (p.post_status === 'publish' || p.post_status === 'future'),
  )
  let pubCount = 0
  let schedCount = 0
  for (const post of wpPosts) {
    const pm = metaByPost.get(post.ID) || {}
    const status = post.post_status === 'publish' ? 'published' : 'scheduled'
    if (status === 'published') pubCount++
    else schedCount++

    const title = decodeHtmlEntities(post.post_title).trim()
    const slug = String(post.post_name || '').trim()
    const legacyHtml = rewriteLegacyHtml(post.post_content)
    const excerpt = extractCleanExcerpt(legacyHtml, post.post_excerpt)
    const publishedAt = post.post_date_gmt || nowIso
    const updatedAt = post.post_modified_gmt || publishedAt
    const readingTimeMinutes = computeReadingTime(legacyHtml)
    const thumbRaw = pm._thumbnail_id ? Number(pm._thumbnail_id) : null
    const featuredImageId = thumbRaw && validMediaIds.has(thumbRaw) ? thumbRaw : null
    const ghMatch = legacyHtml.match(/https:\/\/github\.com\/ShahradGH\/[A-Za-z0-9_.-]+/)
    const githubRepoUrl = ghMatch ? ghMatch[0] : null
    const seoTitle = decodeHtmlEntities(pm._yoast_wpseo_title || pm.rank_math_title || title)
    const seoDesc = decodeHtmlEntities(pm._yoast_wpseo_metadesc || pm.rank_math_description || excerpt)

    sqlStatements.push(
      `INSERT INTO posts (id, title, slug, status, published_at, excerpt, legacy_html, featured_image_id, github_repo_url, seo_meta_title, seo_meta_description, reading_time_minutes, created_at, updated_at) VALUES (${sqlLit(post.ID)}, ${sqlLit(title)}, ${sqlLit(slug)}, ${sqlLit(status)}, ${sqlLit(publishedAt)}, ${sqlLit(excerpt)}, ${sqlLit(legacyHtml)}, ${sqlLit(featuredImageId)}, ${sqlLit(githubRepoUrl)}, ${sqlLit(seoTitle)}, ${sqlLit(seoDesc)}, ${sqlLit(readingTimeMinutes)}, ${sqlLit(publishedAt)}, ${sqlLit(updatedAt)}) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, status = excluded.status, published_at = excluded.published_at, excerpt = excluded.excerpt, legacy_html = excluded.legacy_html, featured_image_id = excluded.featured_image_id, github_repo_url = excluded.github_repo_url, seo_meta_title = excluded.seo_meta_title, seo_meta_description = excluded.seo_meta_description, reading_time_minutes = excluded.reading_time_minutes, updated_at = excluded.updated_at;`,
    )

    sqlStatements.push(`DELETE FROM posts_rels WHERE parent_id = ${sqlLit(post.ID)} AND path = 'categories';`)
    const postCats = termRels
      .filter((r) => r.object_id === post.ID && r.taxonomy === 'category')
      .map((r) => catIdBySlug.get(r.slug))
      .filter(Boolean)
    const finalCats = postCats.length > 0 ? [...new Set(postCats)] : [1]
    for (let idx = 0; idx < finalCats.length; idx++) {
      sqlStatements.push(
        `INSERT INTO posts_rels ("order", parent_id, path, categories_id) VALUES (${idx + 1}, ${sqlLit(post.ID)}, 'categories', ${sqlLit(finalCats[idx])});`,
      )
    }

    sqlStatements.push(`DELETE FROM posts_tags WHERE _parent_id = ${sqlLit(post.ID)};`)
    const postTags = termRels
      .filter((r) => r.object_id === post.ID && r.taxonomy === 'post_tag')
      .map((r) => decodeHtmlEntities(r.name).trim())
      .filter(Boolean)
    for (let idx = 0; idx < postTags.length; idx++) {
      const rowId = crypto.createHash('sha1').update(`${post.ID}:tag:${idx}:${postTags[idx]}`).digest('hex').slice(0, 24)
      sqlStatements.push(
        `INSERT INTO posts_tags (_order, _parent_id, id, tag) VALUES (${idx + 1}, ${sqlLit(post.ID)}, ${sqlLit(rowId)}, ${sqlLit(postTags[idx])});`,
      )
    }
  }

  // 4. All 3 published pages
  const wpPages = postsRows.filter((p) => p.post_type === 'page' && p.post_status === 'publish')
  for (const pg of wpPages) {
    const title = decodeHtmlEntities(pg.post_title).trim()
    const slug = String(pg.post_name || '').trim()
    const legacyHtml = rewriteLegacyHtml(pg.post_content)
    const excerpt = extractCleanExcerpt(legacyHtml, '', 160)
    const createdAt = pg.post_date_gmt || nowIso
    const updatedAt = pg.post_modified_gmt || createdAt

    sqlStatements.push(
      `INSERT INTO pages (id, title, slug, status, legacy_html, seo_meta_title, seo_meta_description, created_at, updated_at) VALUES (${sqlLit(pg.ID)}, ${sqlLit(title)}, ${sqlLit(slug)}, 'published', ${sqlLit(legacyHtml)}, ${sqlLit(title)}, ${sqlLit(excerpt)}, ${sqlLit(createdAt)}, ${sqlLit(updatedAt)}) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, status = excluded.status, legacy_html = excluded.legacy_html, seo_meta_title = excluded.seo_meta_title, seo_meta_description = excluded.seo_meta_description, updated_at = excluded.updated_at;`,
    )
  }

  const sqlPath = path.resolve(process.cwd(), 'tmp-export', 'migrate-content.sql')
  fs.writeFileSync(sqlPath, sqlStatements.join('\n') + '\n', 'utf8')
  console.log(`Generated ${sqlStatements.length} SQL statements (${validMediaIds.size} media, ${pubCount} published posts, ${schedCount} scheduled posts, ${wpPages.length} pages).`)

  console.log('Executing SQL batch against remote D1 alerasoul_cms...')
  execSync(`pnpm exec wrangler d1 execute alerasoul_cms --remote --file="${sqlPath}" --yes`, {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId },
    stdio: 'inherit',
  })

  // 5. Provision admin & scoped publisher user via Payload Local API
  process.env.PAYLOAD_MIGRATING = '1'
  process.env.NODE_ENV = 'production'
  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('../src/payload.config.ts')
  const payload = await getPayload({ config: payloadConfig })

  const adminEmail = 'shahrad@alerasoul.net'
  const existingAdmins = await payload.find({
    collection: 'users',
    where: { email: { equals: adminEmail } },
    limit: 1,
    overrideAccess: true,
  })
  if (existingAdmins.totalDocs === 0) {
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: adminEmail,
        name: 'Shahrad Alerasoul',
        role: 'admin',
        password: crypto.randomBytes(24).toString('base64url'),
      },
    })
    console.log('Provisioned admin user:', adminEmail)
  }

  const publisherEmail = 'mvpfoundry-publisher@alerasoul.net'
  const apiKey = crypto.randomBytes(32).toString('hex')
  const existingPublishers = await payload.find({
    collection: 'users',
    where: { email: { equals: publisherEmail } },
    limit: 1,
    overrideAccess: true,
  })
  if (existingPublishers.totalDocs === 0) {
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: publisherEmail,
        name: 'MVPFoundry Publisher',
        role: 'publisher',
        password: crypto.randomBytes(24).toString('base64url'),
        enableAPIKey: true,
        apiKey,
      },
    })
    console.log('Provisioned scoped publisher API user.')
  } else {
    await payload.update({
      collection: 'users',
      id: existingPublishers.docs[0].id,
      overrideAccess: true,
      data: {
        enableAPIKey: true,
        apiKey,
      },
    })
    console.log('Rotated API key for scoped publisher user.')
  }

  upsertEnvKey(SHWEBSITES_ENV_PATH, 'PAYLOAD_CMS_API_KEY', apiKey)
  console.log('Stored PAYLOAD_CMS_API_KEY securely in C:\\Work\\Repo\\shwebsites\\.env.')

  // 6. Final verification counts from remote D1
  const counts = await d1Query(
    accountId,
    d1Id,
    token,
    `SELECT
       (SELECT COUNT(*) FROM categories) AS categories,
       (SELECT COUNT(*) FROM media) AS media,
       (SELECT COUNT(*) FROM posts WHERE status = 'published') AS posts_published,
       (SELECT COUNT(*) FROM posts WHERE status = 'scheduled') AS posts_scheduled,
       (SELECT COUNT(*) FROM pages WHERE status = 'published') AS pages_published,
       (SELECT COUNT(*) FROM users) AS users`,
  )
  console.log('Final D1 verification counts:', JSON.stringify(counts.results?.[0] || {}))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
