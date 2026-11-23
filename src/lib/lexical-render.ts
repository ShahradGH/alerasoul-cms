/**
 * Deterministic Lexical JSON -> HTML serialiser for articles created via Payload Admin.
 * Supports paragraphs, headings, lists, links, blockquotes, code blocks, horizontal rules,
 * inline media uploads, tables, and full text bitmask formatting with strict HTML escaping.
 */

import { resolveMediaPublicUrl, type MediaLike } from './media-url'

interface LexicalUploadValue extends MediaLike {
  id?: number | string
  caption?: string | null
  mimeType?: string | null
  width?: number | null
  height?: number | null
}

interface LexicalNode {
  type?: string
  tag?: string
  text?: string
  format?: number | string
  url?: string
  listType?: string
  headerState?: number
  colSpan?: number
  rowSpan?: number
  relationTo?: string
  value?: LexicalUploadValue | number | string | null
  children?: LexicalNode[]
  fields?: {
    url?: string
    alt?: string
    caption?: string
  }
}

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 1 << 1
const FORMAT_STRIKETHROUGH = 1 << 2
const FORMAT_UNDERLINE = 1 << 3
const FORMAT_CODE = 1 << 4
const FORMAT_SUBSCRIPT = 1 << 5
const FORMAT_SUPERSCRIPT = 1 << 6

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSafeHttpOrRelativeUrl(rawUrl: string): boolean {
  return /^https?:\/\/|^\//i.test(rawUrl.trim())
}

function formatTextNode(text: string, format: number | string | undefined): string {
  let out = escapeHtml(text)
  if (typeof format === 'string') {
    const f = format.toLowerCase()
    if (f === 'code') return `<code class="sov-inline-code">${out}</code>`
    if (f === 'bold') return `<strong>${out}</strong>`
    if (f === 'italic') return `<em>${out}</em>`
    if (f === 'underline') return `<u>${out}</u>`
    if (f === 'strikethrough') return `<s>${out}</s>`
    if (f === 'subscript') return `<sub>${out}</sub>`
    if (f === 'superscript') return `<sup>${out}</sup>`
    return out
  }

  const fmt = typeof format === 'number' ? format : 0
  if (fmt & FORMAT_CODE) out = `<code class="sov-inline-code">${out}</code>`
  if (fmt & FORMAT_BOLD) out = `<strong>${out}</strong>`
  if (fmt & FORMAT_ITALIC) out = `<em>${out}</em>`
  if (fmt & FORMAT_UNDERLINE) out = `<u>${out}</u>`
  if (fmt & FORMAT_STRIKETHROUGH) out = `<s>${out}</s>`
  if (fmt & FORMAT_SUBSCRIPT) out = `<sub>${out}</sub>`
  if (fmt & FORMAT_SUPERSCRIPT) out = `<sup>${out}</sup>`
  return out
}

function renderUploadNode(node: LexicalNode): string {
  const valueObj =
    node.value && typeof node.value === 'object' ? (node.value as LexicalUploadValue) : null
  if (!valueObj) return ''

  const resolvedUrl = resolveMediaPublicUrl(valueObj)
  if (!resolvedUrl || !isSafeHttpOrRelativeUrl(resolvedUrl)) return ''

  const safeSrc = escapeHtml(resolvedUrl)
  const altRaw = node.fields?.alt || valueObj.alt || valueObj.filename || ''
  const safeAlt = escapeHtml(altRaw)
  const captionRaw = node.fields?.caption || valueObj.caption || ''
  const captionHtml = captionRaw.trim()
    ? `<figcaption>${escapeHtml(captionRaw.trim())}</figcaption>`
    : ''

  const isPdf =
    valueObj.mimeType === 'application/pdf' ||
    resolvedUrl.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    const label = safeAlt || 'View Document (PDF)'
    return `<figure class="sov-media-figure"><a href="${safeSrc}" target="_blank" rel="noopener noreferrer">${label}</a>${captionHtml}</figure>`
  }

  const widthAttr =
    typeof valueObj.width === 'number' && valueObj.width > 0 ? ` width="${valueObj.width}"` : ''
  const heightAttr =
    typeof valueObj.height === 'number' && valueObj.height > 0 ? ` height="${valueObj.height}"` : ''

  return `<figure class="sov-media-figure"><img src="${safeSrc}" alt="${safeAlt}"${widthAttr}${heightAttr} loading="lazy" />${captionHtml}</figure>`
}

function renderTableCell(cell: LexicalNode): string {
  const isHeader = typeof cell.headerState === 'number' && cell.headerState > 0
  const tag = isHeader ? 'th' : 'td'
  const attrs: string[] = []
  if (typeof cell.colSpan === 'number' && cell.colSpan > 1) {
    attrs.push(`colspan="${Math.floor(cell.colSpan)}"`)
  }
  if (typeof cell.rowSpan === 'number' && cell.rowSpan > 1) {
    attrs.push(`rowspan="${Math.floor(cell.rowSpan)}"`)
  }
  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
  const inner = Array.isArray(cell.children) ? cell.children.map(renderNode).join('') : ''
  return `<${tag}${attrStr}>${inner}</${tag}>`
}

function renderTableNode(node: LexicalNode): string {
  const rows = Array.isArray(node.children)
    ? node.children.filter((c) => c && c.type === 'tablerow')
    : []
  if (rows.length === 0) return ''

  const headerRows: string[] = []
  const bodyRows: string[] = []
  let inHeaderSection = true

  for (const row of rows) {
    const cells = Array.isArray(row.children)
      ? row.children.filter((c) => c && c.type === 'tablecell')
      : []
    const rowHtml = `<tr>${cells.map(renderTableCell).join('')}</tr>`
    const allCellsHeader =
      cells.length > 0 && cells.every((c) => typeof c.headerState === 'number' && c.headerState > 0)

    if (inHeaderSection && allCellsHeader) {
      headerRows.push(rowHtml)
    } else {
      inHeaderSection = false
      bodyRows.push(rowHtml)
    }
  }

  const thead = headerRows.length > 0 ? `<thead>${headerRows.join('')}</thead>` : ''
  const tbody = bodyRows.length > 0 ? `<tbody>${bodyRows.join('')}</tbody>` : ''
  return `<div class="sovereign-table-wrap"><table>${thead}${tbody}</table></div>`
}

function renderNode(node: LexicalNode): string {
  if (!node || typeof node !== 'object') return ''

  if (node.type === 'text') {
    return formatTextNode(node.text || '', node.format)
  }

  if (node.type === 'linebreak') return '<br />'
  if (node.type === 'tab') return '&emsp;'
  if (node.type === 'horizontalrule') return '<hr />'
  if (node.type === 'upload') return renderUploadNode(node)
  if (node.type === 'table') return renderTableNode(node)

  const childrenHtml = Array.isArray(node.children) ? node.children.map(renderNode).join('') : ''

  switch (node.type) {
    case 'root':
      return childrenHtml
    case 'paragraph':
      return childrenHtml ? `<p class="sov-article-p">${childrenHtml}</p>` : ''
    case 'heading': {
      const tag = /^h[1-6]$/.test(node.tag || '') ? node.tag : 'h2'
      return `<${tag} class="sov-article-heading">${childrenHtml}</${tag}>`
    }
    case 'quote':
      return `<blockquote class="sov-quote">${childrenHtml}</blockquote>`
    case 'list': {
      const listTag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${listTag}>${childrenHtml}</${listTag}>`
    }
    case 'listitem':
      return `<li>${childrenHtml}</li>`
    case 'link':
    case 'autolink': {
      const href = node.fields?.url || node.url || '#'
      const safeHref = isSafeHttpOrRelativeUrl(href) ? escapeHtml(href) : '#'
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${childrenHtml}</a>`
    }
    case 'code':
      return `<pre><code>${childrenHtml}</code></pre>`
    case 'tablerow':
      return `<tr>${childrenHtml}</tr>`
    case 'tablecell':
      return renderTableCell(node)
    default:
      return childrenHtml
  }
}

export function renderLexicalToHtml(lexicalRoot: unknown): string {
  if (!lexicalRoot || typeof lexicalRoot !== 'object') return ''
  const root = (lexicalRoot as { root?: LexicalNode }).root
  if (!root) return ''
  return renderNode(root)
}
