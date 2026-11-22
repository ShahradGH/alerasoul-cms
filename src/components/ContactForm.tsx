'use client'

import React, { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
    }
  }
}

export function ContactForm({ siteKey }: { siteKey: string }) {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!siteKey || !widgetRef.current) return

    const renderWidget = () => {
      if (!window.turnstile || !widgetRef.current || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (t: string) => setToken(t),
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      })
    }

    if (window.turnstile) {
      renderWidget()
      return
    }

    const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')
    if (!existingScript) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = renderWidget
      document.head.appendChild(script)
    } else {
      existingScript.addEventListener('load', renderWidget)
      return () => existingScript.removeEventListener('load', renderWidget)
    }
  }, [siteKey])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setFeedback('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
          turnstileToken: token,
        }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setStatus('error')
        setFeedback(json.error || 'Unable to send inquiry. Please verify the Turnstile challenge.')
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current)
          setToken('')
        }
        return
      }

      setStatus('sent')
      setFeedback('Message received and verified via Cloudflare Turnstile.')
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current)
        setToken('')
      }
    } catch {
      setStatus('error')
      setFeedback('Network error submitting inquiry. Please try again.')
    }
  }

  return (
    <form className="sov-contact-form" onSubmit={onSubmit}>
      <div className="sov-field">
        <label htmlFor="contact-name">Full Name</label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>
      <div className="sov-field">
        <label htmlFor="contact-email">Email Address</label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
      </div>
      <div className="sov-field">
        <label htmlFor="contact-subject">Subject</label>
        <input
          id="contact-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Enterprise architecture inquiry"
        />
      </div>
      <div className="sov-field">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share context, timeline, or technical question..."
        />
      </div>
      <div>
        <div ref={widgetRef} />
      </div>
      <button type="submit" className="sov-submit-btn" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Verifying & Sending...' : 'Send Verified Message'}
      </button>
      {feedback && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.92rem',
            background: status === 'sent' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
            border: status === 'sent' ? '1px solid #10b981' : '1px solid #ef4444',
            color: status === 'sent' ? '#34d399' : '#f87171',
          }}
        >
          {feedback}
        </div>
      )}
    </form>
  )
}
