/* API client — all server access goes through here (credentials included). */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  let r: Response
  try {
    r = await fetch('/api' + path, {
      credentials: 'include',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    })
  } catch {
    throw new ApiError('Cannot reach the server — is the API running?', 0)
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(data.error || 'Something went wrong', r.status)
  return data as T
}

/* money display — the API speaks integer minor units; this is the only formatter */
export const fmtKes = (minor: number) =>
  (minor / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export const first = (name: string) => name.trim().split(/\s+/)[0] || name
