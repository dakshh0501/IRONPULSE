import { Link } from 'react-router-dom'
export default function NotFound() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh',color:'var(--text-tertiary)'}}>
      <div style={{fontSize:72,marginBottom:16}}>🔍</div>
      <h2 style={{margin:0,fontSize:24,fontWeight:600}}>Page not found</h2>
      <p style={{margin:'8px 0 24px',fontSize:14}}>The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/dashboard" style={{padding:'10px 28px',borderRadius:8,background:'var(--accent)',color:'#fff',textDecoration:'none',fontWeight:500}}>Go to Dashboard</Link>
    </div>
  )
}
