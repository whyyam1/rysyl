import { useEffect, useState } from 'react'
import { api } from './api'
import Landing from './Landing'
import Auth from './Auth'
import Forgot from './Forgot'
import Reset from './Reset'
import Client from './Client'
import Admin from './Admin'
import './App.css'

/* VIEW SWITCHER — mirrors the template's fixed bottom #sw + [data-go] delegation.
   forgot/reset are off-menu views reachable from the sign-in form. */
const VIEWS = ['land', 'auth', 'client', 'admin'] as const
type View = typeof VIEWS[number] | 'forgot' | 'reset'

export type Session = { id: number; name: string; email: string; role: string; status: string } | null

export default function App() {
  const [view, setView] = useState<View>('land')
  const [session, setSession] = useState<Session>(null)

  useEffect(() => {
    const t = (e: Event) => { setView((e as CustomEvent<string>).detail as View); scrollTo(0, 0) }
    window.addEventListener('rysyl:go', t)
    return () => window.removeEventListener('rysyl:go', t)
  }, [])

  useEffect(() => {
    // restore the signed-cookie session on load
    api<{ user: Session | null }>('/auth/me')
      .then(d => setSession(d.user))
      .catch(() => setSession(null))
  }, [])

  const enter = (s: NonNullable<Session>) => {
    setSession(s)
    setView(s.role === 'admin' ? 'admin' : 'client')
    scrollTo(0, 0)
  }
  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
    setSession(null)
    goView('land')
  }
  const goView = (v: string) => {
    setView(v as View)
    scrollTo(0, 0)
  }

  useEffect(() => {
    // card glow follows the cursor — template's mousemove handler setting --x/--y
    const t = (e: MouseEvent) => {
      const c = (e.target as HTMLElement | null)?.closest?.('.c') as HTMLElement | null
      if (!c) return
      const r = c.getBoundingClientRect()
      c.style.setProperty('--x', e.clientX - r.left + 'px')
      c.style.setProperty('--y', e.clientY - r.top + 'px')
    }
    document.addEventListener('mousemove', t)
    return () => document.removeEventListener('mousemove', t)
  }, [])

  return (
    <>
      {view === 'land' && <Landing />}
      {view === 'auth' && <Auth session={session} onEnter={enter} />}
      {view === 'forgot' && <Forgot />}
      {view === 'reset' && <Reset />}
      {view === 'client' && <Client session={session} onSignOut={signOut} />}
      {view === 'admin' && <Admin session={session} onSignOut={signOut} />}
      <div id="sw">
        {VIEWS.map(v => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => goView(v)}>
            {v === 'land' ? 'Landing' : v === 'auth' ? 'Sign in' : v === 'client' ? 'Client' : 'Admin'}
          </button>
        ))}
      </div>
    </>
  )
}
