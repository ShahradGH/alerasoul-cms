import React from 'react'
import type { Metadata } from 'next'
import './styles.css'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeAndEnhancements } from '@/components/ThemeAndEnhancements'

export const metadata: Metadata = {
  title: {
    default: 'Shahrad Alerasoul — Sovereign Cloud & Enterprise Architecture',
    template: '%s | Shahrad Alerasoul',
  },
  description:
    'Principal Azure Infrastructure Architect — Sovereign Cloud Platforms, AI Control Planes, Microsoft Graph v2.x & Deterministic Verification.',
  alternates: {
    types: {
      'application/rss+xml': 'https://alerasoul.net/feed/',
    },
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sov_theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <SiteHeader />
        <main className="sov-container">{children}</main>
        <SiteFooter />
        <ThemeAndEnhancements />
      </body>
    </html>
  )
}
