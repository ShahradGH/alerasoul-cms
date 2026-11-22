'use client'

import React, { useEffect, useState } from 'react'

export function ThemeAndEnhancements() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)

    // Reading progress bar
    const progressEl = document.getElementById('sov-reading-progress')
    const onScroll = () => {
      if (!progressEl) return
      const total = document.documentElement.scrollHeight - window.innerHeight
      if (total > 0) {
        const pct = Math.min(100, Math.max(0, (window.scrollY / total) * 100))
        progressEl.style.width = `${pct}%`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Code block copy buttons
    document.querySelectorAll('.entry-content pre').forEach((pre) => {
      if (pre.querySelector('.sov-copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'sov-copy-btn'
      btn.type = 'button'
      btn.innerText = 'Copy'
      btn.addEventListener('click', () => {
        const codeText = pre.querySelector('code')?.textContent || pre.textContent || ''
        navigator.clipboard?.writeText(codeText).then(() => {
          btn.innerText = '✓ Copied'
          setTimeout(() => {
            btn.innerText = 'Copy'
          }, 2000)
        })
      })
      pre.appendChild(btn)
    })

    // Header anchor links & Table of Contents
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
        anchor.innerText = '#'
        header.appendChild(anchor)
      }
    })

    if (headings.length >= 3 && !document.querySelector('.sov-toc-container')) {
      const toc = document.createElement('div')
      toc.className = 'sov-toc-container'
      const title = document.createElement('div')
      title.className = 'sov-toc-title'
      title.innerHTML = '<span>Table of Contents</span><span style="font-size:0.8rem;color:var(--sov-cyan)">[toggle]</span>'
      const list = document.createElement('ol')
      list.className = 'sov-toc-list'
      headings.forEach((h) => {
        const li = document.createElement('li')
        if (h.tagName === 'H3') li.style.marginLeft = '16px'
        const a = document.createElement('a')
        a.href = `#${h.id}`
        a.innerText = (h.textContent || '').replace(/#$/, '').trim()
        li.appendChild(a)
        list.appendChild(li)
      })
      title.addEventListener('click', () => {
        list.style.display = list.style.display === 'none' ? 'block' : 'none'
      })
      toc.appendChild(title)
      toc.appendChild(list)
      headings[0].parentNode?.insertBefore(toc, headings[0])
    }

    // Lightbox zoom
    const lb = document.getElementById('sov-lightbox')
    const lbImg = document.getElementById('sov-lightbox-img') as HTMLImageElement | null
    if (lb && lbImg) {
      document.querySelectorAll<HTMLImageElement>('.entry-content img').forEach((img) => {
        img.style.cursor = 'zoom-in'
        img.addEventListener('click', () => {
          lbImg.src = img.src
          lb.style.display = 'flex'
        })
      })
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
      window.removeEventListener('scroll', onScroll)
    }
  }, [theme])

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
        <img id="sov-lightbox-img" src="" alt="Expanded diagram" />
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
