/**
 * Server-side Cloudflare Turnstile verification helper.
 * Fails closed when token or secret is absent.
 */

export interface TurnstileVerifyResult {
  success: boolean
  errorCodes: string[]
}

export async function verifyTurnstileToken({
  token,
  secret,
  remoteIp,
  fetchImpl = fetch,
}: {
  token?: string | null
  secret?: string | null
  remoteIp?: string | null
  fetchImpl?: typeof fetch
}): Promise<TurnstileVerifyResult> {
  const trimmedToken = String(token || '').trim()
  const trimmedSecret = String(secret || '').trim()

  if (!trimmedSecret) {
    return { success: false, errorCodes: ['missing-input-secret'] }
  }
  if (!trimmedToken) {
    return { success: false, errorCodes: ['missing-input-response'] }
  }

  const form = new URLSearchParams()
  form.set('secret', trimmedSecret)
  form.set('response', trimmedToken)
  if (remoteIp) form.set('remoteip', remoteIp)

  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  if (!res.ok) {
    return { success: false, errorCodes: [`http-${res.status}`] }
  }

  const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
  return {
    success: json.success === true,
    errorCodes: Array.isArray(json['error-codes']) ? json['error-codes'] : [],
  }
}
