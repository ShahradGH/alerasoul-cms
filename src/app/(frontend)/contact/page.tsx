import React from 'react'
import type { Metadata } from 'next'
import { ContactForm } from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'Contact Shahrad Alerasoul',
  description: 'Verified inquiry form protected by Cloudflare Turnstile.',
}

export default function ContactPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

  return (
    <div className="sov-article-shell">
      <header className="sov-article-header">
        <div className="sov-cat-badge" style={{ display: 'inline-block', marginBottom: '12px' }}>
          Verified Inquiry Channel
        </div>
        <h1 className="sov-article-title">Contact Shahrad Alerasoul</h1>
        <p style={{ color: 'var(--sov-text-muted)', lineHeight: 1.7 }}>
          Reach out directly regarding enterprise Azure architecture, sovereign AI governance, or engineering research.
          Protected edge-side by Cloudflare Turnstile.
        </p>
      </header>
      <ContactForm siteKey={siteKey} />
    </div>
  )
}
