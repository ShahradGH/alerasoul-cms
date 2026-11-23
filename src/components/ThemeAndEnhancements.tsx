'use client'

import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'

export function ThemeAndEnhancements() {
  const pathname = usePathname()
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)

    const controller = new AbortController()
    const { signal } = controller
    const injectedNodes: Element[] = []

    // Reading progress bar
    const progressEl = document.getElementById('sov-reading-progress')
    if (progressEl) {
      progressEl.style.width = '0%'
    }
    const onScroll = () => {
      if (!progressEl) return
      const total = document.documentElement.scrollHeight - window.innerHeight
      if (total > 0) {
        const pct = Math.min(100, Math.max(0, (window.scrollY / total) * 100))
        progressEl.style.width = `${pct}%`
      } else {
        progressEl.style.width = '0%'
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true, signal })
    onScroll()

    // Code block copy buttons
    document.querySelectorAll('.entry-content pre').forEach((pre) => {
      if (pre.querySelector('.sov-copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'sov-copy-btn'
      btn.type = 'button'
      btn.textContent = 'Copy'
      btn.addEventListener(
        'click',
        () => {
          const codeText = pre.querySelector('code')?.textContent || pre.textContent || ''
          navigator.clipboard?.writeText(codeText).then(() => {
            btn.textContent = '✓ Copied'
            setTimeout(() => {
              btn.textContent = 'Copy'
            }, 2000)
          })
        },
        { signal },
      )
      pre.appendChild(btn)
      injectedNodes.push(btn)
    })

    // Header anchor links & Table of Contents
    document.querySelectorAll('.sov-toc-container').forEach((existing) => existing.remove())
    const headings = Array.from(document.querySelectorAll('.entry-content h2, .entry-content h3'))
    headings.forEach((header) => {
      if (!header.id) {
        header.id = (header.textContent || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      }
      if (!header.querySelector('.sov-anchor-link')) {
        const anchor = document.createElement('a')
        anchor.className = 'sov-anchor-link'
        anchor.href = `#${header.id}`
        anchor.textContent = '#'
        header.appendChild(anchor)
        injectedNodes.push(anchor)
      }
    })

    if (headings.length >= 3) {
      const toc = document.createElement('div')
      toc.className = 'sov-toc-container'
      const title = document.createElement('div')
      title.className = 'sov-toc-title'
      title.innerHTML =
        '<span>Table of Contents</span><span style="font-size:0.8rem;color:var(--sov-cyan)">[toggle]</span>'
      const list = document.createElement('ol')
      list.className = 'sov-toc-list'
      headings.forEach((h) => {
        const li = document.createElement('li')
        if (h.tagName === 'H3') li.style.marginLeft = '16px'
        const a = document.createElement('a')
        a.href = `#${h.id}`
        a.textContent = (h.textContent || '').replace(/#$/, '').trim()
        li.appendChild(a)
        list.appendChild(li)
      })
      title.addEventListener(
        'click',
        () => {
          list.style.display = list.style.display === 'none' ? 'block' : 'none'
        },
        { signal },
      )
      toc.appendChild(title)
      toc.appendChild(list)
      headings[0].parentNode?.insertBefore(toc, headings[0])
      injectedNodes.push(toc)
    }

    // Lightbox zoom
    const lb = document.getElementById('sov-lightbox')
    const lbImg = document.getElementById('sov-lightbox-img') as HTMLImageElement | null
    if (lb && lbImg) {
      document.querySelectorAll<HTMLImageElement>('.entry-content img').forEach((img) => {
        img.style.cursor = 'zoom-in'
        img.addEventListener(
          'click',
          () => {
            lbImg.src = img.src
            lbImg.alt = img.alt || 'Expanded diagram'
            lb.style.display = 'flex'
          },
          { signal },
        )
      })
      window.addEventListener(
        'keydown',
        (ev) => {
          if (ev.key === 'Escape' && lb.style.display !== 'none') {
            lb.style.display = 'none'
          }
        },
        { signal },
      )
    }

    // Responsive tables
    document.querySelectorAll('.entry-content table').forEach((tbl) => {
      if (!tbl.parentElement?.classList.contains('sovereign-table-wrap')) {
        const wrap = document.createElement('div')
        wrap.className = 'sovereign-table-wrap'
        tbl.parentNode?.insertBefore(wrap, tbl)
        wrap.appendChild(tbl)
      }
    })

    return () => {
      controller.abort()
      injectedNodes.forEach((node) => {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
      })
    }
  }, [theme, pathname])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('sov_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <>
      <div id="sov-reading-progress" />
      <div
        id="sov-lightbox"
        onClick={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.display = 'none'
        }}
      >
        <img id="sov-lightbox-img" alt="Expanded diagram" />
      </div>
      <button
        type="button"
        className="sov-theme-toggle"
        id="sovThemeToggle"
        onClick={toggleTheme}
        title="Toggle Dark/Light Mode"
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
    </>
  )
}
