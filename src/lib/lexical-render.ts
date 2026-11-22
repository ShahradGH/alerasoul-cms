/**
 * Minimal deterministic Lexical JSON -> HTML serializer for articles created via Payload Admin.
 * Preserves full fidelity for paragraphs, headings, lists, links, blockquotes, and code blocks.
 */

interface LexicalNode {
  type?: string
  tag?: string
  text?: string
  format?: number | string
  url?: string
  listType?: string
  children?: LexicalNode[]
  fields?: {
    url?: string
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderNode(node: LexicalNode): string {
  if (!node || typeof node !== 'object') return ''

  if (node.type === 'text') {
    let out = escapeHtml(node.text || '')
    const fmt = typeof node.format === 'number' ? node.format : 0
    if (fmt & 16) out = `<code class="sov-inline-code">${out}</code>`
    if (fmt & 1) out = `<strong>${out}</strong>`
    if (fmt & 2) out = `<em>${out}</em>`
    return out
  }

  if (node.type === 'linebreak') return '<br />'

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
      const safeHref = /^https?:\/\/|^\//i.test(href) ? escapeHtml(href) : '#'
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${childrenHtml}</a>`
    }
    case 'code':
      return `<pre><code>${childrenHtml}</code></pre>`
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
