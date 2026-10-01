import { useEffect, useState, type CSSProperties } from 'react'
import { api, ApiError } from './api'
import { Badge, Banner, Card, QUOTES, Shell, Skel, Toast, useEsc, useFlash } from './Shared'

type Props = {
  session: { id: number; name: string; email: string; role: string; status: string } | null
  onSignOut: () => void
}

const NAV = [
  { key: 'overview', label: 'Overview' },
  { key: 'clients', label: 'Clients' },
  { key: 'deposits', label: 'Deposits' },
  { key: 'cycles', label: 'Investments' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'returns', label: 'Returns' },
  { key: 'reports', label: 'Reports' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'audit', label: 'Audit logs' },
]

const fail = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong')

const OVERLAY: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(4,8,12,.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 20 }
const BOX: CSSProperties = { background: 'linear-gradient(165deg,rgba(50,60,70,.5) 0,rgba(28,37,46,.6) 60%,rgba(16,24,32,.66) 100%)', backdropFilter: 'blur(28px) saturate(1.35)', WebkitBackdropFilter: 'blur(28px) saturate(1.35)', border: '1px solid rgba(213,217,220,.13)', boxShadow: '0 1px 0 rgba(255,255,255,.09) inset, 0 -1px 0 rgba(0,0,0,.3) inset, 0 40px 90px -30px rgba(0,0,0,.65)', borderRadius: 20, padding: '30px 28px', maxWidth: 460, position: 'relative', zIndex: 2 }

/* ADMIN AREA — template layout 1:1, six live pages off one sidebar */
export default function Admin({ onSignOut }: Props) {
  const [page, setPage] = useState('overview')
  const [sum, setSum] = useState<any>(null)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')

  const load = () => api('/admin/summary').then(setSum).catch(e => setErr(fail(e)))
  useEffect(() => { load() }, [])

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 4000) }
  const toast = useFlash()

  return (
    <div className="view on" id="admin">
      <Shell brand="GROUP ADMIN" items={NAV} active={page} onSelect={setPage} onSignOut={onSignOut}>
        {flash && <div className="hint" style={{ color: 'var(--ok)', margin: '0 0 14px' }}>{flash}</div>}
        {page === 'overview' && <Overview sum={sum} err={err} onFlash={say} onReload={load} onNav={setPage} />}
        {page === 'clients' && <ClientsPage onFlash={say} />}
        {page === 'deposits' && <DepositsPage onFlash={say} onReload={load} sum={sum} />}
        {page === 'cycles' && <CyclesPage onFlash={say} clients={sum?.clients} />}
        {page === 'transactions' && <AdminTransactions />}
        {page === 'returns' && <AdminReturns onFlash={say} />}
        {page === 'reports' && <ReportsPage />}
        {page === 'notifications' && <AdminNotifications onFlash={say} />}
        {page === 'audit' && <AuditPage />}
      </Shell>
      <Toast msg={toast.msg} />
    </div>
  )
}

/* ---------- overview (original template layout) ---------- */

function Overview({ sum, err, onFlash, onReload, onNav }: { sum: any; err: string; onFlash: (m: string) => void; onReload: () => void; onNav: (p: string) => void }) {
  const [filter, setFilter] = useState('')
  const q = QUOTES[(new Date().getDate() + 1) % QUOTES.length]

  const decide = async (ref: string, decision: 'approve' | 'reject') => {
    try {
      await api(`/admin/deposits/${ref}/decide`, { method: 'POST', body: JSON.stringify({ decision }) })
      onFlash(`${ref} ${decision === 'approve' ? 'approved' : 'rejected'} — client notified.`)
      onReload()
    } catch (e) {
      onFlash(fail(e))
    }
  }

  const shown = (sum?.clients || []).filter((c: any) =>
    c.name.toLowerCase().includes(filter.toLowerCase()) || c.email.toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <div className="top">
        <div><h1>Operations</h1><p>Administrator overview</p></div>
        <input className="srch" placeholder="Search clients" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err} — <a style={{ color: '#fff', cursor: 'pointer' }} onClick={() => location.reload()}>retry</a></div>}
      {!sum && !err && <div className="hint">Loading operations…</div>}
      {sum && (
        <div className="grid">
          <Banner quote={q} i={0} />
          <Card span="s3" i={1} h4="Clients" spark={[2, 3, 5, 4, 7, 8, 9, 11]}><div className="num">{sum.stats.clients}</div></Card>
          <Card span="s3" i={2} h4="Active accounts" spark={[5, 6, 6, 7, 8, 8, 9, 9]}><div className="num">{sum.stats.active}</div></Card>
          <Card span="s3" i={3} h4="Pending deposits" spark={[6, 3, 5, 2, 4, 3, 6, 4]}><div className="num">{sum.stats.pending}</div></Card>
          <Card span="s3" i={4} h4="Needs review" spark={[1, 1, 2, 2, 3, 3, 5, 6]} sparkCol="#c9a86a"><div className="num" style={{ color: 'var(--warn)' }}>{sum.stats.review}</div></Card>
          <Card span="s12" i={5} h4={<>Pending deposits <span style={{ cursor: 'pointer' }} onClick={() => onNav('deposits')}>See all</span></>}>
            <QueueTable rows={sum.pending} onDecide={decide} empty="Queue clear — nothing awaiting verification." />
          </Card>
          <Card span="s8" i={6} h4={<>Clients <span style={{ cursor: 'pointer' }} onClick={() => onNav('clients')}>See all</span></>}>
            <div className="tw">
              <table>
                <tbody>
                  <tr><th>Client</th><th>Balance</th><th>Cycles</th><th>Status</th></tr>
                  {shown.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{(c.balance / 100).toLocaleString('en-KE')}</td>
                      <td>{c.cycles}</td>
                      <td><Badge s={c.status} /></td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--mut)' }}>No matching clients.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card span="s4" i={7} h4={<>Audit log <span style={{ cursor: 'pointer' }} onClick={() => onNav('audit')}>See all</span></>}>
            {sum.audit.map((l: any, i: number) => <div className="li" key={i}>{l.line}<span>{l.when}</span></div>)}
            {sum.audit.length === 0 && <div className="hint">No activity yet.</div>}
          </Card>
        </div>
      )}
    </>
  )
}

function QueueTable({ rows, onDecide, empty }: { rows: any[]; onDecide: (ref: string, d: 'approve' | 'reject') => void; empty: string }) {
  return (
    <div className="tw">
      <table>
        <tbody>
          <tr><th>Ref</th><th>Client</th><th>Amount</th><th>Payment ref</th><th>Status</th><th></th></tr>
          {rows.map((t: any) => (
            <tr key={t.ref}>
              <td>{t.ref}</td>
              <td>{t.client}</td>
              <td>{(t.amount / 100).toLocaleString('en-KE')}</td>
              <td>{t.payment_ref}</td>
              <td><Badge s={t.status} /></td>
              <td><button className="sm y" onClick={() => onDecide(t.ref, 'approve')}>Approve</button><button className="sm n" onClick={() => onDecide(t.ref, 'reject')}>Reject</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--mut)' }}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- clients (search + detail drill-in + status) ---------- */

function ClientsPage({ onFlash }: { onFlash: (m: string) => void }) {
  const [clients, setClients] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState<any>(null)

  const load = () => api('/admin/summary').then(d => setClients(d.clients)).catch(e => setErr(fail(e)))
  useEffect(() => { load() }, [])

  const open = async (id: number) => {
    setErr('')
    try { setDetail(await api(`/admin/clients/${id}`)) } catch (e) { setErr(fail(e)) }
  }

  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/admin/clients/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
      onFlash(`Status set to ${status}.`)
      setDetail(null)
      load()
    } catch (e) { onFlash(fail(e)) }
  }

  const shown = (clients || []).filter((c: any) =>
    c.name.toLowerCase().includes(filter.toLowerCase()) || c.email.toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <div className="top">
        <div><h1>Clients</h1><p>Search, inspect the ledger, manage account status</p></div>
        <input className="srch" placeholder="Search clients" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s12" i={0} h4="All clients">
          <div className="tw">
            <table>
              <tbody>
                <tr><th>Client</th><th>Balance</th><th>Cycles</th><th>Status</th><th></th></tr>
                {shown.map((c: any) => (
                  <tr key={c.id}>
                    <td>{c.name}<br /><span style={{ color: 'var(--mut)', fontSize: 12 }}>{c.email}</span></td>
                    <td>{(c.balance / 100).toLocaleString('en-KE')}</td>
                    <td>{c.cycles}</td>
                    <td><Badge s={c.status} /></td>
                    <td><button className="sm y" onClick={() => open(c.id)}>Open</button></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--mut)' }}>No matching clients.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {detail && (
        <div onClick={e => { if (e.target === e.currentTarget) setDetail(null) }} style={OVERLAY}>
          <div className="fbox" style={{ ...BOX, maxWidth: 640, maxHeight: '86vh', overflow: 'auto' }}>
            <div className="eyebrow">Client file</div>
            <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 4px' }}>{detail.user.name}</h3>
            <div className="hint">{detail.user.email}{detail.user.phone ? ` · ${detail.user.phone}` : ''} · <Badge s={detail.user.status} /></div>
            <div className="num" style={{ fontSize: 34, margin: '14px 0' }}><small>KES</small>{(detail.balance / 100).toLocaleString('en-KE')}</div>
            <div className="eyebrow" style={{ marginTop: 8 }}>Set status</div>
            <div style={{ display: 'flex', gap: 8, margin: '10px 0 16px' }}>
              {['Active', 'Review', 'Suspended'].map(s => (
                <button key={s} className="sm y" disabled={detail.user.status === s} style={{ opacity: detail.user.status === s ? .4 : 1 }} onClick={() => setStatus(detail.user.id, s)}>{s}</button>
              ))}
            </div>
            <div className="eyebrow">Recent transactions</div>
            <div className="tw" style={{ marginTop: 8 }}>
              <table>
                <tbody>
                  <tr><th>Ref</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                  {detail.transactions.map((t: any) => (
                    <tr key={t.ref}><td>{t.ref}</td><td>{t.type}</td><td>{(t.amount / 100).toLocaleString('en-KE')}</td><td>{t.date}</td><td><Badge s={t.status} /></td></tr>
                  ))}
                  {detail.transactions.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--mut)' }}>No transactions.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="hint" style={{ marginTop: 12 }}><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={() => setDetail(null)}>Close</a></div>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------- deposits (full pending queue with the two-field match) ---------- */

function DepositsPage({ onFlash, onReload, sum }: { onFlash: (m: string) => void; onReload: () => void; sum: any }) {
  const decide = async (ref: string, decision: 'approve' | 'reject') => {
    try {
      await api(`/admin/deposits/${ref}/decide`, { method: 'POST', body: JSON.stringify({ decision }) })
      onFlash(`${ref} ${decision === 'approve' ? 'approved' : 'rejected'} — client notified.`)
      onReload()
    } catch (e) { onFlash(fail(e)) }
  }

  return (
    <>
      <div className="top"><div><h1>Deposits</h1><p>Verify payer name + payment reference against the bank record, then decide</p></div></div>
      <div className="grid">
        <Card span="s12" i={0} h4={`Pending verification${sum ? ` · ${sum.stats.pending}` : ''}`}>
          <QueueTable rows={sum?.pending || []} onDecide={decide} empty="Queue clear — nothing awaiting verification." />
        </Card>
      </div>
    </>
  )
}

/* ---------- cycles (Sprint 4 admin surface) ---------- */

const NEXT_STEP: Record<string, { to: string; label: string }> = {
  Pending: { to: 'Approved', label: 'Approve' },
  Approved: { to: 'Active', label: 'Activate' },
  Active: { to: 'Maturing', label: 'Mark maturing' },
  Maturing: { to: 'Matured', label: 'Mark matured' },
  Matured: { to: 'Completed', label: 'Complete' },
}

function CyclesPage({ onFlash, clients }: { onFlash: (m: string) => void; clients?: any[] }) {
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  useEsc(!!detail, () => setDetail(null))

  const load = () => api('/admin/cycles').then(setData).catch(e => setErr(fail(e)))
  useEffect(() => { load() }, [])

  const transition = async (ref: string, to: string) => {
    setErr('')
    try {
      await api(`/admin/cycles/${ref}/transition`, { method: 'POST', body: JSON.stringify({ to }) })
      onFlash(`${ref} → ${to}.`)
      load()
    } catch (e) { onFlash(fail(e)) }
  }

  const counts = data?.counts || {}
  const s = data?.settings || {}

  return (
    <>
      <div className="top">
        <div><h1>Cycles</h1><p>The state machine: Pending → Approved → Active → Maturing → Matured → Completed</p></div>
        <button className="btn" onClick={() => setShowNew(true)}>+ New cycle</button>
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s3" i={0} h4="Duration (days)"><div className="num">{s.duration_days ?? '—'}</div></Card>
        <Card span="s3" i={1} h4="Return rate"><div className="num">{s.rate_bps != null ? (s.rate_bps / 100).toFixed(2) + '%' : '—'}</div></Card>
        <Card span="s3" i={2} h4="Min principal"><div className="num"><small>KES</small>{(s.min_principal ?? 0).toLocaleString('en-KE')}</div></Card>
        <Card span="s3" i={3} h4="Review threshold"><div className="num">{s.review_threshold ?? '—'} <span style={{ fontSize: 14, color: 'var(--mut)' }}>completed cycles</span></div></Card>
        <Card span="s12" i={4} h4={<>All cycles {counts.Pending != null && <span>{Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>}</>}>
          <div className="tw">
            <table>
              <tbody>
                <tr><th>Ref</th><th>Client</th><th>Principal</th><th>Expected return</th><th>Progress</th><th>Matures</th><th>Status</th><th></th></tr>
                {(data?.cycles || []).map((c: any) => {
                  const next = NEXT_STEP[c.status]
                  return (
                    <tr key={c.ref} className="click" onClick={() => setDetail(c)}>
                      <td>{c.ref}</td>
                      <td>{c.client}</td>
                      <td>{(c.principal / 100).toLocaleString('en-KE')}</td>
                      <td>{(c.expected_return / 100).toLocaleString('en-KE')}</td>
                      <td>{c.status === 'Active' || c.status === 'Maturing' ? c.progress + '%' : '—'}</td>
                      <td>{c.matures}</td>
                      <td><Badge s={c.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        {next && <button className="sm y" onClick={() => transition(c.ref, next.to)}>{next.label}</button>}
                        {['Pending', 'Approved', 'Active', 'Maturing'].includes(c.status) &&
                          <button className="sm n" onClick={() => transition(c.ref, 'Cancelled')}>Cancel</button>}
                      </td>
                    </tr>
                  )
                })}
                {data && data.cycles.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--mut)' }}>No cycles yet.</td></tr>}
                {!data && !err && <tr><td colSpan={8} style={{ color: 'var(--mut)' }}>Loading…</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {showNew && (
        <NewCycleModal
          clients={clients || []}
          onClose={() => setShowNew(false)}
          onDone={() => { setShowNew(false); load() }}
        />
      )}
      {detail && <CycleDetailAdmin c={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

/* admin cycle drill-in (v2-parity) — full details, read-only; actions stay in the table */
function CycleDetailAdmin({ c, onClose }: { c: any; onClose: () => void }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={OVERLAY}>
      <div className="fbox" style={{ ...BOX, maxWidth: 560, maxHeight: '86vh', overflow: 'auto' }}>
        <div className="eyebrow">Cycle file</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 4px' }}>{c.ref} <Badge s={c.status} /></h3>
        <div className="hint">{c.client}</div>
        <div className="num" style={{ fontSize: 34, margin: '14px 0' }}><small>KES</small>{(c.principal / 100).toLocaleString('en-KE')}</div>
        <div className="kv"><span>Rate</span><span style={{ color: '#fff' }}>{(c.rate_bps / 100).toFixed(2)}%</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Expected return</span><span style={{ color: '#fff' }}>KES {(c.expected_return / 100).toLocaleString('en-KE')}</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Started</span><span style={{ color: '#fff' }}>{c.started}</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Matures</span><span style={{ color: '#fff' }}>{c.matures}</span></div>
        <div className="kv" style={{ marginTop: 10 }}><span>Progress</span><span style={{ color: '#fff' }}>{c.progress}%</span></div>
        <div className="hint" style={{ marginTop: 16 }}><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={onClose}>Close</a></div>
      </div>
    </div>
  )
}

function NewCycleModal({ clients, onClose, onDone }: { clients: any[]; onClose: () => void; onDone: () => void }) {
  const [userId, setUserId] = useState(clients[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [days, setDays] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setErr(''); setBusy(true)
    try {
      const body: any = { user_id: Number(userId), principal_minor: Math.round(parseFloat(amount.replace(/,/g, '') || '0') * 100) }
      if (rate) body.rate_bps = Math.round(parseFloat(rate) * 100)
      if (days) body.duration_days = parseInt(days)
      const r = await api<any>('/admin/cycles', { method: 'POST', body: JSON.stringify(body) })
      onDone()
      onClose()
      return r
    } catch (e) {
      setErr(fail(e))
      setBusy(false)
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={OVERLAY}>
      <div className="fbox" style={BOX}>
        <div className="eyebrow">Admin-initiated</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 18px' }}>New cycle</h3>
        <label>Client
          <select value={userId} onChange={e => setUserId(e.target.value)} style={{ marginTop: 8, fontFamily: 'inherit' }}>
            {clients.map((c: any) => <option key={c.id} value={c.id} style={{ background: '#0b1219' }}>{c.name}</option>)}
          </select>
        </label>
        <label>Principal (KES)<input placeholder="e.g. 500,000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Rate % (optional)<input placeholder="7.00" value={rate} onChange={e => setRate(e.target.value)} /></label>
          <label>Days (optional)<input placeholder="90" value={days} onChange={e => setDays(e.target.value)} /></label>
        </div>
        {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
        <button className="btn" disabled={busy || !clients.length} onClick={submit}>{busy ? 'Creating…' : 'Create cycle \u2192'}</button>
        <div className="hint">Blank rate/duration use the platform settings. The cycle starts Pending — activate it from the table.</div>
        <div className="hint"><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={onClose}>Cancel</a></div>
      </div>
    </div>
  )
}

/* ---------- transactions (platform-wide ledger view, v2-parity) ---------- */

function AdminTransactions() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api('/admin/transactions').then(d => setRows(d.transactions)).catch(e => setErr(fail(e)))
  }, [])

  const shown = (rows || []).filter((t: any) => (f === 'All' || t.type === f)
    && (t.ref.toLowerCase().includes(search.toLowerCase())
      || (t.client || '').toLowerCase().includes(search.toLowerCase())))
  const filters = ['All', 'Deposit', 'Withdrawal', 'Return']

  return (
    <>
      <div className="top"><div><h1>Transactions</h1><p>Account activity across the platform — read-only ledger view</p></div>
        <input className="srch" placeholder="Search ref or client" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s12" i={0} h4={<>
          {filters.map(x => (
            <span key={x} className="eyebrow" style={{ marginRight: 18, cursor: 'pointer', opacity: f === x ? 1 : .45 }} onClick={() => setF(x)}>{x}</span>
          ))}
        </>}>
          {!rows && !err ? <Skel rows={5} /> : (
            <div className="tw">
              <table>
                <tbody>
                  <tr><th>Ref</th><th>Client</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                  {shown.map((t: any) => (
                    <tr key={t.ref}>
                      <td>{t.ref}</td><td>{t.client}</td><td>{t.type}</td><td>{(t.amount / 100).toLocaleString('en-KE')}</td><td>{t.date}</td>
                      <td><Badge s={t.status} /></td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--mut)' }}>Nothing matches.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

/* ---------- returns (record returns on completed cycles, v2-parity) ---------- */

function AdminReturns({ onFlash }: { onFlash: (m: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [cycles, setCycles] = useState<any[]>([])
  const [err, setErr] = useState('')
  const [showNew, setShowNew] = useState(false)
  useEsc(showNew, () => setShowNew(false))

  const load = () => {
    api('/admin/returns').then(d => setRows(d.returns)).catch(e => setErr(fail(e)))
    api('/admin/cycles').then(d => setCycles((d.cycles || []).filter((c: any) => c.status === 'Completed'))).catch(() => { })
  }
  useEffect(() => { load() }, [])

  return (
    <>
      <div className="top">
        <div><h1>Returns</h1><p>Record approved returns on completed cycles — the ledger is the only truth</p></div>
        <button className="btn" onClick={() => setShowNew(true)}>+ Record return</button>
      </div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s12" i={0} h4="Return records">
          {!rows && !err ? <Skel rows={4} /> : (
            <div className="tw">
              <table>
                <tbody>
                  <tr><th>Ref</th><th>Client</th><th>Amount</th><th>Date</th><th>Note</th><th>Status</th></tr>
                  {(rows || []).map((t: any) => (
                    <tr key={t.ref}>
                      <td>{t.ref}</td><td>{t.client}</td><td>{(t.amount / 100).toLocaleString('en-KE')}</td><td>{t.date}</td><td style={{ color: 'var(--mut)' }}>{t.note || '—'}</td>
                      <td><Badge s={t.status} /></td>
                    </tr>
                  ))}
                  {rows && rows.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--mut)' }}>No returns recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {showNew && <NewReturnModal cycles={cycles} onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); onFlash('Return recorded — the client has been notified.') }} />}
    </>
  )
}

function NewReturnModal({ cycles, onClose, onDone }: { cycles: any[]; onClose: () => void; onDone: () => void }) {
  const [cycleRef, setCycleRef] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const sel = cycles.find(c => c.ref === cycleRef)

  const submit = async () => {
    if (busy) return
    setErr(''); setBusy(true)
    try {
      await api('/admin/returns', {
        method: 'POST',
        body: JSON.stringify({ cycle_ref: cycleRef, amount_minor: Math.round(parseFloat(amount.replace(/,/g, '') || '0') * 100) }),
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
        <div className="eyebrow">Ledger entry</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, margin: '6px 0 18px' }}>Record return</h3>
        {cycles.length === 0 ? (
          <div className="hint">No completed cycles yet. Complete a cycle first, then record its return here.</div>
        ) : (
          <>
            <label>Completed cycle
              <select value={cycleRef} onChange={e => setCycleRef(e.target.value)} style={{ marginTop: 8, fontFamily: 'inherit' }}>
                <option value="">Pick a cycle…</option>
                {cycles.map((c: any) => <option key={c.ref} value={c.ref} style={{ background: '#0b1219' }}>{c.ref} — {c.client} — principal {(c.principal / 100).toLocaleString('en-KE')}</option>)}
              </select>
            </label>
            {sel && <div className="hint">Cycle rate {(sel.rate_bps / 100).toFixed(2)}% suggests KES {(sel.expected_return / 100).toLocaleString('en-KE')}.</div>}
            <label>Return amount (KES)<input placeholder="e.g. 10,500" value={amount} onChange={e => setAmount(e.target.value)} /></label>
            {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
            <button className="btn" disabled={busy || !cycleRef} onClick={submit}>{busy ? 'Recording…' : 'Record return \u2192'}</button>
          </>
        )}
        <div className="hint">The return is a ledger row — the client's balance re-derives the moment it lands.</div>
        <div className="hint"><a style={{ color: '#fff', cursor: 'pointer', borderBottom: '1px solid var(--mut)' }} onClick={onClose}>Cancel</a></div>
      </div>
    </div>
  )
}

/* ---------- notifications (admin broadcast, v2-parity) ---------- */

function AdminNotifications({ onFlash }: { onFlash: (m: string) => void }) {
  const [body, setBody] = useState('')
  const [target, setTarget] = useState('')
  const [clients, setClients] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/admin/summary').then(d => setClients(d.clients || [])).catch(() => { })
  }, [])

  const send = async () => {
    if (busy) return
    if (!body.trim()) { onFlash('Write a message first.'); return }
    setBusy(true)
    try {
      const payload: any = { body }
      if (target) payload.user_id = Number(target)
      const r = await api<any>('/admin/notifications', { method: 'POST', body: JSON.stringify(payload) })
      setBody('')
      onFlash(`Sent to ${r.sent} client${r.sent === 1 ? '' : 's'}.`)
    } catch (e) { onFlash(fail(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="top"><div><h1>Notifications</h1><p>Broadcast an update to all members, or notify one client</p></div></div>
      <div className="grid">
        <Card span="s8" i={0} h4="New notification">
          <label>Message
            <textarea rows={3} placeholder="e.g. Maintenance window on Saturday 22:00–23:00 EAT." value={body} onChange={e => setBody(e.target.value)} />
          </label>
          <label>Recipient
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ marginTop: 8, fontFamily: 'inherit' }}>
              <option value="">All clients (Active + Review)</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send notification \u2192'}</button>
          <div className="hint" style={{ marginTop: 14 }}>Suspended accounts are never broadcast to. Every send is audit-logged.</div>
        </Card>
      </div>
    </>
  )
}

/* ---------- reports (CSV exports) ---------- */

function ReportsPage() {
  return (
    <>
      <div className="top"><div><h1>Reports</h1><p>CSV exports — amounts in minor units for spreadsheet accuracy</p></div></div>
      <div className="grid">
        <Card span="s6" i={0} h4="Deposits ledger">
          <div className="hint">Every deposit with payer name, payment reference, status and timestamp.</div>
          <a className="btn" href="/api/admin/reports/deposits" style={{ display: 'inline-block', marginTop: 14, textDecoration: 'none' }}>Download deposits CSV &darr;</a>
        </Card>
        <Card span="s6" i={1} h4="Client balances">
          <div className="hint">Derived balances per client — recomputed from the ledger at export time.</div>
          <a className="btn" href="/api/admin/reports/balances" style={{ display: 'inline-block', marginTop: 14, textDecoration: 'none' }}>Download balances CSV &darr;</a>
        </Card>
      </div>
    </>
  )
}

/* ---------- audit log viewer ---------- */

function AuditPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/admin/audit').then(d => setRows(d.entries)).catch(e => setErr(fail(e)))
  }, [])

  return (
    <>
      <div className="top"><div><h1>Audit logs</h1><p>Append-only. Who did what, to what, when.</p></div></div>
      {err && <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="grid">
        <Card span="s12" i={0} h4="All activity">
          {(rows || []).map((l: any, i: number) => (
            <div className="li" key={i}>{l.line}<span>{l.actor} · {l.when}</span></div>
          ))}
          {rows && rows.length === 0 && <div className="hint">No activity yet.</div>}
          {!rows && !err && <div className="hint">Loading…</div>}
        </Card>
      </div>
    </>
  )
}
