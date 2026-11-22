/**
 * WordPress-compatible RSS 2.0 feed builder for `/feed/`.
 */

export interface RssPostItem {
  title: string
  slug: string
  publishedAt?: string | null
  excerpt?: string | null
  html?: string | null
  categories?: Array<{ name?: string | null }>
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeCdata(str: string): string {
  return String(str || '').replace(/]]>/g, ']]]]><![CDATA[>')
}

export function buildRssFeedXml({
  posts,
  siteUrl = 'https://alerasoul.net',
}: {
  posts: RssPostItem[]
  siteUrl?: string
}): string {
  const cleanSiteUrl = siteUrl.replace(/\/$/, '')
  const lastBuildDate =
    posts[0]?.publishedAt && !Number.isNaN(Date.parse(posts[0].publishedAt))
      ? new Date(posts[0].publishedAt).toUTCString()
      : new Date().toUTCString()

  const itemsXml = posts
    .map((p) => {
      const link = `${cleanSiteUrl}/${p.slug}/`
      const pubDate =
        p.publishedAt && !Number.isNaN(Date.parse(p.publishedAt))
          ? new Date(p.publishedAt).toUTCString()
          : lastBuildDate
      const catXml = (p.categories || [])
        .map((c) => (c?.name ? `      <category><![CDATA[${escapeCdata(c.name)}]]></category>\n` : ''))
        .join('')
      const description = p.excerpt || ''
      const contentEncoded = p.html || `<p>${escapeXml(description)}</p>`

      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <dc:creator><![CDATA[Shahrad Alerasoul]]></dc:creator>
${catXml}      <description><![CDATA[${escapeCdata(description)}]]></description>
      <content:encoded><![CDATA[${escapeCdata(contentEncoded)}]]></content:encoded>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Shahrad Alerasoul</title>
    <atom:link href="${escapeXml(cleanSiteUrl)}/feed/" rel="self" type="application/rss+xml" />
    <link>${escapeXml(cleanSiteUrl)}/</link>
    <description>Principal Azure Infrastructure Architect — Sovereign Cloud Platforms, AI Control Planes &amp; Deterministic Engineering</description>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <language>en-GB</language>
${itemsXml}
  </channel>
</rss>
`
}
