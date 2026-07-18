import { useState } from 'react';
import { login } from './api.js';
export default function Login({ onLogin }) {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);
  async function handleSubmit(e){e.preventDefault();setError('');setLoading(true);
    try{const data=await login(email,password);if(data.error){setError(data.error);setLoading(false);return;}onLogin(data);}
    catch{setError('Connection failed.');setLoading(false);}
  }
  return(<div style={{width:'100vw',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0D1B2A 0%,#1A3A5C 100%)',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,opacity:.04,backgroundImage:'linear-gradient(rgba(13,115,119,1) 1px,transparent 1px),linear-gradient(90deg,rgba(13,115,119,1) 1px,transparent 1px)',backgroundSize:'60px 60px'}}/>
    <div style={{position:'relative',background:'rgba(255,255,255,.04)',border:'1px solid rgba(13,115,119,.3)',borderRadius:16,padding:'48px 40px',width:420,backdropFilter:'blur(12px)'}}>
      <div style={{textAlign:'center',marginBottom:36}}>
        <div style={{width:56,height:56,background:'#0D7377',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:22,fontWeight:900,color:'#fff'}}>VF</div>
        <div style={{fontSize:22,fontWeight:800}}>Vectoryn <span style={{color:'#0D7377'}}>FleetSense</span></div>
        <div style={{fontSize:13,color:'rgba(255,255,255,.4)',marginTop:6}}>Enterprise Fleet Telematics Platform</div>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:'rgba(255,255,255,.5)',letterSpacing:.5,textTransform:'uppercase'}}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus
            style={{display:'block',width:'100%',marginTop:6,padding:'11px 14px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,color:'#fff',fontSize:15,outline:'none'}}
            placeholder="you@company.com"/>
        </div>
        <div style={{marginBottom:24}}>
          <label style={{fontSize:12,color:'rgba(255,255,255,.5)',letterSpacing:.5,textTransform:'uppercase'}}>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
            style={{display:'block',width:'100%',marginTop:6,padding:'11px 14px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,color:'#fff',fontSize:15,outline:'none'}}
            placeholder="••••••••"/>
        </div>
        {error&&<div style={{background:'rgba(232,69,69,.12)',border:'1px solid rgba(232,69,69,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#E84545'}}>{error}</div>}
        <button type="submit" disabled={loading} style={{width:'100%',padding:'13px',background:loading?'#0a5f63':'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:15,fontWeight:700,cursor:loading?'not-allowed':'pointer'}}>
          {loading?'Signing in...':'Sign In →'}
        </button>
      </form>
      <div style={{marginTop:24,textAlign:'center',fontSize:12,color:'rgba(255,255,255,.2)'}}>© 2026 Vectoryn Dynamics Limited</div>
    </div>
  </div>);
}