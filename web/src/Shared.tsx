import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'

/* navigation — mirrors the template's global [data-go] delegation */
export const go = (v: string) => window.dispatchEvent(new CustomEvent('rysyl:go', { detail: v }))

/* badges */
const badgeCls: Record<string, string> = { Approved: 'ok', Completed: 'ok', Active: 'ok', Pending: 'warn', Review: 'warn', Suspended: 'bad', Rejected: 'bad' }
export function Badge({ s }: { s: string }) { return <span className={'b ' + (badgeCls[s] || 'mut')}>{s}</span> }

/* principle of the day */
export const QUOTES = [
  'Wealth is built in silence, one cycle at a time.',
  'The calm hand outlasts the loud one.',
  'Patience is not waiting. It is compounding.',
  'Discipline today, freedom tomorrow.',
  'Do the work. Let time do the rest.',
]

/* reveal on scroll (template: .rv observed at threshold .25, once) */
export function Rv({ tag: Tag = 'div', className = '', children, ...rest }: { tag?: ElementType; className?: string; children?: ReactNode } & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null)
  const [inV, setInV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { setInV(true); io.disconnect() } }), { threshold: .25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <Tag ref={ref} className={(className + ' rv ' + (inV ? 'in' : '')).trim()} {...rest}>{children}</Tag>
}

/* landing stat with count-up (1600ms, cubic ease-out, suffix) */
export function Stat({ n, s, label }: { n: number; s: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [val, setVal] = useState(0)
  const [inV, setInV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { setInV(true); io.disconnect() } }), { threshold: .25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!inV) return
    let raf = 0
    const t0 = performance.now()
    const f = (ts: number) => { const k = Math.min(1, (ts - t0) / 1600); setVal(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [inV, n])
  return <div ref={ref} className={'stat rv' + (inV ? ' in' : '')}><b>{val}{s}</b><span>{label}</span></div>
}

/* dashboard card with stagger index + optional sparkline (template: .c + spark absolute svg) */
export function Card({ span, i, spark, sparkCol, h4, children }: { span: string; i: number; spark?: number[]; sparkCol?: string; h4?: ReactNode; children: ReactNode }) {
  return (
    <div className={'c ' + span} style={{ '--i': i } as CSSProperties}>
      {h4 != null && <h4>{h4}</h4>}
      {children}
      {spark && <Spark d={spark} col={sparkCol} />}
    </div>
  )
}

function Spark({ d, col }: { d: number[]; col?: string }) {
  const w = 120, h = 30, mx = Math.max(...d), mn = Math.min(...d)
  const p = d.map((v, i) => (i * w / (d.length - 1)).toFixed(1) + ' ' + (h - (v - mn) / (mx - mn || 1) * (h - 4) - 2).toFixed(1))
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', right: 20, bottom: 18, width: 96 }}><path d={`M${p.join(' L')}`} fill="none" stroke={col || '#8fb8a0'} strokeWidth="1.6" /></svg>
}

/* principle-of-the-day banner (template: .ban with giant R) */
export function Banner({ quote, i }: { quote: string; i: number }) {
  return (
    <div className="ban" style={{ '--i': i } as CSSProperties}>
      <div className="big">R</div>
      <div style={{ position: 'relative', zIndex: 2 }}>
        <div className="eyebrow">Principle of the day</div>
        <h2 className="pq" style={{ fontSize: 'clamp(28px,3.8vw,48px)', marginTop: 14, maxWidth: 660 }}>{quote}</h2>
      </div>
    </div>
  )
}

/* portfolio area chart (template: area() — 640x220, gradient fill, marker on point 7, 6 month labels) */
export function AreaChart({ d }: { d: number[] }) {
  const w = 640, h = 200
  const mx = Math.max(...d), mn = Math.min(...d) * .9
  const p = d.map((v, i) => [i * w / (d.length - 1), h - (v - mn) / (mx - mn) * (h - 30) - 10])
  const l = p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')
  const months = ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Dec']
  return (
    <svg className="ch" viewBox="0 0 640 220">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6d9e" stopOpacity=".5" /><stop offset="1" stopColor="#2f6d9e" stopOpacity="0" /></linearGradient></defs>
      <path d={`${l} L${w} ${h} L0 ${h}Z`} fill="url(#g)" />
      <path d={l} fill="none" stroke="#d3d1ce" strokeWidth="2" />
      <circle cx={p[7][0]} cy={p[7][1]} r="5" fill="#fff" />
      {months.map((m, i) => <text key={m} x={i * w / 5} y={216} fill="#6C6D74" fontSize="10" textAnchor={i === 0 ? 'start' : i === 5 ? 'end' : 'middle'}>{m}</text>)}
    </svg>
  )
}

/* dashboard shell: sidebar + main, mobile drawer via .open (template: .app/.side/.scrim/.mb).
   Now with real navigation: items are {key,label}, the active one gets .on. */
export function Shell({ brand, items, active, onSelect, children, onSignOut }: {
  brand: string
  items: { key: string; label: string }[]
  active: string
  onSelect: (key: string) => void
  children: ReactNode
  onSignOut?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={'app' + (open ? ' open' : '')}>
      <div className="scrim" onClick={() => setOpen(false)} />
      <aside className="side">
        <div className="logo">RYSYL<small>{brand}</small></div>
        {items.map(t => (
          <a href="#" key={t.key} className={t.key === active ? 'on' : ''}
            onClick={e => { e.preventDefault(); setOpen(false); onSelect(t.key) }}>{t.label}</a>
        ))}
        <a className="end" onClick={onSignOut || (() => go('auth'))}>Sign out</a>
      </aside>
      <main className="main">
        <button className="mb" onClick={() => setOpen(o => !o)}>Menu</button>
        {children}
      </main>
    </div>
  )
}

/* ---------- v2-parity UX kit (template-styled): toast, flash, Esc, skeletons ---------- */

/* transient confirmation pill — v2's Toast, styled to the template */
export function Toast({ msg }: { msg: string }) {
  if (!msg) return null
  return <div className="toast"><span className="dot" /> {msg}</div>
}

/* auto-clearing flash message shared by pages inside one shell */
export function useFlash(ms = 4000) {
  const [msg, setMsg] = useState('')
  const timer = useRef<number>(0)
  const say = (m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), ms)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { msg, say }
}

/* Escape closes any open modal — v2-parity keyboard behaviour */
export function useEsc(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', t)
    return () => document.removeEventListener('keydown', t)
  }, [active, onClose])
}

/* shimmering placeholder rows while a page loads — v2's Loading */
export function Skel({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ width: `${100 - i * 14}%` }} />
      ))
      }
    </div>
  )
}
