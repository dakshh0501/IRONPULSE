import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { openSupportWhatsApp } from '../utils/whatsappSupport'
import { shareWebsite } from '../utils/shareWebsite'

const FADE_UP = { opacity: 0, transform: 'translateY(30px)' }
const VISIBLE = { opacity: 1, transform: 'translateY(0)' }

function useReveal(threshold = 0.1) {
  const ref = useRef(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); o.disconnect() } }, { threshold })
    o.observe(el)
    return () => o.disconnect()
  }, [threshold])
  return [ref, show]
}

function Reveal({ children, as: Tag = 'div', style, ...p }) {
  const [ref, show] = useReveal()
  return (
    <Tag ref={ref} style={{ transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)', ...(show ? VISIBLE : FADE_UP), ...style }} {...p}>
      {children}
    </Tag>
  )
}

function Counter({ end, suffix = '', duration = 2000 }) {
  const [val, setVal] = useState(0)
  const ref = useRef(null)
  const counted = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !counted.current) {
        counted.current = true
        let start = 0
        const step = end / (duration / 16)
        const t = setInterval(() => {
          start += step
          if (start >= end) { setVal(end); clearInterval(t) }
          else setVal(Math.floor(start))
        }, 16)
      }
    }, { threshold: 0.3 })
    o.observe(el)
    return () => o.disconnect()
  }, [end, duration])
  return <span ref={ref}>{val}{suffix}</span>
}

const styles = document.createElement('style')
styles.textContent = `
@keyframes pulse-glow {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-12px); }
}
@keyframes float-delayed {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}
@keyframes float-slow {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  33% { transform: translateY(-6px) rotate(0.5deg); }
  66% { transform: translateY(-3px) rotate(-0.3deg); }
}
@keyframes drift {
  0% { transform: translate(0, 0); }
  25% { transform: translate(30px, -20px); }
  50% { transform: translate(-20px, 10px); }
  75% { transform: translate(15px, -15px); }
  100% { transform: translate(0, 0); }
}
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes ripple {
  to { transform: scale(4); opacity: 0; }
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
.lp-nav-scrolled { background: rgba(7,10,18,0.92) !important; backdrop-filter: blur(20px) !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; }
.lp-btn-primary {
  position: relative; overflow: hidden;
  background: linear-gradient(135deg, var(--orange, #e8420a), #ff6a2a);
  color: white; border: none; padding: 14px 32px; border-radius: 10px;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 20px rgba(232,66,10,0.3);
}
.lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(232,66,10,0.45); }
.lp-btn-secondary {
  background: rgba(255,255,255,0.06); color: var(--text, #e4e8f0);
  border: 1px solid rgba(255,255,255,0.1); padding: 14px 32px; border-radius: 10px;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: all 0.2s ease;
}
.lp-btn-secondary:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); transform: translateY(-2px); }
.lp-feature-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px; padding: 28px 24px;
  transition: all 0.35s cubic-bezier(0.16,1,0.3,1); cursor: default;
  position: relative; overflow: hidden;
}
.lp-feature-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(800px circle at var(--mx, 50%) var(--my, 50%), rgba(232,66,10,0.06), transparent 60%);
  opacity: 0; transition: opacity 0.4s ease; pointer-events: none;
}
.lp-feature-card:hover { transform: translateY(-6px); border-color: rgba(232,66,10,0.2); box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.lp-feature-card:hover::before { opacity: 1; }
.lp-pricing-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px; padding: 32px 28px; position: relative;
  transition: all 0.35s cubic-bezier(0.16,1,0.3,1); display: flex; flex-direction: column;
}
.lp-pricing-card:hover { transform: translateY(-8px); border-color: rgba(232,66,10,0.25); box-shadow: 0 24px 80px rgba(0,0,0,0.35); }
.lp-pricing-card.popular {
  background: rgba(232,66,10,0.06); border-color: rgba(232,66,10,0.25);
  box-shadow: 0 0 40px rgba(232,66,10,0.08);
}
.lp-benefit-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px; padding: 24px; text-align: center;
  transition: all 0.3s ease; cursor: default;
}
.lp-benefit-card:hover { transform: translateY(-4px); border-color: rgba(0,200,180,0.2); box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
.lp-faq-q {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 18px 22px; cursor: pointer;
  transition: all 0.25s ease; user-select: none;
}
.lp-faq-q:hover { border-color: rgba(232,66,10,0.15); background: rgba(255,255,255,0.05); }
.lp-faq-q.open { border-color: rgba(232,66,10,0.2); background: rgba(232,66,10,0.04); }
.lp-faq-answer { overflow: hidden; transition: max-height 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease; }
.lp-glow-card {
  background: rgba(255,255,255,0.04); backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 18px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.lp-testimonial-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px; padding: 28px; min-width: 340px; max-width: 400px;
  transition: all 0.3s ease; flex-shrink: 0;
}
.lp-testimonial-card:hover { transform: translateY(-4px); border-color: rgba(232,66,10,0.15); }
.lp-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.15); cursor: pointer; transition: all 0.3s ease; }
.lp-dot.active { background: var(--orange, #e8420a); width: 28px; border-radius: 4px; }
.lp-grid-bg {
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}
.lp-particle {
  position: absolute; border-radius: 50%; pointer-events: none;
  background: var(--orange, #e8420a); opacity: 0.15;
}
@media (max-width: 768px) {
  .lp-nav-links { display: none !important; }
  .lp-mobile-btn { display: flex !important; }
  .lp-mobile-menu.open { display: flex !important; }
  .lp-hero-row { flex-direction: column !important; text-align: center !important; }
  .lp-hero-left { align-items: center !important; }
  .lp-hero-buttons { justify-content: center !important; }
  .lp-trust-row { justify-content: center !important; }
  .lp-floating-metrics { display: none !important; }
  .lp-hero-right { max-width: 100% !important; margin-top: 40px !important; }
  .lp-features-grid { grid-template-columns: 1fr !important; }
  .lp-benefits-grid { grid-template-columns: repeat(2,1fr) !important; }
  .lp-pricing-grid { grid-template-columns: 1fr !important; max-width: 380px !important; margin: 0 auto !important; }
  .lp-testimonials-row { flex-direction: column !important; align-items: center !important; }
  .lp-testimonial-card { min-width: unset !important; max-width: 100% !important; width: 100% !important; }
  .lp-footer-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
  .lp-showcase-images { grid-template-columns: 1fr !important; }
  .lp-how-grid { grid-template-columns: 1fr !important; }
}
@media (max-width: 400px) {
  .lp-benefits-grid { grid-template-columns: 1fr !important; }
  .lp-hero-title { font-size: 40px !important; }
  .lp-hero-subtitle { font-size: 16px !important; }
}
`
document.head.appendChild(styles)

const features = [
  { icon: 'Users', title: 'Member Management', desc: 'Full profiles, attendance tracking, check-in system, plan assignment, and communication tools for every member.' },
  { icon: 'ClipboardCheck', title: 'Attendance', desc: 'QR-based check-in, manual entry, real-time tracking, heatmaps, and detailed attendance reports with peak hour analysis.' },
  { icon: 'UserCheck', title: 'Trainer Management', desc: 'Assign trainers, track sessions, manage schedules, performance metrics, and client relationships in one place.' },
  { icon: 'Dumbbell', title: 'Workout Plans', desc: 'Custom routines with sets, reps, rest times, exercise libraries, and progress tracking for every member.' },
  { icon: 'UtensilsCrossed', title: 'Diet Plans', desc: 'Macro-tracked meal plans, calorie targets, meal schedules, and nutrition guidance assigned per member goal.' },
  { icon: 'IndianRupee', title: 'Payments', desc: 'Invoices, payment tracking, PhonePe integration, automated reminders, revenue analytics, and financial records.' },
  { icon: 'BarChart3', title: 'Reports', desc: 'Revenue, attendance, member growth, trainer performance — all with interactive charts and CSV/PDF export.' },
  { icon: 'CalendarCheck', title: 'Subscriptions', desc: 'Membership plans, auto-renewals, upgrades, downgrades, trial management, and subscription lifecycle automation.' }
]

const benefits = [
  { icon: 'Zap', title: 'Lightning Fast', desc: 'Optimized for speed. Pages load instantly with lazy loading and code splitting.' },
  { icon: 'Shield', title: 'Secure', desc: 'Firebase Auth, Firestore security rules, encrypted data, and role-based access control.' },
  { icon: 'Cloud', title: 'Cloud Sync', desc: 'Real-time sync across devices. Changes reflect instantly for all users.' },
  { icon: 'Users', title: 'Role Based', desc: 'Admin, trainer, member, and owner roles with granular permissions and access control.' },
  { icon: 'PieChart', title: 'Rich Reports', desc: 'Interactive charts, exportable data, revenue analytics, and business insights.' },
  { icon: 'Key', title: 'License Protected', desc: 'Per-gym license enforcement with device registration and audit logging.' }
]

const faqs = [
  { q: 'How does the subscription work?', a: 'Choose a plan (Monthly/Quarterly/Yearly) during gym setup. Payments are processed through PhonePe. Your subscription auto-renews unless cancelled. You can upgrade or downgrade anytime.' },
  { q: 'How do approvals work?', a: 'When a gym registers, a super admin reviews and approves the application. Approved gyms get full access. The approval process typically takes 24-48 hours.' },
  { q: 'How do payments work?', a: 'Members can pay via PhonePe, cash, or card. The system generates invoices automatically. Revenue reports and payment history are available in real-time.' },
  { q: 'What is PhonePe integration?', a: 'IRONPULSE integrates with PhonePe for seamless payment processing. Members get a secure checkout flow, and gym owners receive instant payment confirmations.' },
  { q: 'How does the license system work?', a: 'Each gym gets a license tied to their subscription. Device registration prevents unauthorized access. Licenses can be managed from the settings panel.' },
  { q: 'What support is available?', a: 'We offer email support, documentation, and a ticketing system. Premium plans include priority support and dedicated account management.' }
]

const testimonials = [
  { name: 'Rajesh Sharma', gym: 'FitLife Gym, Mumbai', rating: 5, text: 'IRONPULSE transformed how we manage our gym. Member check-ins, payments, and reports are now effortless. The PhonePe integration alone saved us hours of manual work.' },
  { name: 'Priya Patel', gym: 'Iron Haven, Delhi', rating: 5, text: 'The dashboard gives me complete visibility into my business. Revenue tracking, member retention, and trainer management — all in one place. Worth every rupee.' },
  { name: 'Amit Verma', gym: 'Powerhouse Fitness, Bangalore', rating: 5, text: 'We tried 4 other platforms before IRONPULSE. Nothing comes close to the feature set and polish. The workout and diet plan modules are game changers.' },
  { name: 'Sneha Reddy', gym: 'Peak Performance, Hyderabad', rating: 4, text: 'The attendance system with QR check-in is brilliant. Our members love the PWA — no app store needed. Reports export is a lifesaver for our monthly reviews.' },
  { name: 'Vikram Singh', gym: 'Titan Gym, Pune', rating: 5, text: 'Setup was incredibly smooth. The multi-tenant architecture means I can manage multiple gym locations from one super admin account. Highly recommended.' }
]

function Landing() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeFaq, setActiveFaq] = useState(null)
  const [testiIdx, setTestiIdx] = useState(0)
  const [installPrompt, setInstallPrompt] = useState(null)
  const heroRef = useRef(null)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!heroRef.current) return
      const r = heroRef.current.getBoundingClientRect()
      setMousePos({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    document.querySelectorAll('.lp-feature-card').forEach(c => {
      c.addEventListener('mousemove', (e) => {
        const r = c.getBoundingClientRect()
        c.style.setProperty('--mx', `${e.clientX - r.left}px`)
        c.style.setProperty('--my', `${e.clientY - r.top}px`)
      })
    })
  }, [])

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const r = await installPrompt.userChoice
    if (r.outcome === 'accepted') setInstallPrompt(null)
    setInstallPrompt(null)
  }, [installPrompt])

  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
      size: `${2 + Math.random() * 4}px`, delay: `${Math.random() * 5}s`,
      duration: `${3 + Math.random() * 4}s`
    })), [])

  const scrollTo = (id) => {
    setMobileOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070a12', color: '#e4e8f0', fontFamily: "'Barlow', sans-serif", overflow: 'hidden' }}>

      {/* ── NAVBAR ── */}
      <nav className={scrolled ? 'lp-nav-scrolled' : ''} style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 48px', transition: 'all 0.3s ease',
        background: scrolled ? undefined : 'rgba(7,10,18,0.5)',
        backdropFilter: scrolled ? undefined : 'blur(8px)',
        borderBottom: scrolled ? undefined : '1px solid rgba(255,255,255,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #e8420a, #ff6a2a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: 'white'
          }}>IP</div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', color: '#e4e8f0' }}>IRONPULSE</span>
        </div>

        <div className="lp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {['Features', 'Pricing', 'About', 'FAQ', 'Contact'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} onClick={(e) => { e.preventDefault(); scrollTo(l.toLowerCase()) }} style={{
              fontSize: 13, fontWeight: 500, letterSpacing: '0.06em', color: '#6070a0', textTransform: 'uppercase',
              textDecoration: 'none', transition: 'color 0.2s', cursor: 'pointer'
            }} onMouseEnter={e => e.target.style.color = '#e8420a'} onMouseLeave={e => e.target.style.color = '#6070a0'}>{l}</a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/auth?tab=login')} className="lp-btn-secondary" style={{ padding: '10px 22px', fontSize: 13 }}>Sign In</button>
          <button onClick={() => navigate('/auth?tab=signup')} className="lp-btn-primary" style={{ padding: '10px 22px', fontSize: 13 }}>Get Started</button>
          <button className="lp-mobile-btn" onClick={() => setMobileOpen(o => !o)}
            style={{ display: 'none', background: 'none', border: 'none', color: '#e4e8f0', fontSize: 24, cursor: 'pointer', padding: 4 }}>
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile menu */}
        <div className={`lp-mobile-menu ${mobileOpen ? 'open' : ''}`} style={{
          display: 'none', position: 'fixed', top: 62, left: 0, right: 0,
          flexDirection: 'column', background: 'rgba(7,10,18,0.98)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)', padding: 20, gap: 16, zIndex: 999,
          animation: mobileOpen ? 'slideDown 0.25s ease' : undefined
        }}>
          {['Features', 'Pricing', 'About', 'FAQ', 'Contact'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} onClick={(e) => { e.preventDefault(); scrollTo(l.toLowerCase()) }} style={{
              fontSize: 15, fontWeight: 500, color: '#a0aac0', textDecoration: 'none', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'
            }}>{l}</a>
          ))}
          <button onClick={() => navigate('/auth?tab=signup')} className="lp-btn-primary" style={{ width: '100%', marginTop: 8 }}>Get Started</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="lp-grid-bg" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative',
        padding: '120px 48px 80px', overflow: 'hidden'
      }}>
        {/* Glow orbs */}
        <div style={{ position: 'absolute', top: '10%', left: '5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,66,10,0.08), transparent 70%)', pointerEvents: 'none', animation: 'drift 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '5%', right: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,180,0.06), transparent 70%)', pointerEvents: 'none', animation: 'drift 25s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', top: '40%', right: '30%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,66,10,0.05), transparent 70%)', pointerEvents: 'none', animation: 'pulse-glow 6s ease-in-out infinite' }} />

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} className="lp-particle" style={{
            left: p.left, top: p.top, width: p.size, height: p.size,
            animation: `float ${p.duration} ease-in-out ${p.delay} infinite`
          }} />
        ))}

        <div className="lp-hero-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 2, gap: 60 }}>

          {/* Left */}
          <div className="lp-hero-left" style={{ flex: '0 0 1', maxWidth: 600, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
              background: 'rgba(232,66,10,0.1)', border: '1px solid rgba(232,66,10,0.2)', color: '#ff6a2a', textTransform: 'uppercase'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff6a2a', display: 'inline-block' }} />
              Gym Management Platform
            </div>

            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 64, fontWeight: 800,
              lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0
            }}>
              MANAGE YOUR GYM<br />WITH{' '}
              <span style={{
                background: 'linear-gradient(135deg, #e8420a, #ff6a2a, #ff8a4a)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                textShadow: '0 0 40px rgba(232,66,10,0.3)'
              }}>IRONPULSE.</span>
            </h1>

            <p className="lp-hero-subtitle" style={{ fontSize: 17, lineHeight: 1.6, color: '#6070a0', maxWidth: 520, margin: 0 }}>
              Professional all-in-one software for gym owners. Manage members, payments, subscriptions, trainers, reports and business insights from one powerful platform.
            </p>

            <div className="lp-hero-buttons" style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={() => navigate('/auth?tab=signup')} className="lp-btn-primary">Start Free Trial</button>
              <button onClick={() => scrollTo('features')} className="lp-btn-secondary">Watch Demo</button>
            </div>

            <div className="lp-trust-row" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8 }}>
              {['Secure', 'Cloud Based', 'PhonePe', 'License Protected'].map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6070a0' }}>
                  <span style={{ color: '#00c8b4', fontSize: 14 }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — Dashboard Preview */}
          <div className="lp-hero-right" style={{ flex: '0 0 1', maxWidth: 560, position: 'relative', width: '100%' }}>
            {/* Main dashboard mockup */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(12,15,26,0.95), rgba(17,22,40,0.9))',
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
              padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.4), 0 0 60px rgba(232,66,10,0.05)',
              position: 'relative', overflow: 'hidden'
            }}>
              {/* Mock dashboard UI */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
              </div>
              {/* Mini sidebar + content */}
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 36, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[0,1,2,3,4].map(i => <div key={i} style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 8, width: '60%', borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 14 }} />
                  {/* Mini stat cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {['₹2.4L', '156', '89%', '12'].map((v, i) => (
                      <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize: 9, color: '#506080', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{['Revenue','Members','Growth','Trainers'][i]}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: ['#e8420a','#00c8b4','#10b981','#f59e0b'][i] }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {/* Mini bar chart */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 40 }}>
                    {[35, 60, 45, 80, 55, 70, 90].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0', background: i === 6 ? 'linear-gradient(180deg, #e8420a, #ff6a2a)' : 'rgba(255,255,255,0.08)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d} style={{ fontSize: 8, color: '#384860' }}>{d}</span>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating glass cards */}
            <div className="lp-glow-card" style={{
              position: 'absolute', top: '-10%', right: '-8%', animation: 'float 5s ease-in-out infinite'
            }}>
              <div style={{ fontSize: 11, color: '#506080', marginBottom: 4 }}>Today's Revenue</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e8420a' }}>₹12,480</div>
            </div>
            <div className="lp-glow-card" style={{
              position: 'absolute', bottom: '5%', left: '-12%', animation: 'float-delayed 6s ease-in-out infinite'
            }}>
              <div style={{ fontSize: 11, color: '#506080', marginBottom: 4 }}>Active Members</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#00c8b4' }}>156</div>
            </div>
            <div className="lp-glow-card" style={{
              position: 'absolute', top: '50%', right: '-10%', animation: 'float-slow 7s ease-in-out infinite'
            }}>
              <div style={{ fontSize: 11, color: '#506080', marginBottom: 4 }}>Attendance</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>89%</div>
            </div>
            <div className="lp-glow-card" style={{
              position: 'absolute', bottom: '30%', left: '-15%', animation: 'float 8s ease-in-out infinite'
            }}>
              <div style={{ fontSize: 11, color: '#506080', marginBottom: 4 }}>Monthly Growth</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>+32%</div>
            </div>
            <div className="lp-glow-card" style={{
              position: 'absolute', top: '15%', left: '-10%', animation: 'float-delayed 5.5s ease-in-out infinite'
            }}>
              <div style={{ fontSize: 11, color: '#506080', marginBottom: 4 }}>Subscription</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#8b5cf6' }}>Active ✓</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FLOATING METRICS ── */}
      <section style={{ padding: '0 48px 60px', position: 'relative', marginTop: -40 }}>
        <div className="lp-floating-metrics" style={{
          display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap',
          position: 'relative', zIndex: 3
        }}>
          {[
            { val: 32, suffix: '%', label: 'Member Growth', color: '#10b981' },
            { val: 240000, suffix: '', label: 'Monthly Revenue', color: '#e8420a', fmt: true },
            { val: 999, suffix: '%', label: 'Uptime', color: '#00c8b4' },
            { val: 500, suffix: '+', label: 'Gyms Onboarded', color: '#f59e0b' }
          ].map((m, i) => (
            <div key={i} className="lp-glow-card" style={{
              padding: '20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              animation: `float ${5 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`, minWidth: 160
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: m.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1 }}>
                {m.fmt ? <><Counter end={240} />{m.suffix}</> : <><Counter end={m.val} />{m.suffix}</>}
              </div>
              <div style={{ fontSize: 12, color: '#506080', letterSpacing: '0.04em' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <section style={{ padding: '40px 48px', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
        <Reveal>
          <p style={{ fontSize: 12, color: '#506080', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 24 }}>Trusted by Growing Gyms</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap' }}>
            {[
              { val: 500, suffix: '+', label: 'Gyms', color: '#e8420a' },
              { val: 50, suffix: 'K+', label: 'Members', color: '#00c8b4' },
              { val: 10, suffix: 'Cr+', label: 'Processed', color: '#f59e0b' },
              { val: 999, suffix: '%', label: 'Availability', color: '#10b981' }
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: s.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1 }}>
                  {i === 2 ? <><Counter end={10} />Cr+</> : i === 1 ? <><Counter end={50} />K+</> : <><Counter end={s.val} />{s.suffix}</>}
                </div>
                <div style={{ fontSize: 13, color: '#6070a0', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '100px 48px' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 60 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: '#e8420a', textTransform: 'uppercase', marginBottom: 8 }}>Everything Included</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
            Everything your gym needs.<br />Nothing it doesn't.
          </h2>
        </Reveal>

        <div className="lp-features-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 20,
          maxWidth: 1200, margin: '0 auto'
        }}>
          {features.map((f, i) => (
            <Reveal key={f.title}>
              <div className="lp-feature-card" style={{ animationDelay: `${i * 0.05}s` }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(232,66,10,0.12), rgba(255,106,42,0.08))',
                  border: '1px solid rgba(232,66,10,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: '#e8420a', marginBottom: 16
                }}>
                  {['👥','📋','✅','🏋️','🥗','💰','📊','📅'][i]}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e4e8f0', margin: '0 0 8px' }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: '#6070a0', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── DASHBOARD SHOWCASE ── */}
      <section style={{ padding: '100px 48px', background: 'rgba(255,255,255,0.01)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 50 }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: '0 0 12px' }}>
            Everything in one dashboard.
          </h2>
          <p style={{ fontSize: 15, color: '#6070a0', maxWidth: 500, margin: '0 auto' }}>
            Complete visibility into every aspect of your gym business from a single, powerful interface.
          </p>
        </Reveal>

        <div className="lp-showcase-images" style={{
          display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, maxWidth: 1100, margin: '0 auto'
        }}>
          {/* Main dashboard */}
          <Reveal>
            <div style={{
              background: 'linear-gradient(145deg, rgba(12,15,26,0.9), rgba(17,22,40,0.85))',
              borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: 24,
              boxShadow: '0 16px 60px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <div>
                  {/* Chart */}
                  <div style={{ height: 100, display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 8 }}>
                    {[40, 65, 50, 85, 60, 75, 95, 70, 90, 55, 80, 88].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '3px 3px 0 0', background: i % 3 === 0 ? 'linear-gradient(180deg, #e8420a, #ff6a2a)' : 'rgba(255,255,255,0.06)' }} />
                    ))}
                  </div>
                  <div style={{ height: 6, width: '40%', borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginTop: 4 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[1,2,3,4].map(i => <div key={i} style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />)}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Side panels grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Reports', bars: [70, 50, 90, 60] },
              { label: 'Payments', bars: [60, 85, 55, 95] },
              { label: 'Members', bars: [80, 70, 65, 75] }
            ].map((s, i) => (
              <Reveal key={s.label}>
                <div style={{
                  background: 'linear-gradient(145deg, rgba(12,15,26,0.9), rgba(17,22,40,0.85))',
                  borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: 16
                }}>
                  <div style={{ fontSize: 11, color: '#506080', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{s.label}</div>
                  <div style={{ display: 'flex', gap: 4, height: 32, alignItems: 'flex-end' }}>
                    {s.bars.map((h, j) => (
                      <div key={j} style={{ flex: 1, height: `${h}%`, borderRadius: '3px 3px 0 0', background: i === 0 ? '#f59e0b' : i === 1 ? '#e8420a' : '#00c8b4', opacity: 0.7 }} />
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="about" style={{ padding: '100px 48px' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 60 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: '#00c8b4', textTransform: 'uppercase', marginBottom: 8 }}>Simple Process</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: 0 }}>How It Works</h2>
        </Reveal>

        <div className="lp-how-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
          {[
            { step: '01', title: 'Register Gym', desc: 'Sign up your gym with basic details. Takes less than 5 minutes.' },
            { step: '02', title: 'Get Approved', desc: 'Super admin reviews and approves your application within 24-48 hours.' },
            { step: '03', title: 'Choose Plan', desc: 'Pick a subscription plan that fits your gym size and requirements.' },
            { step: '04', title: 'Setup Gym', desc: 'Configure your gym profile, trainers, members, and plan details.' },
            { step: '05', title: 'Add Members', desc: 'Import or add members manually. Assign plans and start tracking.' },
            { step: '06', title: 'Start Managing', desc: 'Use attendance, payments, reports, and all tools from day one.' },
            { step: '07', title: 'Grow Business', desc: 'Analytics and insights help you make data-driven decisions to grow.' }
          ].map((s, i) => (
            <Reveal key={s.step}>
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 14, padding: 24, position: 'relative',
                transition: 'all 0.3s ease'
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: i === 6 ? 'linear-gradient(135deg, #e8420a, #ff6a2a)' : 'rgba(232,66,10,0.1)',
                  border: i === 6 ? 'none' : '1px solid rgba(232,66,10,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: i === 6 ? 'white' : '#e8420a',
                  marginBottom: 14
                }}>{s.step}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e4e8f0', margin: '0 0 6px' }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: '#6070a0', margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── WHY CHOOSE IRONPULSE ── */}
      <section style={{ padding: '100px 48px', background: 'rgba(255,255,255,0.01)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 50 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: '#e8420a', textTransform: 'uppercase', marginBottom: 8 }}>Why Choose Us</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: 0 }}>Built for modern gyms</h2>
        </Reveal>

        <div className="lp-benefits-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 1000, margin: '0 auto'
        }}>
          {benefits.map((b, i) => (
            <Reveal key={b.title}>
              <div className="lp-benefit-card">
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: i % 2 === 0 ? 'linear-gradient(135deg, rgba(232,66,10,0.12), rgba(255,106,42,0.08))' : 'linear-gradient(135deg, rgba(0,200,180,0.12), rgba(0,200,180,0.08))',
                  border: `1px solid ${i % 2 === 0 ? 'rgba(232,66,10,0.12)' : 'rgba(0,200,180,0.12)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, color: i % 2 === 0 ? '#e8420a' : '#00c8b4', margin: '0 auto 16px'
                }}>
                  {['⚡','🛡️','☁️','👥','📊','🔑'][i]}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e4e8f0', margin: '0 0 6px' }}>{b.title}</h3>
                <p style={{ fontSize: 13, color: '#6070a0', margin: 0, lineHeight: 1.5 }}>{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '100px 48px' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 50 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: '#00c8b4', textTransform: 'uppercase', marginBottom: 8 }}>Pricing</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: 0 }}>
            Simple, transparent pricing
          </h2>
        </Reveal>

        <div className="lp-pricing-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 20, maxWidth: 1150, margin: '0 auto'
        }}>
          {[
            { name: 'Trial', price: 0, period: '14 days', color: '#f59e0b', features: ['Gym floor access', '1 trainer session', 'Basic reports', 'Up to 20 members'], popular: false },
            { name: 'Standard', price: 99, period: '/month', color: '#00c8b4', features: ['Full gym access', '2 trainer sessions/week', 'Diet & workout plans', 'Progress tracking', 'QR check-in'], popular: false },
            { name: 'Premium', price: 199, period: '/month', color: '#e8420a', features: ['Everything in Standard', 'Unlimited sessions', 'Priority support', 'Custom reports', 'Multiple locations'], popular: true },
            { name: 'Quarterly', price: 299, period: '/quarter', color: '#8b5cf6', features: ['Everything in Premium', 'Dedicated account manager', 'API access', 'White-label option', 'Early feature access'], popular: false },
            { name: 'Enterprise', price: null, period: 'Custom', color: '#10b981', features: ['Everything in Yearly', 'On-premise option', 'Custom integrations', 'SLA guarantee', '24/7 phone support'], popular: false }
          ].map((p, i) => (
            <Reveal key={p.name}>
              <div className={`lp-pricing-card ${p.popular ? 'popular' : ''}`}>
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #e8420a, #ff6a2a)', color: 'white',
                    fontSize: 9, fontWeight: 700, padding: '3px 14px', borderRadius: 20,
                    letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap'
                  }}>Recommended</div>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{p.name}</div>
                {p.price !== null ? (
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 38, fontWeight: 800, color: '#e4e8f0', lineHeight: 1.1 }}>
                    ₹{p.price.toLocaleString()}
                    <span style={{ fontSize: 14, fontWeight: 400, color: '#6070a0', fontFamily: "'Barlow', sans-serif" }}>{p.period}</span>
                  </div>
                ) : (
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, color: '#e4e8f0', lineHeight: 1.1 }}>Custom</div>
                )}
                <div style={{ margin: '16px 0 20px', flex: 1 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ fontSize: 13, color: '#a0aac0', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: p.color }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/auth?tab=signup')} className="lp-btn-primary" style={{
                  width: '100%', justifyContent: 'center', padding: '12px',
                  background: p.popular ? 'linear-gradient(135deg, #e8420a, #ff6a2a)' : 'rgba(255,255,255,0.06)',
                  boxShadow: p.popular ? '0 4px 20px rgba(232,66,10,0.3)' : 'none',
                  color: p.popular ? 'white' : '#a0aac0',
                  border: p.popular ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14, fontWeight: 600, borderRadius: 10, cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}>
                  {p.price === 0 ? 'Start Trial' : p.price === null ? 'Contact Us' : 'Get Started'}
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '100px 48px', background: 'rgba(255,255,255,0.01)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 50 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: '#e8420a', textTransform: 'uppercase', marginBottom: 8 }}>Testimonials</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: 0 }}>Trusted by gym owners</h2>
        </Reveal>

        <div style={{ overflow: 'hidden', maxWidth: 1100, margin: '0 auto' }}>
          <div className="lp-testimonials-row" style={{
            display: 'flex', gap: 20, transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
            transform: `translateX(-${testiIdx * (340 + 20)}px)`
          }}>
            {testimonials.map(t => (
              <div key={t.name} className="lp-testimonial-card">
                <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} style={{ color: i < t.rating ? '#f59e0b' : 'rgba(255,255,255,0.08)', fontSize: 14 }}>★</span>
                  ))}
                </div>
                <p style={{ fontSize: 14, color: '#a0aac0', lineHeight: 1.6, margin: '0 0 16px', fontStyle: 'italic' }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #e8420a, #ff6a2a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0
                  }}>{t.name.split(' ').map(n => n[0]).join('')}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e8f0' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#506080' }}>{t.gym}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
            {testimonials.map((_, i) => (
              <div key={i} className={`lp-dot ${i === testiIdx ? 'active' : ''}`} onClick={() => setTestiIdx(i)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: '100px 48px' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 50 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: '#00c8b4', textTransform: 'uppercase', marginBottom: 8 }}>FAQ</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, margin: 0 }}>
            Frequently asked questions
          </h2>
        </Reveal>

        <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map((f, i) => (
            <Reveal key={i}>
              <div className={`lp-faq-q ${activeFaq === i ? 'open' : ''}`} onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#e4e8f0' }}>{f.q}</span>
                  <span style={{
                    fontSize: 18, color: activeFaq === i ? '#e8420a' : '#6070a0',
                    transition: 'transform 0.3s ease', transform: activeFaq === i ? 'rotate(45deg)' : 'rotate(0)'
                  }}>+</span>
                </div>
                <div className="lp-faq-answer" style={{ maxHeight: activeFaq === i ? 200 : 0, opacity: activeFaq === i ? 1 : 0 }}>
                  <p style={{ fontSize: 14, color: '#6070a0', lineHeight: 1.6, margin: '12px 0 0' }}>{f.a}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{
        padding: '100px 48px',
        background: 'linear-gradient(135deg, rgba(232,66,10,0.06), rgba(0,200,180,0.04))',
        borderTop: '1px solid rgba(232,66,10,0.08)',
        textAlign: 'center', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '60%', height: '60%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,66,10,0.04), transparent 70%)',
          pointerEvents: 'none'
        }} />
        <Reveal style={{ position: 'relative', zIndex: 2 }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 52, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.1 }}>
            Ready to modernize your gym?
          </h2>
          <p style={{ fontSize: 17, color: '#6070a0', marginBottom: 32, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Start your free trial today. No credit card required. Full access for 14 days.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/auth?tab=signup')} className="lp-btn-primary" style={{ padding: '16px 40px', fontSize: 16 }}>
              Get Started Free
            </button>
            <button onClick={() => navigate('/auth?tab=login')} className="lp-btn-secondary" style={{ padding: '16px 40px', fontSize: 16 }}>
              Book a Demo
            </button>
          </div>
        </Reveal>

        {installPrompt && (
          <Reveal>
            <div style={{ marginTop: 40, padding: '20px 32px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'inline-flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 24 }}>📲</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e8f0' }}>Install IRONPULSE</div>
                <div style={{ fontSize: 12, color: '#6070a0' }}>Get the app for quick access and offline support.</div>
              </div>
              <button onClick={handleInstall} className="lp-btn-primary" style={{ padding: '10px 24px', fontSize: 13 }}>Install</button>
            </div>
          </Reveal>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '60px 48px 32px', borderTop: '1px solid rgba(255,255,255,0.04)',
        background: '#050810'
      }}>
        <div className="lp-footer-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, maxWidth: 1200, margin: '0 auto 40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'linear-gradient(135deg, #e8420a, #ff6a2a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12, color: 'white'
              }}>IP</div>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: '0.08em', color: '#e4e8f0' }}>IRONPULSE</span>
            </div>
            <p style={{ fontSize: 13, color: '#506080', lineHeight: 1.6, maxWidth: 300 }}>
              Professional gym management platform. Built for high-performance gyms that demand the best.
            </p>
            {/* Social */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {['𝕏','in','▶','📷'].map((s, i) => (
                <a key={i} href="javascript:void(0)" style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color: '#6070a0', textDecoration: 'none',
                  transition: 'all 0.2s'
                }} onMouseEnter={e => { e.target.style.background = 'rgba(232,66,10,0.1)'; e.target.style.borderColor = 'rgba(232,66,10,0.2)' }}
                  onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.borderColor = 'rgba(255,255,255,0.06)' }}>{s}</a>
              ))}
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#e4e8f0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Product</h4>
            {['Features', 'Pricing', 'Integrations', 'Changelog'].map(l => (
              <a key={l} href="javascript:void(0)" style={{ display: 'block', fontSize: 13, color: '#6070a0', marginBottom: 10, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = '#e8420a'} onMouseLeave={e => e.target.style.color = '#6070a0'}>{l}</a>
            ))}
          </div>
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#e4e8f0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Contact</h4>
            <a href="#" onClick={(e) => { e.preventDefault(); openSupportWhatsApp({ page: 'Landing', issue: 'General Inquiry' }) }}
              style={{ display: 'block', fontSize: 13, color: '#6070a0', marginBottom: 10, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#e8420a'} onMouseLeave={e => e.target.style.color = '#6070a0'}>
              💬 WhatsApp Business<br />+91 9371880039
            </a>
            <a href="mailto:ironpulsexa@gmail.com"
              style={{ display: 'block', fontSize: 13, color: '#6070a0', marginBottom: 10, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#e8420a'} onMouseLeave={e => e.target.style.color = '#6070a0'}>
              ✉️ ironpulsexa@gmail.com
            </a>
            <div style={{ fontSize: 13, color: '#6070a0', lineHeight: 1.6 }}>
              🕐 Business Hours<br />Monday – Saturday<br />9:00 AM – 8:00 PM
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#e4e8f0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Legal</h4>
            {['Privacy', 'Terms', 'License', 'Cookies'].map(l => (
              <a key={l} href="javascript:void(0)" style={{ display: 'block', fontSize: 13, color: '#6070a0', marginBottom: 10, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = '#e8420a'} onMouseLeave={e => e.target.style.color = '#6070a0'}>{l}</a>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 20, textAlign: 'center' }}>
          <div style={{ marginBottom: 12 }}>
            <button onClick={shareWebsite} className="lp-btn-ghost" style={{
              padding: '8px 20px', fontSize: 12, color: '#6070a0', cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, transition: 'all 0.2s'
            }}
              onMouseEnter={e => { e.target.style.background = 'rgba(232,66,10,0.1)'; e.target.style.borderColor = 'rgba(232,66,10,0.2)'; e.target.style.color = '#e8420a' }}
              onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.borderColor = 'rgba(255,255,255,0.06)'; e.target.style.color = '#6070a0' }}>
              🔗 Share Website
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#384860' }}>© 2025 IRONPULSE. All rights reserved. Built for high-performance gyms.</p>
        </div>
      </footer>
    </div>
  )
}

export default Landing
