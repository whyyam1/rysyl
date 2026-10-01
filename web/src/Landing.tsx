import { Fragment, useEffect, useRef, useState } from 'react'
import { go, Rv, Stat } from './Shared'

/* LANDING — ported 1:1 from the template: parallax 1% hero, word-lighting philosophy, count-up stats, process pills, line-draw long-game section */
export default function Landing() {
  const [y, setY] = useState(0)
  useEffect(() => {
    const t = () => setY(scrollY)
    addEventListener('scroll', t, { passive: true })
    return () => removeEventListener('scroll', t)
  }, [])

  // template: #qt is observed alongside the .rv elements — .in triggers the line-draw (stroke-dashoffset 0)
  const qtRef = useRef<HTMLElement>(null)
  const [qtIn, setQtIn] = useState(false)
  useEffect(() => {
    const el = qtRef.current
    if (!el) return
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { setQtIn(true); io.disconnect() } }), { threshold: .25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const words = 'Most people chase the noise. We built a quiet place for those who do not, where every deposit is verified, every cycle is tracked, and every return is recorded in full view.'.split(' ')

  return (
    <div className="view on" id="land">
      <div className={'nav' + (y > 60 ? ' s' : '')}>
        <div className="logo">RYSYL<small>GROUP</small></div>
        <nav>
          <a href="#philosophy">Philosophy</a>
          <a href="#process">Process</a>
          <a href="#contact">Contact</a>
          <a className="btn ghost" style={{ padding: '10px 22px' }} onClick={() => go('auth')}>Sign in</a>
        </nav>
      </div>

      <section className="hero">
        <div className="big" id="big" style={{ transform: `translate(-50%,calc(-50% + ${y * .22}px)) scale(${1 + y / 3500})` }}>1%</div>
        <div className="hc">
          <div className="eyebrow">Members only</div>
          <h1>Patience is<br /><em>the edge.</em></h1>
          <p>Rysyl Group is a members platform for those who play the long game. Verified deposits, visible cycles, nothing hidden.</p>
          <a className="btn" onClick={() => go('auth')}>Open an account &rarr;</a>
        </div>
        <div className="corner" style={{ left: 34 }}>Scroll</div>
      </section>

      <section className="sec" id="philosophy">
        <div className="wrap">
          <Rv className="eyebrow">Philosophy</Rv>
          <WordLight text={words} />
          <div className="stats">
            <Stat n={500} s="+" label="Members" />
            <Stat n={100} s="%" label="Transactions audited" />
            <Stat n={24} s="h" label="Deposit verification" />
          </div>
        </div>
      </section>

      <section className="sec process" id="process">
        <div className="wrap">
          <Rv className="eyebrow">Process</Rv>
          <Rv tag="h2" style={{ fontSize: 'clamp(40px,6vw,76px)', marginTop: 22, maxWidth: 640 }}>A disciplined approach to growing capital.</Rv>
          <Rv className="pill">
            <div><i>01</i><h3>Deposit</h3><p>Fund your account. Every transaction carries its own unique reference.</p></div>
            <div><i>02</i><h3>Verify</h3><p>An administrator confirms each deposit before it counts.</p></div>
            <div><i>03</i><h3>Invest</h3><p>Your cycle starts with fixed dates and a visible maturity.</p></div>
            <div><i>04</i><h3>Return</h3><p>Approved returns are recorded permanently in your history.</p></div>
          </Rv>
        </div>
      </section>

      <section ref={qtRef} className={'sec quit' + (qtIn ? ' in' : '')} id="qt">
        <div className="wrap">
          <Rv className="eyebrow" style={{ justifyContent: 'center' }}>The long game</Rv>
          <svg viewBox="0 0 900 260">
            <path className="l" d="M0 210 L40 190 L80 215 L120 150 L160 175 L200 130 L240 190 L280 150 L310 165 L340 120 L380 170 L410 135 L440 150 L470 100 L510 140 L550 95 L600 130 L650 70 L700 105 L760 40" />
            <text x="200" y="245" textAnchor="middle">WHERE MOST QUIT</text>
            <text x="440" y="245" textAnchor="middle">WHERE MORE QUIT</text>
          </svg>
          <Rv tag="h2"><em>Be that</em>1%</Rv>
        </div>
      </section>

      <section className="sec cta" id="contact">
        <div className="wrap">
          <Rv className="eyebrow" style={{ justifyContent: 'center' }}>Begin</Rv>
          <Rv tag="h2">Begin quietly.</Rv>
          <a className="btn rv in" onClick={() => go('auth')}>Create account &rarr;</a>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="logo">RYSYL GROUP</div>
          <p>Every deposit verified. Every cycle recorded. Every return in view.</p>
          <span><a href="#" style={{ borderBottom: '1px solid var(--mut)' }}>Terms &amp; Disclosures</a> &nbsp;&middot;&nbsp; &copy; 2026 RYSYL GROUP</span>
        </div>
      </footer>
    </div>
  )
}

/* philosophy paragraph whose words light up on scroll — template splits into spans and toggles .lit */
function WordLight({ text }: { text: string[] }) {
  const [p, setP] = useState(0)
  useEffect(() => {
    const el = document.getElementById('wr')
    if (!el) return
    const t = () => {
      const r = el.getBoundingClientRect()
      setP(Math.min(1, Math.max(0, (innerHeight * .8 - r.top) / (r.height + innerHeight * .25))))
    }
    t()
    addEventListener('scroll', t, { passive: true })
    return () => removeEventListener('scroll', t)
  }, [])
  /* template: wr.innerHTML = words.map(w => `<span>${w}</span>`).join(' ') — the join(' ') is essential,
     otherwise the spans render jammed together (Mostpeoplechasethenoise). */
  return (
    <p className="words" id="wr">
      {text.map((w, i) => (
        <Fragment key={i}>
          <span className={i / text.length < p ? 'lit' : ''}>{w}</span>{' '}
        </Fragment>
      ))}
    </p>
  )
}
