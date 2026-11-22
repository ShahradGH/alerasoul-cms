'use client'

import Link from 'next/link'
import React, { useState } from 'react'

export function ShareAndAuthor({ canonicalUrl }: { canonicalUrl: string }) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonicalUrl)}`

  return (
    <>
      <div className="sov-share-bar">
        <span className="sov-share-label">Executive Action:</span>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="sov-share-btn-linkedin"
        >
          Share on LinkedIn
        </a>
        <button
          type="button"
          className="sov-share-btn-copy"
          onClick={() => {
            navigator.clipboard?.writeText(canonicalUrl).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? '✓ Link Copied' : 'Copy Link'}
        </button>
      </div>

      <div className="sov-author-card">
        <img
          className="sov-author-avatar"
          src="/wp-content/uploads/2023/08/cropped-IMG-20221202-WA0000-e1691959738559-270x270.jpg"
          alt="Shahrad Alerasoul"
        />
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div className="sov-author-name">Shahrad Alerasoul</div>
          <div className="sov-author-role">Principal Azure Infrastructure &amp; Cloud Platform Architect</div>
          <p className="sov-author-bio">
            Specialising in sovereign cloud platforms, multi-agent AI identity governance, and high-resilience
            enterprise systems across the UK &amp; EMEA.
          </p>
          <div className="sov-author-links">
            <a href="https://www.linkedin.com/in/shahradalerasoul/" target="_blank" rel="noopener noreferrer">
              LinkedIn Profile &rarr;
            </a>
            <a href="https://github.com/ShahradGH" target="_blank" rel="noopener noreferrer">
              GitHub (@ShahradGH) &rarr;
            </a>
            <Link href="/about/">Full Career Dossier &rarr;</Link>
          </div>
        </div>
      </div>

      <div className="sov-newsletter-cta">
        <div className="sov-newsletter-title">Sovereign Architecture &amp; Multi-Agent Intelligence Feed</div>
        <p className="sov-newsletter-text">
          Stay grounded with deterministic code runbooks, KQL diagnostic queries, and enterprise architecture
          decisions without corporate fluff. Subscribe via your preferred RSS reader or connect on LinkedIn.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            href="/feed/"
            prefetch={false}
            style={{
              background: '#00a8e8',
              color: '#0a1128',
              fontWeight: 700,
              padding: '8px 18px',
              borderRadius: '6px',
              fontSize: '0.9rem',
            }}
          >
            Subscribe via RSS &rarr;
          </Link>
          <a
            href="https://www.linkedin.com/in/shahradalerasoul/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              fontWeight: 600,
              padding: '8px 18px',
              borderRadius: '6px',
              fontSize: '0.9rem',
            }}
          >
            Connect on LinkedIn &rarr;
          </a>
        </div>
      </div>
    </>
  )
}
