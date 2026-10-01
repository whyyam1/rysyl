import { useEffect, useState, type CSSProperties } from 'react'
import { api, ApiError, fmtDate, fmtKes, first } from './api'
import { AreaChart, Badge, Banner, Card, QUOTES, Shell, Skel, Toast, useEsc, useFlash } from './Shared'

type SessionT = { id: number; name: string; email: string; role: string; status: string } | null

type Props = {
  session: SessionT
  onSignOut: () => void
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'investments', label: 'Investments' },
  { key: 'deposits', label: 'Deposits' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'profile', label: 'Profile' },
  { key: 'security', label: 'Security' },
  { key: 'support', label: 'Support' },
]

const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong')

/* modal chrome — same treatment for deposit + withdrawal forms */
const OVERLAY: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(4,8,12,.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 20 }
const BOX: CSSProperties = { background: 'linear-gradient(165deg,rgba(50,60,70,.5) 0,rgba(28,37,46,.6) 60%,rgba(16,24,32,.66) 100%)', backdropFilter: 'blur(28px) saturate(1.35)', WebkitBackdropFilter: 'blur(28px) saturate(1.35)', border: '1px solid rgba(213,217,220,.13)', boxShadow: '0 1px 0 rgba(255,255,255,.09) inset, 0 -1px 0 rgba(0,0,0,.3) inset, 0 40px 90px -30px rgba(0,0,0,.65)', borderRadius: 20, padding: '30px 28px', maxWidth: 440, position: 'relative', zIndex: 2 }

/* CLIENT AREA — template layout 1:1, six live pages off one sidebar */
export default function Client({ session, onSignOut }: Props) {
  const [page, setPage] = useState('dashboard')
  const [sum, setSum] = useState<any>(null)
  const [err, setErr] = useState('')
  const [showDep, setShowDep] = useState(false)
  const [showWdr, setShowWdr] = useState(false)
  const [reload, setReload] = useState(0)
  const refresh = () => setReload(r => r + 1)
  const flash = useFlash()
  useEsc(showDep, () => setShowDep(false))
  useEsc(showWdr, () => setShowWdr(false))

  useEffect(() => {
    api('/me/summary')
      .then(setSum)
      .catch(e => setErr(fail(e)))
  }, [reload])

  return (
    <div className="view on" id="client">
      <Shell brand="GROUP" items={NAV} active={page} onSelect={setPage} onSignOut={onSignOut}>
        {page === 'dashboard' && <Dashboard sum={sum} err={err} session={session} onNewDeposit={() => setShowDep(true)} onNav={setPage} />}
        {page === 'transactions' && <TransactionsPage />}
        {page === 'deposits' && <DepositsPage onNewDeposit={() => setShowDep(true)} onWithdraw={() => setShowWdr(true)} />}
        {page === 'investments' && <InvestmentsPage onChanged={refresh} />}
        {page === 'notifications' && <NotificationsPage onFlash={flash.say} />}
        {page === 'profile' && <ProfilePage onChanged={refresh} />}
        {page === 'security' && <SecurityPage onFlash={flash.say} />}
        {page === 'support' && <SupportPage onFlash={flash.say} />}
      </Shell>
      {showDep && <DepositModal onClose={() => setShowDep(false)} onDone={() => { setShowDep(false); refresh(); flash.say('Deposit submitted — awaiting verification.') }} />}
      {showWdr && <WithdrawModal onClose={() => setShowWdr(false)} onDone={() => { setShowWdr(false); refresh(); flash.say('Withdrawal request submitted.') }} />}
      <Toast msg={flash.msg} />
    </div>
  )
}

/* ---------- dashboard (original template layout, live data) ---------- */

function Dashboard({ sum, err, session, onNewDeposit, onNav }: { sum: any; err: string; session: SessionT; onNewDeposit: () => void; onNav: (p: string) => void }) {
  const q = QUOTES[new Date().getDate() % QUOTES.length]
  const available = sum ? Math.max(0, sum.balance - sum.invested) : 0
  const name = first(session?.name || sum?.user?.name || 'member')

  return (
    <>
      <div className="top">
        <div>
          <h1>Welcome back, {name}</h1>
          <p>Your account overview &middot; {fmtDate(new Date())}</p>
        </div>
        <button className="btn" onClick={onNewDeposit}>+ New deposit</button>
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err} — <a style={{ color: '#fff', cursor: 'pointer' }} onClick={() => location.reload()}>retry</a></div>}
      {!sum && !err && <Skel rows={4} />}
      {sum && (
        <div className="grid">
          <Banner quote={q} i={0} />
          <Card span="s4 hero" i={1} h4="Account balance" spark={[3, 4, 4, 5, 6, 6, 8, 9]}>
            <div className="num"><small>KES</small>{fmtKes(sum.balance)}</div>
            <div className="up">&uarr; 4.2% this cycle</div>
          </Card>
          <Card span="s4" i={2} h4="Invested" spark={[5, 5, 6, 6, 6, 7, 7, 7]}>
            <div className="num"><small>KES</small>{fmtKes(sum.invested)}</div>
            <div className="kv" style={{ marginTop: 12 }}><span>Available</span><span>KES {fmtKes(available)}</span></div>
          </Card>
          <Card span="s4" i={3} h4="Approved returns" spark={[1, 2, 2, 4, 5, 5, 7, 8]}>
            <div className="num"><small>KES</small>{fmtKes(sum.approved_returns)}</div>
            <div className="kv" style={{ marginTop: 12 }}><span>Completed cycles</span><span>{sum.completed_cycles}</span></div>
          </Card>
          <Card span="s8" i={4} h4={<>Portfolio value <span>2026</span></>}>
            <AreaChart d={sum.portfolio} />
          </Card>
          <Card span="s4" i={5} h4={sum.cycle ? <>Active cycle <span className="b ok">{sum.cycle.status}</span></> : <>Active cycle</>}>
            {sum.cycle ? (
              <>
                <div className="num" style={{ fontSize: 34 }}>Cycle {String(sum.cycle.ref).slice(-2)}</div>
                <div className="bar"><i style={{ width: sum.cycle.progress + '%' }} /></div>
                <div className="kv"><span>Started {sum.cycle.started}</span><span>Matures {sum.cycle.matures}</span></div>
                <div className="kv" style={{ marginTop: 14 }}><span>Days remaining</span><span style={{ color: '#fff' }}>{sum.cycle.days_remaining}</span></div>
              </>
            ) : (
              <div className="hint">No active cycle. Request one under Investments.</div>
            )}
          </Card>
          <Card span="s8" i={6} h4={<>Transactions <span style={{ cursor: 'pointer' }} onClick={() => onNav('transactions')}>See all</span></>}>
            <div className="tw">
              <table>
                <tbody>
                  <tr><th>Ref</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                  {sum.transactions.map((t: any) => (
                    <tr key={t.ref}>
                      <td>{t.ref}</td><td>{t.type}</td><td>{fmtKes(t.amount)}</td><td>{t.date}</td>
                      <td><Badge s={t.status} /></td>
                    </tr>
                  ))}
                  {sum.transactions.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--mut)' }}>No transactions yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card span="s4" i={7} h4={<>Notifications <span style={{ cursor: 'pointer' }} onClick={() => onNav('notifications')}>See all</span></>}>
            {sum.notifications.map((n: any) => (
              <div className="li" key={n.id || n.body} style={{ opacity: n.read ? .55 : 1 }}>
                <div>{!n.read && <span className="dot" />} {n.body}</div>
                <span>{n.when}</span>
              </div>
            ))}
            {sum.notifications.length === 0 && <div className="hint">Nothing yet.</div>}
          </Card>
        </div>
      )}
      <div style={{ marginTop: 24 }}><a className="btn ghost" onClick={() => location.reload()}>&larr; Back to site</a></div>
    </>
  )
}

/* ---------- transactions ---------- */

function TransactionsPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api('/me/transactions').then(d => setRows(d.transactions)).catch(e => setErr(fail(e)))
  }, [])

  const shown = (rows || []).filter((t: any) => (f === 'All' || t.type === f)
    && t.ref.toLowerCase().includes(search.toLowerCase()))
  const filters = ['All', 'Deposit', 'Withdrawal', 'Return']

  return (
    <>
      <div className="top"><div><h1>Transactions</h1><p>Every movement on your account, newest first</p></div>
        <input className="srch" placeholder="Search reference" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s12" i={0} h4={<>
          {filters.map(x => (
            <span key={x} className="eyebrow" style={{ marginRight: 18, cursor: 'pointer', opacity: f === x ? 1 : .45 }} onClick={() => setF(x)}>{x}</span>
          ))}
        </>}>
          {!rows && !err ? <Skel rows={4} /> : (
            <div className="tw">
              <table>
                <tbody>
                  <tr><th>Ref</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                  {shown.map((t: any) => (
                    <tr key={t.ref}>
                      <td>{t.ref}</td><td>{t.type}</td><td>{fmtKes(t.amount)}</td><td>{t.date}</td>
                      <td><Badge s={t.status} /></td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--mut)' }}>Nothing matches your search.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

/* ---------- deposits (+ withdrawal entry point) ---------- */

function DepositsPage({ onNewDeposit, onWithdraw }: { onNewDeposit: () => void; onWithdraw: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/me/transactions')
      .then(d => setRows(d.transactions.filter((t: any) => t.type === 'Deposit')))
      .catch(e => setErr(fail(e)))
  }, [])

  return (
    <>
      <div className="top">
        <div><h1>Deposits</h1><p>Pay to the group account, then submit your reference for verification</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" onClick={onWithdraw}>Request withdrawal</button>
          <button className="btn" onClick={onNewDeposit}>+ New deposit</button>
        </div>
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s8" i={0} h4="Your deposits">
          <div className="tw">
            <table>
              <tbody>
                <tr><th>Ref</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                {(rows || []).map((t: any) => (
                  <tr key={t.ref}>
                    <td>{t.ref}</td><td>{fmtKes(t.amount)}</td><td>{t.date}</td><td><Badge s={t.status} /></td>
                  </tr>
                ))}
                {rows && rows.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--mut)' }}>No deposits yet.</td></tr>}
                {!rows && !err && <tr><td colSpan={4} style={{ color: 'var(--mut)' }}>Loading…</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card span="s4" i={1} h4="How verification works">
          <div className="li">Pay to the group account<span>1</span></div>
          <div className="li">Submit payer name + payment reference<span>2</span></div>
          <div className="li">An administrator matches and approves<span>3</span></div>
          <div className="hint" style={{ marginTop: 14 }}>Approved deposits move your balance immediately. Rejected deposits explain why in your notifications.</div>
        </Card>
      </div>
    </>
  )
}

/* ---------- investments (cycles) ---------- */

function InvestmentsPage({ onChanged }: { onChanged: () => void }) {
  const [cycles, setCycles] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  useEsc(!!detail, () => setDetail(null))

  const load = () => api('/me/cycles').then(d => setCycles(d.cycles)).catch(e => setErr(fail(e)))
  useEffect(() => { load() }, [])

  const request = async () => {
    if (busy) return
    setMsg(''); setErr(''); setBusy(true)
    try {
      const r = await api<any>('/me/cycles', { method: 'POST', body: JSON.stringify({ amount }) })
      setMsg(`Cycle ${r.cycle.ref} requested — an administrator will activate it.`)
      setAmount('')
      load()
      onChanged()
    } catch (e) {
      setErr(fail(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="top"><div><h1>Investments</h1><p>Fixed-duration cycles at a fixed rate, activated by the administrator</p></div></div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s4" i={0} h4="Request a cycle">
          <label>Amount (KES)<input placeholder="e.g. 100,000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          {msg && <div className="hint" style={{ color: 'var(--ok)' }}>{msg}</div>}
          {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
          <button className="btn" disabled={busy} onClick={request}>{busy ? 'Submitting…' : 'Request cycle \u2192'}</button>
          <div className="hint" style={{ marginTop: 14 }}>Your money stays in the ledger — the cycle only records the term and the agreed rate.</div>
        </Card>
        {(cycles || []).map((c, i) => <CycleCard key={c.ref} c={c} i={i + 1} onOpen={() => setDetail(c)} />)}
        {!cycles && !err && <Card span="s8" i={1} h4="Cycles"><Skel rows={3} /></Card>}
        {cycles && cycles.length === 0 && (
          <Card span="s8" i={1} h4="Cycles">
            <div className="hint">No cycles yet. Request one to begin — the administrator reviews and activates it.</div>
          </Card>
        )}
      </div>
      {detail && <CycleDetail c={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

/* cycle detail drill-in (v2-parity) — same data, template-styled overlay */
function CycleDetail({ c, onClose }: { c: any; onClose: () => void }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={OVERLAY}>
      <div className="fbox" style={{ ...BOX, maxWidth: 560, maxHeight: '86vh', overflow: 'auto' }}>
        <div className="eyebrow">Investment details</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 4px' }}>{c.ref} <Badge s={c.status} /></h3>
        <div className="num" style={{ fontSize: 34, margin: '14px 0' }}><small>KES</small>{fmtKes(c.principal)}</div>
        <div className="kv"><span>Rate</span><span style={{ color: '#fff' }}>{(c.rate_bps / 100).toFixed(2)}%</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Expected return</span><span style={{ color: '#fff' }}>KES {fmtKes(c.expected_return)}</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Started</span><span style={{ color: '#fff' }}>{c.started}</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Matures</span><span style={{ color: '#fff' }}>{c.matures}</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Days remaining</span><span style={{ color: '#fff' }}>{c.days_remaining}</span></div>
        <div className="hint" style={{ marginTop: 16 }}><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={onClose}>Close</a></div>
      </div>
    </div>
  )
}

function CycleCard({ c, i, onOpen }: { c: any; i: number; onOpen: () => void }) {
  const live = c.status === 'Active' || c.status === 'Maturing'
  return (
    <div onClick={onOpen} style={{ cursor: 'pointer' }}>
    <Card span="s4" i={i} h4={<>{c.ref} <Badge s={c.status} /></>}>
      <div className="num" style={{ fontSize: 34 }}>{fmtKes(c.principal)}</div>
      {live && <div className="bar"><i style={{ width: c.progress + '%' }} /></div>}
      <div className="kv"><span>Started {c.started}</span><span>Matures {c.matures}</span></div>
      <div className="kv" style={{ marginTop: 14 }}>
        <span>{live ? 'Days remaining' : `Return @ ${(c.rate_bps / 100).toFixed(2)}%`}</span>
        <span style={{ color: '#fff' }}>{live ? c.days_remaining : fmtKes(c.expected_return)}</span>
      </div>
    </Card>
    </div>
  )
}

/* ---------- notifications ---------- */

function NotificationsPage({ onFlash }: { onFlash: (m: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')

  const load = () => api('/me/notifications').then(d => setRows(d.notifications)).catch(e => setErr(fail(e)))
  useEffect(() => { load() }, [])

  const readOne = async (n: any) => {
    if (n.read) return
    setRows((rows || []).map(x => x.id === n.id ? { ...x, read: true } : x))
    try { await api(`/me/notifications/${n.id}/read`, { method: 'POST' }) } catch { /* keep optimistic state */ }
  }

  const readAll = async () => {
    setRows((rows || []).map(x => ({ ...x, read: true })))
    try {
      await api('/me/notifications/read-all', { method: 'POST' })
      onFlash('All notifications marked as read.')
    } catch (e) { onFlash(fail(e)) }
  }

  const unread = (rows || []).filter(n => !n.read).length

  return (
    <>
      <div className="top">
        <div><h1>Notifications</h1><p>{rows ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Everything that happened on your account'}</p></div>
        <button className="btn ghost" disabled={!rows || unread === 0} onClick={readAll}>Mark all as read</button>
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s12" i={0} h4="All notifications">
          {!rows && !err ? <Skel rows={4} /> : (rows || []).map((n: any) => (
            <div className="li" key={n.id} style={{ opacity: n.read ? .55 : 1, cursor: n.read ? 'default' : 'pointer' }} onClick={() => readOne(n)}>
              <div>{!n.read && <span className="dot" />} {n.body}</div>
              <span>{n.when}</span>
            </div>
          ))}
          {rows && rows.length === 0 && <div className="hint">Nothing yet.</div>}
        </Card>
      </div>
    </>
  )
}

/* ---------- profile ---------- */

function ProfilePage({ onChanged }: { onChanged: () => void }) {
  const [me, setMe] = useState<any>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/auth/me').then(d => {
      setMe(d.user)
      setName(d.user?.name || '')
      setEmail(d.user?.email || '')
      setPhone(d.user?.phone || '')
    }).catch(e => setErr(fail(e)))
  }, [])

  const save = async () => {
    if (busy) return
    setMsg(''); setErr(''); setBusy(true)
    try {
      const r = await api<any>('/me/profile', { method: 'PUT', body: JSON.stringify({ name, email, phone }) })
      setMe(r.user)
      setMsg('Saved.')
      onChanged()
    } catch (e) {
      setErr(fail(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="top"><div><h1>Profile</h1><p>Your details — changes apply immediately</p></div></div>
      <div className="grid">
        <Card span="s6" i={0} h4="Details">
          <label>Full name<input value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Email<input value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Phone<input placeholder="+254…" value={phone || ''} onChange={e => setPhone(e.target.value)} /></label>
          {msg && <div className="hint" style={{ color: 'var(--ok)' }}>{msg}</div>}
          {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        </Card>
        <Card span="s6" i={1} h4="Account">
          <div className="kv"><span>Status</span><Badge s={me?.status || '—'} /></div>
          <div className="kv" style={{ marginTop: 12 }}><span>Role</span><span style={{ color: '#fff' }}>{me?.role || '—'}</span></div>
          <div className="kv" style={{ marginTop: 12 }}><span>Completed cycles</span><span style={{ color: '#fff' }}>{me?.completed_cycles ?? '—'}</span></div>
          <div className="hint" style={{ marginTop: 16 }}>Accounts are never deleted. Status changes come from the administrator.</div>
        </Card>
      </div>
    </>
  )
}

/* ---------- security (v2-parity: password change + email preferences) ---------- */

function SecurityPage({ onFlash }: { onFlash: (m: string) => void }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [prefs, setPrefs] = useState<{ email_deposits: boolean; email_cycles: boolean } | null>(null)

  useEffect(() => {
    api('/auth/me').then(d => setPrefs({
      email_deposits: !!d.user?.email_deposits,
      email_cycles: !!d.user?.email_cycles,
    })).catch(() => setPrefs({ email_deposits: true, email_cycles: true }))
  }, [])

  const changePw = async () => {
    if (!cur || next.length < 8) { onFlash('Enter your current password and a new password of at least 8 characters.'); return }
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: cur, new_password: next }) })
      setCur(''); setNext('')
      onFlash('Password changed.')
    } catch (e) { onFlash(fail(e)) }
  }

  const savePrefs = async (p: { email_deposits: boolean; email_cycles: boolean }) => {
    setPrefs(p)
    try {
      await api('/me/preferences', { method: 'PUT', body: JSON.stringify(p) })
      onFlash('Preferences saved.')
    } catch (e) { onFlash(fail(e)) }
  }

  return (
    <>
      <div className="top"><div><h1>Security &amp; settings</h1><p>Manage your password and notification preferences</p></div></div>
      <div className="grid">
        <Card span="s6" i={0} h4="Change password">
          <label>Current password<input type="password" value={cur} onChange={e => setCur(e.target.value)} /></label>
          <label>New password<input type="password" placeholder="At least 8 characters" value={next} onChange={e => setNext(e.target.value)} /></label>
          <button className="btn" onClick={changePw}>Update password &rarr;</button>
        </Card>
        <Card span="s6" i={1} h4="Notification preferences">
          {prefs && (
            <>
              <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={prefs.email_deposits} style={{ width: 'auto', display: 'inline' }}
                  onChange={e => savePrefs({ ...prefs, email_deposits: e.target.checked })} /> Email me about deposits
              </label>
              <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={prefs.email_cycles} style={{ width: 'auto', display: 'inline' }}
                  onChange={e => savePrefs({ ...prefs, email_cycles: e.target.checked })} /> Email me about investment cycles
              </label>
              <div className="hint" style={{ marginTop: 14 }}>Preferences apply to email delivery; in-app notifications always arrive.</div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

/* ---------- support (v2-parity: messages are recorded, never lost) ---------- */

function SupportPage({ onFlash }: { onFlash: (m: string) => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    api('/me/support').then(d => setRows(d.messages)).catch(() => { })
  }, [])

  const send = async () => {
    if (busy) return
    if (!subject.trim() || !message.trim()) { onFlash('Complete both fields to continue.'); return }
    setBusy(true)
    try {
      await api('/me/support', { method: 'POST', body: JSON.stringify({ subject, message }) })
      setSubject(''); setMessage('')
      onFlash('Message sent — the team will reply by email.')
      api('/me/support').then(d => setRows(d.messages)).catch(() => { })
    } catch (e) { onFlash(fail(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="top"><div><h1>Support</h1><p>Get in touch with the RYSYL team</p></div></div>
      <div className="grid">
        <Card span="s8" i={0} h4="Send a message">
          <label>Subject<input placeholder="How can we help?" value={subject} onChange={e => setSubject(e.target.value)} /></label>
          <label>Message<textarea rows={5} placeholder="Tell us more…" value={message} onChange={e => setMessage(e.target.value)} /></label>
          <button className="btn" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send message \u2192'}</button>
        </Card>
        <Card span="s4" i={1} h4="Your requests">
          {rows.map(m => <div className="li" key={m.id}>{m.subject}<span>{m.when}</span></div>)}
          {rows.length === 0 && <div className="hint">No open requests.</div>}
        </Card>
      </div>
    </>
  )
}

/* ---------- modals ---------- */

/* NEW DEPOSIT — manual verification flow: client submits payer name + payment ref, admin matches */
function DepositModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [payer, setPayer] = useState('')
  const [payref, setPayref] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      await api('/me/deposits', {
        method: 'POST',
        body: JSON.stringify({ amount, payer_name: payer, payment_ref: payref }),
      })
      onDone()
    } catch (e) {
      setErr(fail(e))
      setBusy(false)
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={OVERLAY}>
      <div className="fbox" style={BOX}>
        <div className="eyebrow">Manual verification</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 18px' }}>New deposit</h3>
        <label>Amount (KES)<input placeholder="e.g. 100,000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Payer name<input placeholder="Name on the payment" value={payer} onChange={e => setPayer(e.target.value)} /></label>
        <label>Payment reference<input placeholder="e.g. QK82LM19XA" value={payref} onChange={e => setPayref(e.target.value)} /></label>
        {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit for verification \u2192'}</button>
        <div className="hint">Pay to the group account first, then submit the payment reference. An administrator verifies it against the bank record.</div>
        <div className="hint"><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={onClose}>Cancel</a></div>
      </div>
    </div>
  )
}

/* REQUEST WITHDRAWAL — same Pending → admin decision workflow as deposits */
function WithdrawModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [dest, setDest] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      await api('/me/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ amount, destination: dest }),
      })
      onDone()
    } catch (e) {
      setErr(fail(e))
      setBusy(false)
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={OVERLAY}>
      <div className="fbox" style={BOX}>
        <div className="eyebrow">Pending approval</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 18px' }}>Request withdrawal</h3>
        <label>Amount (KES)<input placeholder="e.g. 40,000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Destination<input placeholder="e.g. KCB ending 8821" value={dest} onChange={e => setDest(e.target.value)} /></label>
        {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request \u2192'}</button>
        <div className="hint">Withdrawals follow the same workflow as deposits: an administrator approves before anything moves.</div>
        <div className="hint"><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={onClose}>Cancel</a></div>
      </div>
    </div>
  )
}
