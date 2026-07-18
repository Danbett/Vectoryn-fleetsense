import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function EVMonitor(){
  const [devices,setDevices]=useState([]);
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    apiFetch('/telemetry/live').then(r=>{
      const evDevs=(r?.data||[]).filter(d=>d.powertrain==='ev'||(d.attributes?.io113!==undefined));
      setDevices(evDevs);
      // Load history for first EV device
      if(evDevs.length>0){
        apiFetch(`/telemetry/device/${evDevs[0].id}/raw?hours=24`).then(r2=>{
          setHistory(r2?.data||[]); setLoading(false);
        }).catch(()=>setLoading(false));
      } else setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  // Parse SOC trend from history
  const socData=history.slice().reverse().map((m,i)=>{
    const attrs=typeof m.attributes==='object'?m.attributes:{};
    try{ const a=typeof m.attributes==='string'?JSON.parse(m.attributes):m.attributes; return{i,soc:+a.io113||0,t:m.fixtime,pwr:+a.power||0,bat:+a.battery||0}; }
    catch{return{i,soc:0,t:m.fixtime,pwr:0,bat:0};}
  }).filter(d=>d.soc>0);

  const latest=devices[0];
  const latestAttrs=latest?.attributes||{};
  const soc=latestAttrs.io113??'—';
  const power=latestAttrs.power?`${latestAttrs.power}V`:'—';
  const bat=latestAttrs.battery?`${latestAttrs.battery}V`:'—';
  const ignition=latestAttrs.ignition;
  const sat=latestAttrs.sat||0;
  const rssi=latestAttrs.rssi||0;
  const chargerConnected=latestAttrs.io116===1||latestAttrs['charger.connected'];
  const operator=latestAttrs.operator;

  // Mini SOC chart using SVG
  const chartH=80,chartW=400;
  const socPoints=socData.slice(-60);
  const maxSoc=100,minSoc=0;
  const svgPoints=socPoints.map((d,i)=>{
    const x=(i/(Math.max(socPoints.length-1,1)))*chartW;
    const y=chartH-((d.soc-minSoc)/(maxSoc-minSoc))*chartH;
    return`${x},${y}`;
  }).join(' ');

  return(<div style={{height:'100%',overflowY:'auto',padding:28}}>
    <div style={{marginBottom:24}}>
      <div style={{fontSize:11,color:'#8B5CF6',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:6}}>Intelligence</div>
      <h2 style={{fontSize:22,fontWeight:800}}>EV Monitoring</h2>
      <div style={{fontSize:13,color:'rgba(255,255,255,.4)',marginTop:4}}>{devices.length} EV asset{devices.length!==1?'s':''} · {history.length} data points (24h)</div>
    </div>

    {devices.length===0?(
      <div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.3)'}}>
        <div style={{fontSize:48,marginBottom:12}}>🔋</div>
        <div style={{fontSize:16,fontWeight:600}}>No EV assets detected</div>
        <div style={{fontSize:13,marginTop:8}}>Assign powertrain=ev in Fleet Registry to enable EV monitoring</div>
      </div>
    ):(
      <>
        {/* Live status card */}
        <div style={{background:'linear-gradient(135deg,rgba(139,92,246,.12),rgba(13,115,119,.08))',border:'1px solid rgba(139,92,246,.3)',borderRadius:16,padding:24,marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
            <div style={{fontSize:40}}>🔋</div>
            <div>
              <div style={{fontSize:18,fontWeight:800}}>{latest?.name}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:2}}>{latest?.uniqueid} · {latest?.terminal_model||'TFT100'}</div>
            </div>
            <div style={{flex:1}}/>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:42,fontWeight:900,color:'#8B5CF6',lineHeight:1}}>{soc}%</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:4}}>State of Charge</div>
            </div>
          </div>

          {/* SOC bar */}
          <div style={{marginBottom:20}}>
            <div style={{height:12,background:'rgba(255,255,255,.08)',borderRadius:6,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:6,width:`${soc}%`,background:+soc>50?'linear-gradient(90deg,#2ecc71,#0D7377)':+soc>20?'linear-gradient(90deg,#F59E0B,#E84545)':'#E84545',transition:'width 1s ease'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
              <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>0%</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>100%</span>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:12}}>
            {[
              {label:'Ignition',value:ignition?'ON':'OFF',color:ignition?'#2ecc71':'#E84545'},
              {label:'Charger',value:chargerConnected?'Connected':'Not connected',color:chargerConnected?'#2ecc71':'rgba(255,255,255,.4)'},
              {label:'External Power',value:power,color:'#A78BFA'},
              {label:'Internal Battery',value:bat,color:'#A78BFA'},
              {label:'GPS Satellites',value:`${sat} sats`,color:'#0D7377'},
              {label:'Signal (RSSI)',value:`${rssi} dBm`,color:'#0D7377'},
              {label:'Operator',value:operator||'—',color:'rgba(255,255,255,.7)'},
              {label:'Location',value:latest?.latitude?`${parseFloat(latest.latitude).toFixed(4)}, ${parseFloat(latest.longitude).toFixed(4)}`:'—',color:'rgba(255,255,255,.7)'},
            ].map(s=>(<div key={s.label} style={{background:'rgba(0,0,0,.2)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:13,fontWeight:700,color:s.color}}>{s.value}</div>
            </div>))}
          </div>
        </div>

        {/* SOC trend chart */}
        {socPoints.length>1&&(<div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:14,padding:20,marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>🔋 SOC Trend (last 24h · {socPoints.length} readings)</div>
          <div style={{overflowX:'auto'}}>
            <svg width="100%" viewBox={`0 0 ${chartW} ${chartH+20}`} preserveAspectRatio="none" style={{display:'block',height:100}}>
              <defs><linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity=".4"/><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0"/></linearGradient></defs>
              {/* Grid lines */}
              {[0,25,50,75,100].map(v=>{const y=chartH-v/100*chartH; return(<g key={v}><line x1="0" y1={y} x2={chartW} y2={y} stroke="rgba(255,255,255,.06)" strokeWidth="1"/><text x="4" y={y-2} fontSize="8" fill="rgba(255,255,255,.25)">{v}%</text></g>);})}
              {socPoints.length>1&&(<>
                <polygon points={`0,${chartH} ${svgPoints} ${chartW},${chartH}`} fill="url(#socGrad)"/>
                <polyline points={svgPoints} fill="none" stroke="#8B5CF6" strokeWidth="2"/>
                <circle cx={socPoints.length>0?(socPoints.length-1)/(Math.max(socPoints.length-1,1))*chartW:0} cy={chartH-((socPoints[socPoints.length-1]?.soc||0)/100)*chartH} r="4" fill="#8B5CF6" stroke="#fff" strokeWidth="1.5"/>
              </>)}
            </svg>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:10,color:'rgba(255,255,255,.25)'}}>
            <span>{socPoints[0]?new Date(socPoints[0].t).toLocaleTimeString():''}</span>
            <span>{socPoints[socPoints.length-1]?new Date(socPoints[socPoints.length-1].t).toLocaleTimeString():''}</span>
          </div>
        </div>)}

        {/* Data table */}
        <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:14,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>📊 Recent Readings</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr>{['Time','SOC%','Ext Power','Int Battery','Ignition'].map(h=>(<th key={h} style={{textAlign:'left',padding:'6px 12px',borderBottom:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.4)',fontWeight:600,fontSize:11,textTransform:'uppercase',letterSpacing:.5}}>{h}</th>))}</tr></thead>
              <tbody>{history.slice(0,20).map((m,i)=>{
                let a={};try{a=typeof m.attributes==='string'?JSON.parse(m.attributes):m.attributes||{};}catch{}
                return(<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                  <td style={{padding:'8px 12px',color:'rgba(255,255,255,.6)'}}>{new Date(m.fixtime).toLocaleTimeString()}</td>
                  <td style={{padding:'8px 12px',fontWeight:700,color:'#A78BFA'}}>{a.io113??'—'}%</td>
                  <td style={{padding:'8px 12px',color:'rgba(255,255,255,.6)'}}>{a.power?`${a.power}V`:'—'}</td>
                  <td style={{padding:'8px 12px',color:'rgba(255,255,255,.6)'}}>{a.battery?`${a.battery}V`:'—'}</td>
                  <td style={{padding:'8px 12px',color:a.ignition?'#2ecc71':'#E84545'}}>{a.ignition!==undefined?(a.ignition?'ON':'OFF'):'—'}</td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        </div>
      </>
    )}
  </div>);
}