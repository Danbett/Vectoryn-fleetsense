import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

function parseA(raw){if(!raw)return{};if(typeof raw==='object')return raw;try{return JSON.parse(raw);}catch{return{};}}

function TankGauge({pct=0,color,label,size=64}){
  const v=Math.max(0,Math.min(100,+pct||0));
  const c=color||(v>50?'#A78BFA':v>20?'#EAB308':'#EF4444');
  const r=size/2-6,cx=size/2,cy=size/2;
  function px(deg,rad){const a=(deg-90)*Math.PI/180;return[cx+rad*Math.cos(a),cy+rad*Math.sin(a)];}
  function arc(s,e){const[x1,y1]=px(s,r),[x2,y2]=px(e,r);return 'M '+x1+' '+y1+' A '+r+' '+r+' 0 '+(e-s>180?1:0)+' 1 '+x2+' '+y2;}
  const end=-135+v/100*270;
  return(<svg width={size} height={size} viewBox={'0 0 '+size+' '+size}>
    <path d={arc(-135,135)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={7} strokeLinecap="round"/>
    {v>0 ? <path d={arc(-135,end)} fill="none" stroke={c} strokeWidth={7} strokeLinecap="round" style={{transition:'all .8s'}}/> : null}
    <text x={cx} y={cy+5} textAnchor="middle" fontSize={size/4} fontWeight={800} fill={c}>{Math.round(v)}%</text>
    {label ? <text x={cx} y={cy+size/3} textAnchor="middle" fontSize={size/8} fill="rgba(255,255,255,.3)">{label}</text> : null}
  </svg>);
}

function Sparkline({data,color,width,height}){
  const w=width||200,h=height||50;
  if(!data||data.length<2)return <div style={{width:w,height:h,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>No data</span></div>;
  const max=Math.max(...data,1);
  const pts=data.map((v,i)=>(i/(data.length-1))*w+','+(h-4-(v/max)*(h-8))).join(' ');
  const id='sp'+(Math.random()*1e6|0);
  return(<svg width={w} height={h} viewBox={'0 0 '+w+' '+h} style={{display:'block'}}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polygon points={'0,'+h+' '+pts+' '+w+','+h} fill={'url(#'+id+')'}/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}/>
  </svg>);
}

function StatBox({icon,label,value,color}){
  const c=color||'#0D7377';
  return(<div style={{background:'rgba(255,255,255,.04)',border:'1px solid '+c+'30',borderRadius:10,padding:'14px 18px',minWidth:140,flexShrink:0}}>
    <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
    <div style={{fontSize:20,fontWeight:800,color:c}}>{value}</div>
    <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginTop:4}}>{label}</div>
  </div>);
}

function DeviceTab({selDevice,deviceHist}){
  if(!selDevice)return(<div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,.3)'}}>
    <div style={{fontSize:40,marginBottom:8}}>⚡</div>
    <div>Select an asset from the Overview tab</div>
  </div>);
  const isEV=selDevice.powertrain==='ev';
  const hasData=deviceHist&&deviceHist.data&&deviceHist.data.length>0;
  return(<div>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
      <div style={{fontSize:16,fontWeight:800}}>{selDevice.name}</div>
      <span style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:isEV?'rgba(124,58,237,.25)':'rgba(46,95,163,.25)',color:isEV?'#A78BFA':'#93C5FD',fontWeight:700}}>{(selDevice.powertrain||'ice').toUpperCase()}</span>
    </div>
    {hasData ? (
      <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>Avg Speed (km/h) per hour</div>
          <Sparkline data={deviceHist.data.map(b=>+(b.avg_speed||0))} color="#22C55E" width={300} height={80}/>
        </div>
        {isEV ? (
          <div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>Avg Battery % per hour</div>
            <Sparkline data={deviceHist.data.map(b=>+(b.avg_battery||0))} color="#A78BFA" width={300} height={80}/>
          </div>
        ) : null}
        <div>
          <div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>Avg Voltage (V) per hour</div>
          <Sparkline data={deviceHist.data.map(b=>+(b.avg_voltage||0))} color="#60A5FA" width={300} height={80}/>
        </div>
      </div>
    ) : <div style={{color:'rgba(255,255,255,.3)',fontSize:12}}>No hourly data available</div>}
  </div>);
}

function OverviewTab({summary,days}){
  const totalKm=summary.reduce((a,d)=>a+(+d.distance_km||0),0);
  const totalEngH=summary.reduce((a,d)=>a+(+d.engine_hours||0),0);
  const evCount=summary.filter(d=>d.powertrain==='ev').length;
  const iceCount=summary.filter(d=>d.powertrain!=='ev').length;
  const totalPos=summary.reduce((a,d)=>a+(+d.position_count||0),0);
  return(<div>
    <div style={{display:'flex',gap:12,marginBottom:20,overflowX:'auto',paddingBottom:4}}>
      <StatBox icon="📏" label={'Distance ('+days+'d)'} value={totalKm.toFixed(1)+' km'} color="#0D7377"/>
      <StatBox icon="⏱" label={'Engine Time ('+days+'d)'} value={totalEngH.toFixed(1)+' h'} color="#A78BFA"/>
      <StatBox icon="🚗" label="ICE Assets" value={iceCount} color="#2E5FA3"/>
      <StatBox icon="🔋" label="EV Assets" value={evCount} color="#7C3AED"/>
      <StatBox icon="📡" label="Total Positions" value={totalPos.toLocaleString()} color="#F59E0B"/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
      {summary.map(function(dev){
        const isEV=dev.powertrain==='ev';
        const pct=isEV?(+(dev.battery_pct||0)):0;
        const color=isEV?(pct>50?'#A78BFA':pct>20?'#EAB308':'#EF4444'):'#2E5FA3';
        return(<div key={dev.id} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{dev.name}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginTop:2}}>{dev.plate_no||dev.terminal_model||'—'}</div>
            </div>
            {isEV ? <TankGauge pct={pct} color={color} label="Bat" size={64}/> : null}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {[
              {label:'Distance',value:(+dev.distance_km||0).toFixed(1)+' km'},
              {label:'Engine Time',value:(+dev.engine_hours||0).toFixed(1)+' h'},
              {label:'Max Speed',value:dev.max_speed?Math.round(+dev.max_speed)+' km/h':'—'},
              {label:'Positions',value:(+dev.position_count||0).toLocaleString()},
            ].map(function(f){return(
              <div key={f.label} style={{background:'rgba(255,255,255,.04)',borderRadius:6,padding:'6px 8px'}}>
                <div style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>{f.label}</div>
                <div style={{fontSize:12,fontWeight:700,marginTop:1}}>{f.value}</div>
              </div>
            );})}
          </div>
        </div>);
      })}
    </div>
  </div>);
}

function EventsTab({events,days}){
  if(events.length===0)return(<div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,.25)'}}>
    <div style={{fontSize:40,marginBottom:8}}>⚡</div>
    <div>No significant energy events in the last {days} days</div>
  </div>);
  return(<table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
    <thead><tr>{['Device','Type','Time','Delta %','Range'].map(h=>(
      <th key={h} style={{padding:'8px 12px',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.4)',fontSize:10,textTransform:'uppercase',letterSpacing:.5}}>{h}</th>
    ))}</tr></thead>
    <tbody>{events.map(function(e,i){
      const isCharge=e.event_type==='charge';
      return(<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.02)':'transparent'}}>
        <td style={{padding:'8px 12px',fontWeight:600}}>{e.name}</td>
        <td style={{padding:'8px 12px'}}><span style={{color:isCharge?'#22C55E':'#F59E0B',fontWeight:700}}>{isCharge?'⬆ Charge':'⬇ Discharge'}</span></td>
        <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)',fontSize:11}}>{new Date(e.hour).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
        <td style={{padding:'8px 12px',color:isCharge?'#22C55E':'#EF4444',fontWeight:700}}>{e.delta?((+e.delta>0?'+':'')+Math.round(+e.delta)+'%'):'—'}</td>
        <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)'}}>{(e.min_battery||'—')+'% → '+(e.max_battery||'—')+'%'}</td>
      </tr>);
    })}</tbody>
  </table>);
}

export default function FuelEnergy(){
  const [summary,setSummary]=useState([]);
  const [events,setEvents]=useState([]);
  const [selDevice,setSelDevice]=useState(null);
  const [deviceHist,setDeviceHist]=useState(null);
  const [days,setDays]=useState(7);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('overview');

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      apiFetch('/fuel/summary?days='+days),
      apiFetch('/fuel/events?days='+days)
    ]).then(function(res){
      setSummary(res[0]?.data||[]);
      setEvents(res[1]?.data||[]);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[days]);

  useEffect(()=>{
    if(selDevice){
      apiFetch('/fuel/device/'+selDevice.id+'/history?hours='+(days*24))
        .then(r=>setDeviceHist(r)).catch(()=>{});
    }
  },[selDevice,days]);

  function renderContent(){
    if(loading)return <div style={{color:'rgba(255,255,255,.3)',padding:20}}>Loading...</div>;
    if(tab==='overview')return <OverviewTab summary={summary} days={days}/>;
    if(tab==='events')return <EventsTab events={events} days={days}/>;
    if(tab==='device')return <DeviceTab selDevice={selDevice} deviceHist={deviceHist}/>;
    return null;
  }

  return(<div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    <div style={{padding:'16px 24px 10px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div>
          <div style={{fontSize:11,color:'#F59E0B',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Intelligence</div>
          <h2 style={{fontSize:20,fontWeight:800}}>Fuel & Energy</h2>
        </div>
        <div style={{flex:1}}/>
        {['overview','events','device'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'7px 18px',background:tab===t?'#0D7377':'rgba(255,255,255,.06)',border:'1px solid '+(tab===t?'#0D7377':'rgba(255,255,255,.1)'),borderRadius:8,color:tab===t?'#fff':'rgba(255,255,255,.5)',fontSize:12,fontWeight:tab===t?700:400,cursor:'pointer',textTransform:'capitalize'}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
        <select value={days} onChange={e=>setDays(+e.target.value)} style={{padding:'7px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:12}}>
          {[1,7,14,30].map(d=><option key={d} value={d} style={{background:'#1A3A5C'}}>{d}d</option>)}
        </select>
      </div>
    </div>
    <div style={{flex:1,overflowY:'auto',padding:20}}>{renderContent()}</div>
  </div>);
}