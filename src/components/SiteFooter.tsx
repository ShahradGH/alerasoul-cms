import Link from 'next/link'
import React from 'react'

export function SiteFooter() {
  return (
    <footer className="sov-footer">
      <div className="sov-footer-inner">
        <div>&copy; {new Date().getUTCFullYear()} Shahrad Alerasoul &mdash; Principal Azure Infrastructure Architect</div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Link href="/privacy/">Privacy Policy</Link>
          <Link href="/contact/">Contact</Link>
          <Link href="/feed/" prefetch={false}>RSS Feed</Link>
          <a href="https://github.com/ShahradGH" target="_blank" rel="noopener noreferrer">
            GitHub (@ShahradGH)
          </a>
          <a href="https://www.linkedin.com/in/shahradalerasoul/" target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  )
}
