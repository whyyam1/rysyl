import { useState } from 'react'
import { api, ApiError } from './api'
import { go } from './Shared'

/* RESET PASSWORD — token (from the email / dev log) + new password, single-use. */
export default function Reset() {
  const [token, setToken] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setErr('')
    if (pw !== pw2) { setErr('Passwords do not match.'); return }
    setBusy(true)
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: pw }) })
      setDone(true)
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
            <h2 style={{ fontSize: 44, margin: '20px 0 30px' }}>Reset password</h2>
            {done ? (
              <>
                <p style={{ color: 'var(--ok)', fontSize: 14 }}>Password updated. Sign in with your new password.</p>
                <button className="btn" onClick={() => go('auth')}>Return to sign in &rarr;</button>
              </>
            ) : (
              <>
                <label>Reset token<input placeholder="Paste the token from your email" value={token} onChange={e => setToken(e.target.value)} /></label>
                <label>New password<input type="password" placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'} value={pw} onChange={e => setPw(e.target.value)} /></label>
                <label>Confirm password<input type="password" placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'} value={pw2} onChange={e => setPw2(e.target.value)} /></label>
                {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
                <button className="btn" disabled={busy} onClick={submit}>{busy ? 'One moment…' : 'Set new password \u2192'}</button>
              </>
            )}
            <div className="hint"><a style={{ color: 'var(--sil)', borderBottom: '1px solid var(--mut)', cursor: 'pointer' }} onClick={() => go('auth')}>&larr; Back to sign in</a></div>
          </div>
        </div>
      </div>
    </div>
  )
}
