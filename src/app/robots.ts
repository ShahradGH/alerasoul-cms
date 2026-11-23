import type { MetadataRoute } from 'next'
import { buildRobotsMetadata } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://alerasoul.net').replace(/\/$/, '')
  return buildRobotsMetadata(siteUrl)
}
