/**
 * Deterministic tag slug helpers shared across cards, tag archives, and edge cache purging.
 */

export function slugifyTag(rawTag: string): string {
  return String(rawTag || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
