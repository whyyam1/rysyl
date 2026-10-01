import { useState } from 'react'
import { api, ApiError } from './api'
import { go } from './Shared'

type S = { id: number; name: string; email: string; role: string; status: string } | null

/* AUTH — template layout 1:1, now wired to the real auth API */
export default function Auth({ session, onEnter }: { session: S; onEnter: (s: NonNullable<S>) => void }) {
  const [tab, setTab] = useState<'in' | 'reg'>('in')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setErr('')
    if (tab === 'reg' && pw !== pw2) { setErr('Passwords do not match.'); return }
    setBusy(true)
    try {
      const d = tab === 'reg'
        ? await api<{ user: NonNullable<S> }>('/auth/register', {
            method: 'POST', body: JSON.stringify({ name, phone, email, password: pw }),
          })
        : await api<{ user: NonNullable<S> }>('/auth/login', {
            method: 'POST', body: JSON.stringify({ email, password: pw }),
          })
      onEnter(d.user)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const adminClick = async () => {
    // admin sign-in lives on the same form; if an admin session exists, enter directly
    try {
      const d = await api<{ user: S }>('/auth/me')
      if (d.user?.role === 'admin') { onEnter(d.user); return }
      go('land')
    } catch { go('land') }
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
            <div className="tabs">
              <button className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>Sign in</button>
              <button className={tab === 'reg' ? 'on' : ''} onClick={() => setTab('reg')}>Register</button>
            </div>
            <div className="reg" hidden={tab !== 'reg'}>
              <label>Full name<input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} /></label>
              <label>Phone<input placeholder="+254" value={phone} onChange={e => setPhone(e.target.value)} /></label>
            </div>
            <label>Email<input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'} value={pw} onChange={e => setPw(e.target.value)} /></label>
            <div className="reg" hidden={tab !== 'reg'}>
              <label>Confirm password<input type="password" placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'} value={pw2} onChange={e => setPw2(e.target.value)} /></label>
            </div>
            {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'One moment…' : (tab === 'reg' ? 'Create account' : 'Sign in') + ' \u2192'}</button>
            {session?.role === 'admin' && (
              <div className="hint">Signed in as <a style={{ color: '#fff', borderBottom: '1px solid var(--mut)', cursor: 'pointer' }} onClick={adminClick}>Ops Admin — continue to admin</a></div>
            )}
            <div className="hint" style={{ visibility: tab === 'reg' ? 'hidden' : 'visible' }}>
              <a style={{ color: 'var(--sil)', borderBottom: '1px solid var(--mut)', cursor: 'pointer', marginRight: 18 }} onClick={() => go('forgot')}>Forgot password?</a>
              Admin? <a style={{ color: '#fff', borderBottom: '1px solid var(--mut)', cursor: 'pointer' }} onClick={adminClick}>Admin sign in</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
