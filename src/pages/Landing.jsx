import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') setInstallPrompt(null)
    setInstallPrompt(null)
  }

  return (
    <div className="landing">
      {/* NAV */}
      <nav className="landing-nav">
        <div className="landing-logo">IRONPULSE</div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About</a>
          <button className="cta-outline" style={{ padding:'8px 20px', fontSize:'12px' }}
            onClick={() => navigate('/auth?tab=login')}>
            Sign In
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero-section">
        <div className="hero-glow" />
        <div className="hero-glow2" />
        <p className="hero-label">Gym Management Platform</p>
        <h1 className="hero-h1">IRONPULSE</h1>
        <h2 className="hero-h2">Manage your gym with precision.</h2>
        <p className="hero-p">
          Admin controls, trainer tools, and member access —<br />
          all in one high-performance platform.
        </p>
        <div className="hero-cta">
          <button className="cta-primary" onClick={() => navigate('/auth?tab=signup')}>GET STARTED →</button>
          <button className="cta-outline" onClick={() => navigate('/auth?tab=login')}>SIGN IN</button>
        </div>

        {/* ROLE CARDS */}
        <div className="role-cards">
          <div className="role-card" onClick={() => navigate('/auth')}>
            <span className="role-card-icon">⚡</span>
            <div className="role-card-name">Admin</div>
            <div className="role-card-desc">Full platform control. Members, billing, reports.</div>
          </div>
          <div className="role-card" onClick={() => navigate('/auth')}>
            <span className="role-card-icon">🏋️</span>
            <div className="role-card-name">Trainer</div>
            <div className="role-card-desc">Manage clients, sessions and workout plans.</div>
          </div>
          <div className="role-card" onClick={() => navigate('/auth')}>
            <span className="role-card-icon">💪</span>
            <div className="role-card-name">Member</div>
            <div className="role-card-desc">Track your fitness, diet and progress.</div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding:'80px 48px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ textAlign:'center', fontSize:'12px', letterSpacing:'0.3em', color:'#00c8b4', textTransform:'uppercase', marginBottom:'12px' }}>Everything Included</p>
        <h2 style={{ textAlign:'center', fontFamily:"'Barlow Condensed',sans-serif", fontSize:'40px', fontWeight:800, color:'#e8eaf0', marginBottom:'48px' }}>
          Built for serious gyms
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'20px', maxWidth:'1000px', margin:'0 auto' }}>
          {[
            { icon:'👥', title:'Member Management',    desc:'Full profiles, plans, attendance tracking and check-in system.' },
            { icon:'💳', title:'Billing & Payments',   desc:'Invoices, payment tracking, auto reminders for due amounts.' },
            { icon:'🏃', title:'Workout Plans',         desc:'Custom routines with sets, reps, rest times and AI suggestions.' },
            { icon:'🥗', title:'Diet Plans',            desc:'Macro-tracked meal plans assigned per member goal.' },
            { icon:'📊', title:'Progress Tracking',     desc:'Weight, body fat and strength charts over time.' },
            { icon:'📱', title:'QR Check-in',           desc:'Scan-based check-in system for fast member entry.' },
            { icon:'🔔', title:'Smart Notifications',   desc:'Expiry alerts, payment reminders and announcements.' },
            { icon:'📈', title:'Reports & Analytics',   desc:'Revenue, attendance and member growth reports.' },
          ].map(f => (
            <div key={f.title} style={{ background:'rgba(17,24,40,0.6)', border:'1px solid rgba(0,200,180,0.1)', borderRadius:'10px', padding:'24px' }}>
              <div style={{ fontSize:'28px', marginBottom:'10px' }}>{f.icon}</div>
              <h3 style={{ fontSize:'15px', fontWeight:700, color:'#e8eaf0', marginBottom:'6px' }}>{f.title}</h3>
              <p style={{ fontSize:'13px', color:'#6070a0', lineHeight:1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding:'80px 48px', borderTop:'1px solid rgba(255,255,255,0.05)', textAlign:'center' }}>
        <p style={{ fontSize:'12px', letterSpacing:'0.3em', color:'#00c8b4', textTransform:'uppercase', marginBottom:'12px' }}>Membership Plans</p>
        <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'40px', fontWeight:800, color:'#e8eaf0', marginBottom:'48px' }}>Simple, transparent pricing</h2>
        <div style={{ display:'flex', gap:'16px', justifyContent:'center', flexWrap:'wrap', maxWidth:'900px', margin:'0 auto' }}>
          {[
            { name:'Trial',    price:'499',  period:'/month', color:'#f59e0b', features:['Gym floor access','1 trainer session','Basic diet advice'] },
            { name:'Standard', price:'1,499',period:'/month', color:'#00c8b4', features:['Full gym access','2 trainer sessions/week','Diet plan','Progress tracking'], popular:false },
            { name:'Premium',  price:'2,999',period:'/month', color:'#e8420a', features:['Full gym access','Unlimited sessions','Custom diet plan','Progress tracking','QR check-in','Locker'], popular:true },
          ].map(p => (
            <div key={p.name} style={{
              background: p.popular ? 'rgba(232,66,10,0.06)' : 'rgba(17,24,40,0.6)',
              border: `1px solid ${p.popular ? p.color : 'rgba(0,200,180,0.1)'}`,
              borderRadius:'12px', padding:'28px 24px', minWidth:'220px', flex:1, maxWidth:'260px',
              position:'relative'
            }}>
              {p.popular && <div style={{ position:'absolute', top:'-12px', left:'50%', transform:'translateX(-50%)', background:'#e8420a', color:'white', fontSize:'10px', fontWeight:700, padding:'3px 12px', borderRadius:'10px', letterSpacing:'0.1em', textTransform:'uppercase' }}>POPULAR</div>}
              <div style={{ fontSize:'13px', fontWeight:700, color:p.color, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'8px' }}>{p.name}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:'42px', fontWeight:700, color:'#e8eaf0', lineHeight:1 }}>₹{p.price}</div>
              <div style={{ fontSize:'12px', color:'#6070a0', marginBottom:'20px' }}>{p.period}</div>
              <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:'8px', marginBottom:'24px' }}>
                {p.features.map(f => <li key={f} style={{ fontSize:'13px', color:'#a0aac0', display:'flex', alignItems:'center', gap:'8px' }}><span style={{ color:p.color }}>✓</span>{f}</li>)}
              </ul>
              <button className="btn btn-outline" style={{ width:'100%', justifyContent:'center', borderColor:p.color, color:p.color }}
                onClick={() => navigate('/auth')}>
                Get Started
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* INSTALL APP */}
      {installPrompt && (
        <section style={{ textAlign:'center', padding:'48px 24px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:'36px', marginBottom:'12px' }}>📲</div>
          <h3 style={{ fontSize:'22px', fontWeight:700, marginBottom:'8px', color:'#e8eaf0' }}>Take IRONPULSE Anywhere</h3>
          <p style={{ fontSize:'14px', color:'#6070a0', marginBottom:'20px' }}>
            Install the app on your device for quick access and offline support.
          </p>
          <button className="btn btn-primary" onClick={handleInstall} style={{ padding:'12px 32px', fontSize:'14px' }}>
            📲 Install App
          </button>
        </section>
      )}

      {/* FOOTER */}
      <footer style={{ padding:'32px 48px', borderTop:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'20px', color:'#e8420a', letterSpacing:'0.1em' }}>IRONPULSE</div>
        <p style={{ fontSize:'12px', color:'#3a4a6a' }}>© 2025 IRONPULSE. Built for high-performance gyms.</p>
        <div style={{ display:'flex', gap:'20px' }}>
          {['Privacy','Terms','Contact'].map(l => (
            <a key={l} href="#" style={{ fontSize:'12px', color:'#3a4a6a' }}>{l}</a>
          ))}
        </div>
      </footer>

    </div>
  )
}