import { useState, useEffect } from 'react';
import { apiFetch, getToken } from '../api.js';

export default function ReportsModule(){
  const [summary,setSummary]=useState([]);
  const [devices,setDevices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [days,setDays]=useState(7);
  const [selDevice,setSelDevice]=useState('');
  const [devHistory,setDevHistory]=useState(null);
  const [loadingDev,setLoadingDev]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [tab,setTab]=useState('fleet');

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      apiFetch(`/reports/fleet-summary?days=${days}`),
      apiFetch('/fleet/devices?size=200')
    ]).then(([r,d])=>{
      setSummary(r?.data||[]);
      setDevices(d?.data||[]);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[days]);

  async function loadDeviceHistory(){
    if(!selDevice)return;
    setLoadingDev(true);
    const r=await apiFetch(`/reports/device-history?deviceId=${selDevice}&days=${days}`).catch(()=>null);
    setDevHistory(r);setLoadingDev(false);
  }

  async function exportCSV(){
    setExporting(true);
    try{
      const token=getToken();
      const res=await fetch(`/api/v1/reports/export/csv?days=${days}`,{headers:{'X-Session-Token':token}});
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=`fleet-report-${days}d.csv`;a.click();
      URL.revokeObjectURL(url);
    }catch{}
    setExporting(false);
  }

  const totals={
    distance:summary.reduce((a,d)=>a+(+d.distance_km||0),0),
    positions:summary.reduce((a,d)=>a+(+d.position_count||0),0),
    maxSpeed:Math.max(...summary.map(d=>+d.max_speed||0),0),
    engineH:summary.reduce((a,d)=>a+(+d.engine_h||0),0),
  };

  return(<div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    {/* Header */}
    <div style={{padding:'16px 24px 10px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div>
          <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Data</div>
          <h2 style={{fontSize:20,fontWeight:800}}>Reports</h2>
        </div>
        <div style={{flex:1}}/>
        <select value={days} onChange={e=>setDays(+e.target.value)} style={{padding:'7px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:12}}>
          {[1,7,14,30,90].map(d=><option key={d} value={d} style={{background:'#1A3A5C'}}>{d===1?'Today':`Last ${d} days`}</option>)}
        </select>
        {['fleet','device'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'7px 18px',background:tab===t?'#0D7377':'rgba(255,255,255,.06)',border:`1px solid ${tab===t?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:8,color:tab===t?'#fff':'rgba(255,255,255,.5)',fontSize:12,fontWeight:tab===t?700:400,cursor:'pointer',textTransform:'capitalize'}}>{t==='fleet'?'Fleet Summary':'Device History'}</button>
        ))}
        <button onClick={exportCSV} disabled={exporting}
          style={{padding:'7px 18px',background:'rgba(34,197,94,.15)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,color:'#22C55E',fontSize:12,fontWeight:600,cursor:'pointer'}}>
          {exporting?'Exporting...':'⬇ CSV Export'}
        </button>
      </div>
    </div>

    <div style={{flex:1,overflow:'auto',padding:20}}>
      {tab==='fleet'?(<>
        {/* Totals row */}
        {!loading&&(<div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
          {[
            {icon:'📏',label:`Total Distance (${days}d)`,value:`${totals.distance.toFixed(1)} km`,color:'#0D7377'},
            {icon:'📡',label:'Total Positions',value:totals.positions.toLocaleString(),color:'#A78BFA'},
            {icon:'⚡',label:'Fleet Max Speed',value:`${Math.round(totals.maxSpeed)} km/h`,color:'#22C55E'},
            {icon:'⏱',label:'Total Engine Time',value:`${totals.engineH.toFixed(1)} h`,color:'#F59E0B'},
            {icon:'🚗',label:'Assets Tracked',value:summary.length,color:'#2E5FA3'},
          ].map(s=>(
            <div key={s.label} style={{background:'rgba(255,255,255,.04)',border:`1px solid ${s.color}30`,borderRadius:10,padding:'12px 16px',minWidth:130}}>
              <div style={{fontSize:22,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,.45)',marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>)}

        {/* Fleet table */}
        {loading?<div style={{color:'rgba(255,255,255,.3)'}}>Loading report...</div>:
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead style={{position:'sticky',top:0,background:'#0D1B2A',zIndex:1}}>
            <tr>{['Asset','Plate','Type','Make/Model','Terminal','Positions','Distance','Engine h','Max Speed','Avg Speed','First Fix','Last Fix'].map(h=>(
              <th key={h} style={{padding:'8px 10px',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.4)',fontSize:9,textTransform:'uppercase',letterSpacing:.5,whiteSpace:'nowrap'}}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>{summary.map((d,i)=>{
            const isEV=d.powertrain==='ev';
            return(<tr key={d.id} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.02)':'transparent'}}>
              <td style={{padding:'7px 10px',fontWeight:600,whiteSpace:'nowrap'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:isEV?'#A78BFA':'#2E5FA3',flexShrink:0}}/>
                  {d.name}
                </div>
              </td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.5)'}}>{d.plate_no||'—'}</td>
              <td style={{padding:'7px 10px'}}><span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:isEV?'rgba(124,58,237,.2)':'rgba(46,95,163,.2)',color:isEV?'#A78BFA':'#93C5FD',fontWeight:700}}>{(d.powertrain||'ice').toUpperCase()}</span></td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.5)'}}>{[d.make,d.model].filter(Boolean).join(' ')||'—'}</td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.4)',fontSize:10}}>{d.terminal_model||'—'}</td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.6)'}}>{(+d.position_count||0).toLocaleString()}</td>
              <td style={{padding:'7px 10px',color:'#0D7377',fontWeight:700}}>{(+d.distance_km||0).toFixed(1)} km</td>
              <td style={{padding:'7px 10px',color:'#A78BFA'}}>{(+d.engine_h||0).toFixed(1)}</td>
              <td style={{padding:'7px 10px',color:+d.max_speed>80?'#EF4444':+d.max_speed>60?'#F59E0B':'#22C55E',fontWeight:700}}>{d.max_speed?Math.round(+d.max_speed):0}</td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.5)'}}>{d.avg_speed?Math.round(+d.avg_speed):0}</td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.3)',fontSize:10,whiteSpace:'nowrap'}}>{d.first_fix?new Date(d.first_fix).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</td>
              <td style={{padding:'7px 10px',color:'rgba(255,255,255,.3)',fontSize:10,whiteSpace:'nowrap'}}>{d.last_fix?new Date(d.last_fix).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</td>
            </tr>);
          })}</tbody>
        </table>}
      </>):

      (<div>
        <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center'}}>
          <select value={selDevice} onChange={e=>setSelDevice(e.target.value)}
            style={{flex:1,padding:'9px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:13}}>
            <option value="">Select a device...</option>
            {devices.map(d=><option key={d.id} value={d.id} style={{background:'#1A3A5C'}}>{d.name}</option>)}
          </select>
          <button onClick={loadDeviceHistory} disabled={!selDevice||loadingDev}
            style={{padding:'9px 20px',background:'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',opacity:!selDevice?.5:1}}>
            {loadingDev?'Loading...':'Load History'}
          </button>
        </div>
        {devHistory&&(<>
          <div style={{marginBottom:14,fontSize:13,color:'rgba(255,255,255,.6)'}}>
            {devHistory.device?.name} · {devHistory.count} positions in last {days} days
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead style={{position:'sticky',top:0,background:'#0D1B2A'}}>
              <tr>{['Time','Lat','Lon','Speed','Course','Alt'].map(h=>(
                <th key={h} style={{padding:'6px 10px',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.35)',fontSize:9,textTransform:'uppercase',letterSpacing:.5}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>{devHistory.data?.slice(0,500).map((p,i)=>(<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.03)',background:i%2?'rgba(255,255,255,.02)':'transparent'}}>
              <td style={{padding:'4px 10px',color:'rgba(255,255,255,.6)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{new Date(p.fixtime).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td>
              <td style={{padding:'4px 10px',fontFamily:'monospace'}}>{p.latitude?(+p.latitude).toFixed(5):'—'}</td>
              <td style={{padding:'4px 10px',fontFamily:'monospace'}}>{p.longitude?(+p.longitude).toFixed(5):'—'}</td>
              <td style={{padding:'4px 10px',color:+p.speed>0?'#22C55E':'rgba(255,255,255,.4)',fontWeight:600}}>{Math.round(+p.speed||0)}</td>
              <td style={{padding:'4px 10px',color:'rgba(255,255,255,.4)'}}>{p.course||0}°</td>
              <td style={{padding:'4px 10px',color:'rgba(255,255,255,.4)'}}>{p.altitude?Math.round(+p.altitude)+'m':'—'}</td>
            </tr>))}</tbody>
          </table>
          {devHistory.count>500&&<div style={{padding:'10px',textAlign:'center',fontSize:11,color:'rgba(255,255,255,.3)'}}>Showing first 500 of {devHistory.count} records · Export CSV for full dataset</div>}
        </>)}
      </div>)}
    </div>
  </div>);
}
