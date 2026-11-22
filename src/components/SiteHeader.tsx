import Link from 'next/link'
import React from 'react'

export function SiteHeader() {
  return (
    <header className="sov-header">
      <div className="sov-header-inner">
        <Link href="/" className="sov-brand">
          Shahrad Alerasoul
        </Link>
        <nav className="sov-nav" aria-label="Primary Navigation">
          <Link href="/">Home</Link>
          <Link href="/category/enterprise-architecture/">Enterprise Architecture</Link>
          <Link href="/category/personal/">Personal</Link>
          <Link href="/category/psychology/">Psychology</Link>
          <Link href="/architecture/">Blueprints</Link>
          <Link href="/about/">About</Link>
          <Link href="/contact/">Contact</Link>
          <Link href="/feed/" prefetch={false}>RSS</Link>
        </nav>
      </div>
    </header>
  )
}
