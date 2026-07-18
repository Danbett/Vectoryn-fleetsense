import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

const AVL_NAMES = {
  priority:'Priority', sat:'Satellites', event:'Event ID', ignition:'Ignition',
  motion:'Motion', rssi:'GSM Signal (bars)', pdop:'PDOP', hdop:'HDOP',
  power:'External Voltage (V)', battery:'Internal Battery (V)',
  operator:'GSM Operator Code', distance:'Trip Distance (m)',
  totalDistance:'Total Odometer (m)', hours:'Engine Hours (ms)',
  io24:'Speed CAN (km/h)', io68:'Battery Current (A)',
  io69:'GNSS Status', io113:'EV Battery (%)', io116:'Charger Connected',
  io200:'Sleep Mode', io900:'Digital In 1', io901:'Digital In 2',
  io902:'Digital In 3', io903:'Digital In 4', io904:'Analog In 1',
  io905:'Analog In 2', io906:'Digital Out 1', io907:'Digital Out 2',
  io908:'Analog In 3', io909:'Analog In 4', io910:'Analog In 5',
  io80:'Data Mode', io81:'Vehicle Speed CAN', io83:'Fuel Consumed CAN (L)',
  io84:'Fuel Level CAN (L)', io85:'Engine RPM', io89:'Fuel Level CAN (%)',
  io102:'Engine Worktime (h)', io107:'Fuel Consumed Counted (L)',
  io110:'Fuel Rate (L/h)', io114:'Engine Load (%)', io115:'Coolant Temp (C)',
  io151:'EV Battery Temp (C)', io152:'EV Battery CAN (%)',
  io199:'Trip Odometer (m)', io201:'LLS Fuel Level 1 (mm)',
  io202:'LLS Fuel Level 2 (mm)', io239:'Ignition IO', io240:'Movement IO',
  io247:'Harsh Braking', io248:'Harsh Acceleration', io249:'Harsh Cornering',
  io253:'Overspeeding', io256:'VIN', io304:'EV Range on Battery (km)',
};

function parseA(raw){if(!raw)return{};if(typeof raw==="object")return raw;try{return JSON.parse(raw);}catch{return{};}}
function fmtTime(ts){if(!ts)return"—";return new Date(ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"});}
function timeAgo(ts){if(!ts)return"—";const m=Math.round((Date.now()-new Date(ts).getTime())/60000);if(m<1)return"just now";if(m<60)return m+"m ago";if(m<1440)return Math.floor(m/60)+"h ago";return Math.floor(m/1440)+"d ago";}

function SpeedGauge({value=0,max=160,label="km/h",color="#22C55E"}){
  const pct=Math.min(value/max,1);
  function polar(deg,r){const rad=(deg-90)*Math.PI/180;return{x:70+r*Math.cos(rad),y:70+r*Math.sin(rad)};}
  function arc(s,e,r){const sp=polar(s,r),ep=polar(e,r),lg=e-s>180?1:0;return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${lg} 1 ${ep.x} ${ep.y}`;}
  const angle=-135+pct*270,nd=polar(angle,46);
  return(<svg width={140} height={105} viewBox="0 0 140 105">
    <path d={arc(-135,135,54)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={10} strokeLinecap="round"/>
    {value>0&&<path d={arc(-135,-135+pct*270,54)} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" style={{transition:"all .5s"}}/>}
    {[0,.25,.5,.75,1].map(p=>{const a=-135+p*270,o=polar(a,61),i=polar(a,56);return<line key={p} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="rgba(255,255,255,.2)" strokeWidth={1.5}/>;} )}
    <line x1={70} y1={70} x2={nd.x} y2={nd.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" style={{transition:"all .5s"}}/>
    <circle cx={70} cy={70} r={5} fill={color}/>
    <text x={70} y={90} textAnchor="middle" fontSize={20} fontWeight={800} fill={color} style={{transition:"all .5s"}}>{Math.round(value)}</text>
    <text x={70} y={102} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,.35)">{label}</text>
    <text x={polar(-135,68).x} y={polar(-135,68).y+3} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,.2)">0</text>
    <text x={polar(135,68).x} y={polar(135,68).y+3} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,.2)">{max}</text>
  </svg>);
}

function Sparkline({data,color="#22C55E",width=300,height=90,label="",unit=""}){
  if(!data||data.length<2)return<div style={{width,height,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"rgba(255,255,255,.2)",fontSize:11}}>No data</span></div>;
  const max=Math.max(...data,1),range=max||1;
  const pts=data.map((v,i)=>((i/(data.length-1))*width)+","+(height-4-((v/range)*(height-8)))).join(" ");
  const id="g"+color.replace("#","")+(Math.random()*1e6|0);
  return(<div>
    <svg width={width} height={height} viewBox={"0 0 "+width+" "+height} style={{display:"block"}}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.3}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
      <polygon points={"0,"+height+" "+pts+" "+width+","+height} fill={"url(#"+id+")"}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}/>
      {(()=>{const l=pts.split(" ").pop().split(",");return<circle cx={+l[0]} cy={+l[1]} r={3} fill={color} stroke="#0D1B2A" strokeWidth={1.5}/>; })()}
    </svg>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
      <span style={{fontSize:9,color:"rgba(255,255,255,.2)"}}>24h ago</span>
      <span style={{fontSize:10,color,fontWeight:700}}>{label}: {typeof data[data.length-1]==="number"?data[data.length-1].toFixed(1):data[data.length-1]}{unit}</span>
      <span style={{fontSize:9,color:"rgba(255,255,255,.2)"}}>now</span>
    </div>
  </div>);
}

function StatCard({icon,label,value,color="#0D7377"}){
  return(<div style={{background:"rgba(255,255,255,.04)",border:"1px solid "+color+"30",borderRadius:8,padding:"8px 12px",minWidth:110,flexShrink:0}}>
    <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
    <div style={{fontSize:17,fontWeight:800,color,lineHeight:1}}>{value}</div>
    <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3,fontWeight:600}}>{label}</div>
  </div>);
}

export default function BottomPanel({dev,onClose,follow,onFollow}){
  const [tab,setTab]=useState("data");
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(false);

  const stColor=(()=>{
    const online=(dev.connectivity||"").trim()==="online",speed=parseFloat(dev.speed||0);
    const lastUp=dev.fixtime?new Date(dev.fixtime):null,mins=lastUp?(Date.now()-lastUp.getTime())/60000:9999;
    if(online&&speed>2)return{color:"#22C55E",label:"Moving"};
    if(online)return{color:"#EAB308",label:"Stopped"};
    if(mins<30)return{color:"#F97316",label:"No signal"};
    if(mins<60)return{color:"#EA580C",label:"No signal 30m+"};
    return{color:"#EF4444",label:"Offline"};
  })();

  const attrs=parseA(dev.attributes),isEV=dev.powertrain==="ev"||attrs.io113!==undefined;
  const speed=parseFloat(dev.speed||0),battery=attrs.io113??null;

  useEffect(()=>{setTab("data");setHistory([]);},[dev.id]);
  useEffect(()=>{
    if(tab!=="data"){
      setLoading(true);
      apiFetch("/telemetry/device/"+dev.id+"/history?hours=24").then(r=>{setHistory(r?.data||[]);setLoading(false);}).catch(()=>setLoading(false));
    }
  },[tab,dev.id]);

  const stats=(()=>{
    if(!history.length)return{maxSpd:0,distKm:0,engineH:0,stops:0,idleH:0};
    const maxSpd=Math.max(...history.map(p=>parseFloat(p.speed||0)),0);
    const last=parseA(history[history.length-1].attributes),first=parseA(history[0].attributes);
    const distKm=Math.max(0,((last.totalDistance||0)-(first.totalDistance||0))/1000);
    const engineH=Math.max(0,((last.hours||0)-(first.hours||0))/3600000);
    let stops=0,wasM=false;
    history.forEach(p=>{const s=parseFloat(p.speed||0);if(wasM&&s<2)stops++;wasM=s>2;});
    const idleH=history.filter(p=>{const a=parseA(p.attributes);return a.ignition&&parseFloat(p.speed||0)<2;}).length*30/3600;
    return{maxSpd,distKm,engineH,stops,idleH};
  })();

  const speedArr=history.map(p=>parseFloat(p.speed||0));
  const battArr=history.map(p=>+(parseA(p.attributes).io113??0));
  const pwrArr=history.map(p=>+(parseA(p.attributes).power||0));

  // Sort AVL: named first then io* by number
  const allAVL=Object.entries(attrs).sort(([a],[b])=>{
    const an=a.startsWith("io")?+a.slice(2):-1,bn=b.startsWith("io")?+b.slice(2):-1;
    if(an<0&&bn<0)return a.localeCompare(b);if(an<0)return -1;if(bn<0)return 1;return an-bn;
  });

  const dataFields=[
    {label:"Status",value:stColor.label,color:stColor.color},
    {label:"Speed",value:Math.round(speed)+" km/h",color:speed>0?"#22C55E":undefined},
    {label:"Course",value:(dev.course||0)+"°"},
    {label:"Altitude",value:dev.altitude?Math.round(+dev.altitude)+" m":"—"},
    {label:"Latitude",value:dev.latitude?(+dev.latitude).toFixed(6):"—"},
    {label:"Longitude",value:dev.longitude?(+dev.longitude).toFixed(6):"—"},
    {label:"Address",value:dev.address||"—"},
    {label:"Last Fix",value:fmtTime(dev.fixtime)},
    {label:"Last Seen",value:timeAgo(dev.fixtime)},
    {label:"Ignition",value:attrs.ignition?"ON":"OFF",color:attrs.ignition?"#22C55E":"#EF4444"},
    {label:"Motion",value:attrs.motion?"Yes":"No",color:attrs.motion?"#22C55E":"rgba(255,255,255,.4)"},
    {label:"Satellites",value:attrs.sat??"—"},
    {label:"PDOP / HDOP",value:(attrs.pdop??"—")+" / "+(attrs.hdop??"—")},
    {label:"GSM Signal",value:attrs.rssi!==undefined?attrs.rssi+" bars":"—"},
    {label:"GSM Operator",value:attrs.operator??"—"},
    {label:"Ext Voltage",value:attrs.power?attrs.power+" V":"—",color:"#A78BFA"},
    {label:"Int Battery",value:attrs.battery?attrs.battery+" V":"—"},
    {label:"Battery Current",value:attrs.io68!==undefined?attrs.io68+" A":"—"},
    {label:"Trip Distance",value:attrs.distance!==undefined?(+attrs.distance).toFixed(1)+" m":"—"},
    {label:"Total Odometer",value:attrs.totalDistance!==undefined?(+attrs.totalDistance/1000).toFixed(2)+" km":"—"},
    {label:"Engine Hours",value:attrs.hours!==undefined?(+attrs.hours/3600000).toFixed(2)+" h":"—"},
    {label:"Powertrain",value:(dev.powertrain||"ice").toUpperCase(),color:isEV?"#A78BFA":"#93C5FD"},
    {label:"Terminal",value:dev.terminal_model||"—"},
    {label:"IMEI",value:dev.uniqueid||"—"},
    {label:"Asset Code",value:dev.asset_code||"—"},
    {label:"Plate No.",value:dev.plate_no||"—"},
    {label:"Make/Model",value:[dev.make,dev.model,dev.year].filter(Boolean).join(" ")||"—"},
    ...(isEV?[
      {label:"EV Battery",value:battery!=null?battery+"%":"—",color:+battery>50?"#A78BFA":+battery>20?"#EAB308":"#EF4444"},
      {label:"Charger",value:attrs.io116===1?"Connected":"Not connected",color:attrs.io116===1?"#22C55E":"rgba(255,255,255,.4)"},
    ]:[]),
  ];

  const cols=Array.from({length:Math.ceil(dataFields.length/5)},(_,ci)=>dataFields.slice(ci*5,ci*5+5));

  return(<div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:1002,background:"rgba(8,15,25,.98)",backdropFilter:"blur(20px)",borderTop:"2px solid "+stColor.color+"55",height:290,display:"flex",flexDirection:"column",overflow:"hidden"}}>
    {/* Header */}
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0,background:"linear-gradient(90deg,"+stColor.color+"12,transparent 60%)"}}>
      <div style={{width:9,height:9,borderRadius:"50%",background:stColor.color,boxShadow:"0 0 8px "+stColor.color}}/>
      <span style={{fontSize:14,fontWeight:800}}>{dev.name}</span>
      <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:stColor.color+"22",color:stColor.color,fontWeight:700}}>{stColor.label}</span>
      {isEV&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"rgba(124,58,237,.2)",color:"#A78BFA",fontWeight:700}}>EV</span>}
      {battery!=null&&<span style={{fontSize:12,fontWeight:800,color:+battery>50?"#A78BFA":+battery>20?"#EAB308":"#EF4444"}}>🔋 {battery}%</span>}
      {speed>0&&<span style={{fontSize:12,fontWeight:800,color:"#22C55E"}}>⚡ {Math.round(speed)} km/h</span>}
      <div style={{flex:1}}/>
      <span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>{dev.uniqueid} · {timeAgo(dev.fixtime)}</span>
      <button onClick={onFollow} style={{padding:"4px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",background:follow?"rgba(13,115,119,.3)":"rgba(255,255,255,.06)",border:"1px solid "+(follow?"#0D7377":"rgba(255,255,255,.1)"),color:follow?"#0D7377":"rgba(255,255,255,.5)"}}>{follow?"📍 Following":"📍 Follow"}</button>
      <button onClick={onClose} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,color:"rgba(255,255,255,.5)",fontSize:16,width:26,height:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
    </div>
    {/* Tabs */}
    <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
      {["Data","Graph","Messages","AVL"].map(t=>(<button key={t} onClick={()=>setTab(t.toLowerCase())} style={{padding:"6px 18px",background:"transparent",borderBottom:tab===t.toLowerCase()?"2px solid #0D7377":"2px solid transparent",border:"none",color:tab===t.toLowerCase()?"#0D7377":"rgba(255,255,255,.4)",fontSize:12,fontWeight:tab===t.toLowerCase()?700:400,cursor:"pointer"}}>{t}</button>))}
      <div style={{flex:1}}/>
      <span style={{padding:"6px 14px",fontSize:10,color:"rgba(255,255,255,.2)",alignSelf:"center"}}>{fmtTime(dev.fixtime)}</span>
    </div>
    {/* Content */}
    <div style={{flex:1,overflow:"hidden"}}>

      {/* DATA */}
      {tab==="data"&&(
        <div style={{height:"100%",overflowX:"auto",overflowY:"hidden"}}>
          <div style={{display:"flex",height:"100%",alignItems:"stretch",minWidth:"max-content"}}>
            <div style={{padding:"8px 10px",borderRight:"1px solid rgba(255,255,255,.06)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <SpeedGauge value={speed} max={160} color={speed>2?"#22C55E":"#EAB308"}/>
            </div>
            {isEV&&battery!=null&&(
              <div style={{padding:"8px 10px",borderRight:"1px solid rgba(255,255,255,.06)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <SpeedGauge value={+battery} max={100} label="%" color={+battery>50?"#A78BFA":+battery>20?"#EAB308":"#EF4444"}/>
                <div style={{fontSize:9,color:"rgba(255,255,255,.3)",marginTop:-10}}>Battery</div>
              </div>
            )}
            <div style={{display:"flex",overflowX:"auto",padding:"8px 12px",gap:4,alignItems:"flex-start",flex:1}}>
              {cols.map((chunk,ci)=>(
                <div key={ci} style={{minWidth:195,borderRight:"1px solid rgba(255,255,255,.04)",paddingRight:4,flexShrink:0}}>
                  {chunk.map((f,i)=>(
                    <div key={f.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 6px",background:i%2?"rgba(255,255,255,.02)":"transparent",borderRadius:3,marginBottom:1}}>
                      <span style={{fontSize:10,color:"rgba(255,255,255,.35)",whiteSpace:"nowrap",marginRight:8}}>{f.label}</span>
                      <span style={{fontSize:11,fontWeight:600,color:f.color||"rgba(255,255,255,.8)",whiteSpace:"nowrap",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis"}}>{f.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GRAPH */}
      {tab==="graph"&&(
        <div style={{height:"100%",overflowX:"auto",overflowY:"hidden"}}>
          {loading?<div style={{padding:20,color:"rgba(255,255,255,.3)",fontSize:12}}>Loading 24h data...</div>:(
            <div style={{display:"flex",gap:0,height:"100%",alignItems:"flex-start",minWidth:"max-content"}}>
              <div style={{padding:"12px 16px",borderRight:"1px solid rgba(255,255,255,.06)",flexShrink:0}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Daily Stats (24h)</div>
                <div style={{display:"flex",gap:8}}>
                  <StatCard icon="📏" label="Distance" value={stats.distKm.toFixed(1)+" km"} color="#0D7377"/>
                  <StatCard icon="⚡" label="Top Speed" value={Math.round(stats.maxSpd)+" km/h"} color="#22C55E"/>
                  <StatCard icon="⏱" label="Engine Time" value={stats.engineH.toFixed(1)+"h"} color="#A78BFA"/>
                  <StatCard icon="🛑" label="Stops" value={stats.stops} color="#F97316"/>
                  <StatCard icon="💤" label="Idle Time" value={stats.idleH.toFixed(1)+"h"} color="#EAB308"/>
                  {isEV&&<StatCard icon="🔋" label="Battery" value={battery!=null?battery+"%":"—"} color={+battery>50?"#A78BFA":"#EF4444"}/>}
                </div>
              </div>
              <div style={{padding:"12px 20px",display:"flex",gap:28,alignItems:"flex-start",flexShrink:0}}>
                {speedArr.length>1&&<div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Speed (km/h) · {speedArr.length} pts</div><Sparkline data={speedArr} color="#22C55E" label="Now" unit=" km/h"/></div>}
                {isEV&&battArr.some(v=>v>0)&&<div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Battery (%)</div><Sparkline data={battArr} color="#A78BFA" label="Now" unit="%"/></div>}
                {pwrArr.some(v=>v>0)&&<div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Ext Voltage (V)</div><Sparkline data={pwrArr} color="#60A5FA" label="Now" unit="V"/></div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MESSAGES */}
      {tab==="messages"&&(
        <div style={{height:"100%",overflow:"auto"}}>
          {loading?<div style={{padding:20,color:"rgba(255,255,255,.3)",fontSize:12}}>Loading...</div>:(
            <table style={{borderCollapse:"collapse",fontSize:10,minWidth:"100%"}}>
              <thead style={{position:"sticky",top:0,background:"#0A0F19",zIndex:10}}>
                <tr>{["#","Time","Lat","Lon","Spd","Crs","Alt","Ign","Mot","Sat","RSSI","Power","Batt","io113","io69","io24","io200","Dist","TotalKm","EngH","io900-910","Other"].map(h=>(
                  <th key={h} style={{padding:"5px 8px",textAlign:"left",whiteSpace:"nowrap",borderBottom:"1px solid rgba(255,255,255,.08)",borderRight:"1px solid rgba(255,255,255,.04)",color:"rgba(255,255,255,.4)",fontWeight:700,fontSize:9,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {history.length===0?<tr><td colSpan={22} style={{padding:20,textAlign:"center",color:"rgba(255,255,255,.25)"}}>No messages</td></tr>:
                [...history].reverse().map((m,i)=>{
                  const a=parseA(m.attributes);
                  const shown=new Set(["priority","sat","event","ignition","motion","rssi","pdop","hdop","power","battery","operator","distance","totalDistance","hours","io24","io68","io69","io113","io116","io200","io900","io901","io902","io903","io904","io905","io906","io907","io908","io909","io910"]);
                  const ios=[900,901,902,903,904,905,906,907,908,909,910].map(n=>"io"+n+":"+(a["io"+n]??"-")).join(" ");
                  const other=Object.entries(a).filter(([k])=>!shown.has(k)).map(([k,v])=>k+"="+(typeof v==="boolean"?v?"T":"F":String(v))).join("  ");
                  return(<tr key={i} style={{background:i%2?"rgba(255,255,255,.025)":"transparent",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.25)",fontFamily:"monospace"}}>{history.length-i}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.6)",whiteSpace:"nowrap",fontFamily:"monospace"}}>{new Date(m.fixtime).toLocaleTimeString()}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.5)",fontFamily:"monospace"}}>{m.latitude?(+m.latitude).toFixed(5):"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.5)",fontFamily:"monospace"}}>{m.longitude?(+m.longitude).toFixed(5):"—"}</td>
                    <td style={{padding:"3px 8px",color:+m.speed>2?"#22C55E":"rgba(255,255,255,.4)",fontWeight:600}}>{Math.round(+m.speed||0)}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{m.course||0}°</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{m.altitude?Math.round(+m.altitude)+"m":"—"}</td>
                    <td style={{padding:"3px 8px",color:a.ignition?"#22C55E":"#EF4444",fontWeight:700}}>{a.ignition?"ON":"OFF"}</td>
                    <td style={{padding:"3px 8px",color:a.motion?"#22C55E":"rgba(255,255,255,.3)"}}>{a.motion?"Y":"N"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.5)"}}>{a.sat??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{a.rssi??"—"}</td>
                    <td style={{padding:"3px 8px",color:"#A78BFA"}}>{a.power??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{a.battery??"—"}</td>
                    <td style={{padding:"3px 8px",color:a.io113!=null?"#A78BFA":"rgba(255,255,255,.3)",fontWeight:700}}>{a.io113??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{a.io69??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{a.io24??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)"}}>{a.io200??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)",fontFamily:"monospace"}}>{a.distance??"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)",fontFamily:"monospace"}}>{a.totalDistance?(+a.totalDistance/1000).toFixed(1)+"km":"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.4)",fontFamily:"monospace"}}>{a.hours?(+a.hours/3600000).toFixed(2)+"h":"—"}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.3)",fontFamily:"monospace",fontSize:9,whiteSpace:"nowrap"}}>{ios}</td>
                    <td style={{padding:"3px 8px",color:"rgba(255,255,255,.25)",fontFamily:"monospace",fontSize:9,whiteSpace:"nowrap"}}>{other||"—"}</td>
                  </tr>);
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* AVL - all current params decoded */}
      {tab==="avl"&&(
        <div style={{height:"100%",overflowX:"auto",overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",padding:"8px 12px",gap:0}}>
            {allAVL.map(([key,val],i)=>{
              const name=AVL_NAMES[key];
              const isEVP=["io113","io116","io151","io152","io304"].includes(key);
              const isBool=typeof val==="boolean";
              const displayVal=isBool?(val?"TRUE":"FALSE"):
                key==="totalDistance"?(+val/1000).toFixed(2)+" km":
                key==="hours"?(+val/3600000).toFixed(3)+" h":
                key==="distance"?(+val).toFixed(1)+" m":
                String(val);
              const color=isEVP?"#A78BFA":isBool&&val?"#22C55E":isBool&&!val?"#EF4444":"rgba(255,255,255,.85)";
              return(<div key={key} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 10px",background:i%2?"rgba(255,255,255,.02)":"transparent",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                <div style={{width:8,height:8,borderRadius:2,flexShrink:0,background:isEVP?"#7C3AED":isBool?"#0D7377":"rgba(255,255,255,.15)"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.7)",fontFamily:"monospace"}}>{key}</div>
                  {name&&<div style={{fontSize:9,color:"rgba(255,255,255,.3)",marginTop:1}}>{name}</div>}
                </div>
                <span style={{fontSize:12,fontWeight:700,color,flexShrink:0}}>{displayVal}</span>
              </div>);
            })}
          </div>
        </div>
      )}

    </div>
  </div>);
}