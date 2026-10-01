import { useState } from 'react'
import { api, ApiError } from './api'
import { go } from './Shared'

/* FORGOT PASSWORD — template auth layout. The API never reveals whether an
   email exists; in dev (no SMTP) the token is logged server-side for testing. */
export default function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setErr(''); setBusy(true)
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
      setSent(true)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view on" id="auth">
      <div className="auth">
        <div className="aside">
          <div className="big">1%</div>
          <div className="logo" style={{ position: 'relative', zIndex: 2 }}>RYSYL<small>GROUP</small></div>
          <h2 style={{ position: 'relative', zIndex: 2 }}>Built slowly. Built to last.</h2>
        </div>
        <div className="form">
          <div className="fbox">
            <div className="eyebrow">Account recovery</div>
            <h2 style={{ fontSize: 44, margin: '20px 0 30px' }}>Forgot password</h2>
            {sent ? (
              <>
                <p style={{ color: 'var(--sil)', fontSize: 14 }}>
                  If that email is registered, a reset token is on its way. The link works for 30 minutes.
                </p>
                <button className="btn" onClick={() => go('reset')}>Continue to reset &rarr;</button>
              </>
            ) : (
              <>
                <label>Email<input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
                {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
                <button className="btn" disabled={busy} onClick={submit}>{busy ? 'One moment…' : 'Continue \u2192'}</button>
              </>
            )}
            <div className="hint"><a style={{ color: 'var(--sil)', borderBottom: '1px solid var(--mut)', cursor: 'pointer' }} onClick={() => go('auth')}>&larr; Back to sign in</a></div>
          </div>
        </div>
      </div>
    </div>
  )
}
