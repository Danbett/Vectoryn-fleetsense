import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
function KpiTile({label,value,sub,color='#0D7377',icon}){
  return(<div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:'20px 24px',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${color},transparent)`}}/>
    <div style={{fontSize:28,marginBottom:8}}>{icon}</div>
    <div style={{fontSize:28,fontWeight:900,color,lineHeight:1}}>{value}</div>
    <div style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,.8)',marginTop:6}}>{label}</div>
    {sub&&<div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:4}}>{sub}</div>}
  </div>);
}
export default function Dashboard({onNavigate}){
  const [stats,setStats]=useState(null);
  const [alerts,setAlerts]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    Promise.all([
      apiFetch('/telemetry/stats'),
      apiFetch('/alerts/history?size=5&acknowledged=false').catch(()=>({data:[]}))
    ]).then(([s,a])=>{setStats(s?.data);setAlerts(a?.data||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);
  const online=stats?.online??0, total=stats?.total??0, pct=total>0?Math.round(online/total*100):0;
  return(<div style={{padding:32,overflowY:'auto',height:'100%'}}>
    <div style={{marginBottom:28}}>
      <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:6}}>Overview</div>
      <h1 style={{fontSize:26,fontWeight:800}}>Fleet Dashboard</h1>
      <div style={{fontSize:13,color:'rgba(255,255,255,.4)',marginTop:4}}>{new Date().toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · EAT (UTC+3)</div>
    </div>
    {loading?<div style={{color:'rgba(255,255,255,.4)',fontSize:14}}>Loading metrics...</div>:
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:16,marginBottom:32}}>
      <KpiTile icon="🟢" label="Online Now" value={online} sub={`of ${total} assets`} color="#2ecc71"/>
      <KpiTile icon="📡" label="Fleet Online" value={`${pct}%`} sub="connectivity" color="#0D7377"/>
      <KpiTile icon="🚗" label="Total Assets" value={total} sub="registered" color="#2E5FA3"/>
      <KpiTile icon="🔋" label="EV Assets" value="1" sub="TFT100 active" color="#8B5CF6"/>
      <KpiTile icon="🔔" label="Active Alerts" value={alerts.length} sub="unacknowledged" color={alerts.length>0?'#E84545':'#2ecc71'}/>
      <KpiTile icon="📍" label="Positions" value="1,266+" sub="and counting" color="#F59E0B"/>
    </div>}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
      <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:16,color:'rgba(255,255,255,.7)'}}>🚗 Asset Status</div>
        {[{label:'TFT100 – EV Bench Test',status:'online',detail:'Kampala, Uganda · Ignition ON · Battery 100%',color:'#2ecc71'},
          {label:'FMB140 – Bench Test',status:'offline',detail:'No SIM data · Pending',color:'rgba(255,255,255,.3)'}
        ].map(a=>(<div key={a.label} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'rgba(255,255,255,.03)',borderRadius:8,border:'1px solid rgba(255,255,255,.05)',marginBottom:8}}>
          <div style={{width:9,height:9,borderRadius:'50%',background:a.color,flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{a.label}</div><div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:2}}>{a.detail}</div></div>
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:`${a.color}22`,color:a.color,fontWeight:700,textTransform:'uppercase'}}>{a.status}</span>
        </div>))}
        <button onClick={()=>onNavigate('ops.map')} style={{marginTop:8,width:'100%',padding:'9px',background:'rgba(13,115,119,.15)',border:'1px solid rgba(13,115,119,.3)',borderRadius:8,color:'#0D7377',fontSize:13,fontWeight:600,cursor:'pointer'}}>Open Live Map →</button>
      </div>
      <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:16,color:'rgba(255,255,255,.7)'}}>🔔 Recent Alerts</div>
        {alerts.length===0?<div style={{textAlign:'center',padding:'32px 0',color:'rgba(255,255,255,.3)',fontSize:13}}><div style={{fontSize:32,marginBottom:8}}>✅</div>No active alerts</div>:
        alerts.map((a,i)=>(<div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#F59E0B',flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:13}}>{a.name}</div><div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:2}}>{new Date(a.triggered_at).toLocaleString()}</div></div>
        </div>))}
      </div>
    </div>
    <div style={{marginTop:20,background:'linear-gradient(135deg,rgba(139,92,246,.1),rgba(13,115,119,.1))',border:'1px solid rgba(139,92,246,.2)',borderRadius:12,padding:20,display:'flex',alignItems:'center',gap:20}}>
      <div style={{fontSize:48}}>🔋</div>
      <div style={{flex:1}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>TFT100 — EV Asset Live · Kampala, Uganda</div>
        <div style={{fontSize:13,color:'rgba(255,255,255,.55)'}}>Battery: <strong style={{color:'#2ecc71'}}>100%</strong> · Operator: <strong>MTN Uganda</strong> · Satellites: <strong>11</strong> · Power: <strong>11.84V</strong> · 1,266+ positions received</div>
      </div>
      <button onClick={()=>onNavigate('ev')} style={{padding:'9px 20px',background:'rgba(139,92,246,.2)',border:'1px solid rgba(139,92,246,.4)',borderRadius:8,color:'#A78BFA',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>EV Monitor →</button>
    </div>
  </div>);
}
