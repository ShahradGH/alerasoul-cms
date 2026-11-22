export interface MediaLike {
  url?: string | null
  filename?: string | null
  prefix?: string | null
  alt?: string | null
}

export function resolveMediaPublicUrl(media: MediaLike | number | string | null | undefined): string | null {
  if (!media || typeof media === 'number' || typeof media === 'string') return null
  if (media.prefix && media.prefix.startsWith('wp-content/uploads') && media.filename) {
    return `/${media.prefix.replace(/\/$/, '')}/${media.filename}`
  }
  if (media.url) return media.url
  if (media.filename) return `/api/media/file/${encodeURIComponent(media.filename)}`
  return null
}

export function formatUtcEditorialDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getUTCDate()
  const month = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  const year = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} at ${hh}:${mm} UTC`
}
