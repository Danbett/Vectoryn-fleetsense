import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

function ScoreBar({value,color='#22C55E',label}){
  const v=Math.max(0,Math.min(100,+value||0));
  const c=v>=80?'#22C55E':v>=60?'#F59E0B':'#EF4444';
  return(<div style={{marginBottom:6}}>
    {label&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
      <span style={{fontSize:10,color:'rgba(255,255,255,.4)'}}>{label}</span>
      <span style={{fontSize:10,fontWeight:700,color:c}}>{Math.round(v)}</span>
    </div>}
    <div style={{height:5,background:'rgba(255,255,255,.08)',borderRadius:3}}>
      <div style={{height:'100%',borderRadius:3,width:`${v}%`,background:c,transition:'width .8s ease'}}/>
    </div>
  </div>);
}

function ScoreGauge({value=0,size=80}){
  const v=Math.min(100,Math.max(0,+value||0));
  const color=v>=80?'#22C55E':v>=60?'#F59E0B':'#EF4444';
  const r=size/2-6,cx=size/2,cy=size/2;
  const polar=(deg)=>{const rd=(deg-90)*Math.PI/180;return{x:cx+r*Math.cos(rd),y:cy+r*Math.sin(rd)};};
  const arc=(s,e)=>{const sp=polar(s),ep=polar(e),lg=e-s>180?1:0;return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${lg} 1 ${ep.x} ${ep.y}`;};
  return(<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <path d={arc(-135,135)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={7} strokeLinecap="round"/>
    {v>0&&<path d={arc(-135,-135+v/100*270)} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" style={{transition:'all .8s'}}/>}
    <text x={cx} y={cy+5} textAnchor="middle" fontSize={size/4} fontWeight={800} fill={color}>{Math.round(v)}</text>
    <text x={cx} y={cy+size/4+2} textAnchor="middle" fontSize={size/8} fill="rgba(255,255,255,.3)">score</text>
  </svg>);
}

export default function DriversModule(){
  const [drivers,setDrivers]=useState([]);
  const [scores,setScores]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('list');
  const [form,setForm]=useState({name:'',phone:'',email:'',licenseNo:'',ibuttonId:''});
  const [saving,setSaving]=useState(false);
  const [scoring,setScoring]=useState({});
  const [selDriver,setSelDriver]=useState(null);

  useEffect(()=>{load();},[]);

  async function load(){
    setLoading(true);
    const [d,s]=await Promise.all([
      apiFetch('/drivers').catch(()=>({data:[]})),
      apiFetch('/drivers/scores').catch(()=>({data:[]}))
    ]);
    setDrivers(d?.data||[]);setScores(s?.data||[]);setLoading(false);
  }

  async function save(){
    setSaving(true);
    await apiFetch('/drivers',{method:'POST',body:JSON.stringify(form)}).catch(()=>{});
    setSaving(false);setForm({name:'',phone:'',email:'',licenseNo:'',ibuttonId:''});setTab('list');load();
  }

  async function computeScore(driver){
    setScoring(s=>({...s,[driver.id]:true}));
    await apiFetch(`/drivers/${driver.id}/score`,{method:'POST'}).catch(()=>{});
    setScoring(s=>({...s,[driver.id]:false}));load();
  }

  const inp=(label,key,type='text')=>(
    <div style={{marginBottom:14}}>
      <label style={{fontSize:11,color:'rgba(255,255,255,.4)',display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>
      <input type={type} value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
        style={{width:'100%',padding:'9px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
    </div>
  );

  return(<div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    <div style={{padding:'16px 24px 10px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div>
          <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Fleet</div>
          <h2 style={{fontSize:20,fontWeight:800}}>Drivers</h2>
        </div>
        <div style={{flex:1}}/>
        {['list','scores','new'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'7px 18px',background:tab===t?'#0D7377':'rgba(255,255,255,.06)',border:`1px solid ${tab===t?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:8,color:tab===t?'#fff':'rgba(255,255,255,.5)',fontSize:12,fontWeight:tab===t?700:400,cursor:'pointer',textTransform:'capitalize'}}>{t==='new'?'+ Add Driver':t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>
    </div>

    <div style={{flex:1,overflow:'auto',padding:20}}>
      {loading?<div style={{color:'rgba(255,255,255,.3)'}}>Loading...</div>:

      tab==='list'?(<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
        {drivers.length===0?(<div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,.25)',gridColumn:'1/-1'}}>
          <div style={{fontSize:40,marginBottom:8}}>👤</div>
          <div style={{marginBottom:16}}>No drivers registered yet</div>
          <button onClick={()=>setTab('new')} style={{padding:'9px 24px',background:'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Add First Driver</button>
        </div>):
        drivers.map(d=>{
          const scoreVal=d.score_overall??'—';
          const scoreNum=typeof scoreVal==='number'?scoreVal:null;
          const scoreColor=scoreNum===null?'rgba(255,255,255,.3)':scoreNum>=80?'#22C55E':scoreNum>=60?'#F59E0B':'#EF4444';
          return(<div key={d.id} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:18,cursor:'pointer'}}
            onClick={()=>{setSelDriver(d);setTab('scores');}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(13,115,119,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>👤</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700}}>{d.name}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:2}}>{d.phone||'—'} · {d.license_no||'No license'}</div>
                {d.ibutton_id&&<div style={{fontSize:10,color:'#0D7377',marginTop:2}}>iButton: {d.ibutton_id}</div>}
              </div>
              {scoreNum!==null&&<ScoreGauge value={scoreNum} size={56}/>}
            </div>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button onClick={e=>{e.stopPropagation();computeScore(d);}} disabled={scoring[d.id]}
                style={{flex:1,padding:'6px',background:'rgba(13,115,119,.15)',border:'1px solid rgba(13,115,119,.3)',borderRadius:6,color:'#0D7377',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                {scoring[d.id]?'Computing...':'📊 Score Now'}
              </button>
            </div>
          </div>);
        })}
      </div>):

      tab==='scores'?(<div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:16,color:'rgba(255,255,255,.7)'}}>Driver Behaviour Scores (30d)</div>
        {scores.length===0?<div style={{color:'rgba(255,255,255,.3)',textAlign:'center',padding:'40px 0'}}><div style={{fontSize:40,marginBottom:8}}>📊</div>No scores yet — click Score Now on any driver</div>:
        <div style={{display:'grid',gap:12}}>
          {scores.map((s,i)=>{
            const v=+(s.avg_score||0);
            const color=v>=80?'#22C55E':v>=60?'#F59E0B':'#EF4444';
            return(<div key={i} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:18}}>
              <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
                <ScoreGauge value={v} size={72}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700}}>{s.name}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:3}}>{s.total_trips||0} trips · {(+s.total_distance_km||0).toFixed(0)} km</div>
                </div>
                <div style={{fontSize:28,fontWeight:900,color}}>{Math.round(v)}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <ScoreBar label="Speeding" value={s.avg_speeding}/>
                <ScoreBar label="Braking" value={s.avg_braking}/>
                <ScoreBar label="Acceleration" value={s.avg_acceleration}/>
                <ScoreBar label="Cornering" value={s.avg_cornering}/>
              </div>
            </div>);
          })}
        </div>}
      </div>):

      (<div style={{maxWidth:480}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Register New Driver</div>
        {inp('Full Name','name')}
        {inp('Phone Number','phone','tel')}
        {inp('Email','email','email')}
        {inp('License Number','licenseNo')}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,color:'rgba(255,255,255,.4)',display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:.5}}>iButton ID (Dallas key)</label>
          <input value={form.ibuttonId||''} onChange={e=>setForm(f=>({...f,ibuttonId:e.target.value}))}
            placeholder="e.g. 0000AB1234CD"
            style={{width:'100%',padding:'9px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:13,outline:'none',fontFamily:'monospace',boxSizing:'border-box'}}/>
          <div style={{fontSize:10,color:'rgba(255,255,255,.25)',marginTop:4}}>Scan iButton key ID from Teltonika Configurator → I/O → 1-Wire → Key ID</div>
        </div>
        <button onClick={save} disabled={saving||!form.name}
          style={{width:'100%',padding:'11px',background:'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',opacity:!form.name?.5:1}}>
          {saving?'Saving...':'Save Driver'}
        </button>
      </div>)}
    </div>
  </div>);
}
