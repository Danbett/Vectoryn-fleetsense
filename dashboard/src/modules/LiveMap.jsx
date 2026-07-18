import BottomPanel from './BottomPanel.jsx';
import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

const TILES = {
  street:    { label:'Street',    url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr:'© OpenStreetMap' },
  satellite: { label:'Satellite', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'© Esri' },
  hybrid:    { label:'Hybrid',    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'© Esri', overlay:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' }
};

function getStatus(dev) {
  const lastUp = dev.fixtime ? new Date(dev.fixtime) : null;
  const minsAgo = lastUp ? (Date.now() - lastUp.getTime()) / 60000 : 9999;
  const speed = parseFloat(dev.speed || 0);
  const online = (dev.connectivity || '').trim() === 'online';
  if (online && speed > 2)  return { key:'moving',  color:'#22C55E', label:'Moving' };
  if (online && speed <= 2) return { key:'stopped', color:'#EAB308', label:'Stopped' };
  if (minsAgo < 30)         return { key:'warn30',  color:'#F97316', label:'No signal' };
  if (minsAgo < 60)         return { key:'warn60',  color:'#EA580C', label:'No signal 30m+' };
  return                           { key:'offline', color:'#EF4444', label:'Offline' };
}

function makeArrow(color, course, isEV) {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"36\" height=\"36\" viewBox=\"0 0 36 36\"><filter id=\"sh\"><feDropShadow dx=\"0\" dy=\"1\" stdDeviation=\"1.5\" flood-opacity=\"0.4\"/></filter><g transform=\"rotate("+(course||0)+",18,18)\" filter=\"url(#sh)\"><polygon points=\"18,3 26,30 18,24 10,30\" fill=\""+color+"\" stroke=\"rgba(255,255,255,0.9)\" stroke-width=\"2\"/></g>"+(isEV?"<circle cx=\"29\" cy=\"7\" r=\"7\" fill=\"#7C3AED\" stroke=\"#fff\" stroke-width=\"1.5\"/><text x=\"29\" y=\"11\" text-anchor=\"middle\" font-size=\"7\" font-weight=\"bold\" fill=\"#fff\">EV</text>":"")+"</svg>";
  return window.L.divIcon({ html:svg, className:'', iconSize:[36,36], iconAnchor:[18,18] });
}
function makeOfflineIcon(color) {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" fill=\""+color+"\" stroke=\"rgba(255,255,255,0.8)\" stroke-width=\"1.5\" opacity=\"0.85\"/><line x1=\"8\" y1=\"8\" x2=\"16\" y2=\"16\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/><line x1=\"16\" y1=\"8\" x2=\"8\" y2=\"16\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
  return window.L.divIcon({ html:svg, className:'', iconSize:[24,24], iconAnchor:[12,12] });
}
function timeAgo(ts) {
  if (!ts) return "—";
  const m = Math.round((Date.now()-new Date(ts).getTime())/60000);
  if (m<1) return "just now"; if (m<60) return m+"m ago";
  if (m<1440) return Math.floor(m/60)+"h ago"; return Math.floor(m/1440)+"d ago";
}
function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function parseA(raw){if(!raw)return{};if(typeof raw==="object")return raw;try{return JSON.parse(raw);}catch{return{};}}

function DeviceRow({ dev, isSelected, onClick, isFollowing }) {
  const st=getStatus(dev),attrs=dev.attributes||{};
  const isEV=dev.powertrain==="ev"||attrs.io113!==undefined;
  const speed=parseFloat(dev.speed||0),ignition=attrs.ignition===true||attrs.ignition==="true";
  const battery=attrs.io113??null,fuel=attrs.io48??attrs["fuel.level"]??null;
  return (
    <div onClick={onClick}
      style={{padding:"7px 10px",background:isSelected?"rgba(13,115,119,.2)":"transparent",borderLeft:"3px solid "+(isSelected?"#0D7377":"transparent"),borderBottom:"1px solid rgba(255,255,255,.05)",cursor:"pointer"}}
      onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="rgba(255,255,255,.04)";}}
      onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="transparent";}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:st.color,flexShrink:0,boxShadow:st.key==="moving"?"0 0 6px "+st.color:"none"}}/>
        <span style={{fontSize:12,fontWeight:600,color:isSelected?"#fff":"rgba(255,255,255,.85)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dev.name}</span>
        <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:isEV?"rgba(124,58,237,.3)":"rgba(46,95,163,.3)",color:isEV?"#A78BFA":"#93C5FD",fontWeight:700,flexShrink:0}}>{isEV?"EV":"ICE"}</span>
        {isFollowing&&<span style={{fontSize:9,color:"#0D7377"}}>📍</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:10,color:"rgba(255,255,255,.45)"}}>
        <span style={{color:speed>0?"#22C55E":"rgba(255,255,255,.3)",fontWeight:600,minWidth:44}}>{Math.round(speed)} km/h</span>
        <span style={{color:ignition?"#22C55E":"rgba(255,255,255,.25)"}}>{ignition?"🔑":"⭕"}</span>
        {isEV&&battery!==null&&<span style={{color:+battery>50?"#A78BFA":+battery>20?"#EAB308":"#EF4444",fontWeight:700}}>🔋{battery}%</span>}
        {!isEV&&fuel!==null&&<span style={{color:+fuel>25?"#60A5FA":"#EF4444",fontWeight:700}}>⛽{Math.round(+fuel)}%</span>}
        <span style={{marginLeft:"auto",color:"rgba(255,255,255,.3)",fontSize:9}}>{timeAgo(dev.fixtime)}</span>
      </div>
      {dev.address&&<div style={{fontSize:9,color:"rgba(255,255,255,.22)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {dev.address}</div>}
    </div>
  );
}

) {
  const [tab,setTab]=useState("data");
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(false);
  const st=getStatus(dev),attrs=dev.attributes||{};
  const isEV=dev.powertrain==="ev"||attrs.io113!==undefined;

  useEffect(()=>{setTab("data");setHistory([]);},[dev.id]);
  useEffect(()=>{
    if(tab==="graph"||tab==="messages"){
      setLoading(true);
      apiFetch("/telemetry/device/"+dev.id+"/history?hours=1").then(r=>{setHistory(r?.data||[]);setLoading(false);}).catch(()=>setLoading(false));
    }
  },[tab,dev.id]);

  const speedData=history.map(p=>parseFloat(p.speed||0)).reverse();
  const battData=history.map(p=>{const a=parseA(p.attributes);return+(a.io113??0);}).reverse();

  const dataFields=[
    {label:"Status",value:st.label,color:st.color},
    {label:"Speed",value:Math.round(+dev.speed||0)+" km/h",color:+dev.speed>0?"#22C55E":undefined},
    {label:"Course",value:(dev.course||0)+"°"},
    {label:"Altitude",value:dev.altitude?Math.round(+dev.altitude)+" m":"—"},
    {label:"Latitude",value:dev.latitude?(+dev.latitude).toFixed(6):"—"},
    {label:"Longitude",value:dev.longitude?(+dev.longitude).toFixed(6):"—"},
    {label:"Ignition",value:attrs.ignition?"ON":"OFF",color:attrs.ignition?"#22C55E":"#EF4444"},
    {label:"Satellites",value:attrs.sat??"—"},
    {label:"GSM Signal",value:attrs.rssi!==undefined?attrs.rssi+" dBm":"—"},
    {label:"Ext Voltage",value:attrs.power?attrs.power+" V":"—",color:"#A78BFA"},
    {label:"Int Battery",value:attrs.battery?attrs.battery+" V":"—"},
    {label:"Powertrain",value:(dev.powertrain||"ice").toUpperCase(),color:isEV?"#A78BFA":"#93C5FD"},
    {label:"Terminal",value:dev.terminal_model||"—"},
    {label:"Asset Code",value:dev.asset_code||"—"},
    {label:"Plate No.",value:dev.plate_no||"—"},
    {label:"Make/Model",value:[dev.make,dev.model,dev.year].filter(Boolean).join(" ")||"—"},
    ...(isEV?[
      {label:"EV Battery",value:attrs.io113!=null?attrs.io113+"%":"—",color:+attrs.io113>50?"#A78BFA":+attrs.io113>20?"#EAB308":"#EF4444"},
      {label:"Charger",value:attrs.io116===1?"Connected":"Not connected",color:attrs.io116===1?"#22C55E":"rgba(255,255,255,.4)"},
    ]:[]),
    {label:"Time (fix)",value:fmtTime(dev.fixtime)},
    {label:"Address",value:dev.address||"—"},
    {label:"IMEI",value:dev.uniqueid||"—"},
  ];

  return (
    <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:1002,background:"rgba(10,18,30,.97)",backdropFilter:"blur(16px)",borderTop:"1px solid rgba(255,255,255,.1)",height:240,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0,background:"linear-gradient(90deg,"+st.color+"14,transparent)"}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:st.color,boxShadow:st.key==="moving"?"0 0 8px "+st.color:"none"}}/>
        <span style={{fontSize:14,fontWeight:800}}>{dev.name}</span>
        <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:st.color+"22",color:st.color,fontWeight:700}}>{st.label}</span>
        {isEV&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"rgba(124,58,237,.2)",color:"#A78BFA",fontWeight:700}}>EV</span>}
        {attrs.io113!=null&&<span style={{fontSize:12,fontWeight:800,color:+attrs.io113>50?"#A78BFA":+attrs.io113>20?"#EAB308":"#EF4444"}}>🔋 {attrs.io113}%</span>}
        <div style={{flex:1}}/>
        <button onClick={onFollow} style={{padding:"4px 12px",background:follow?"rgba(13,115,119,.3)":"rgba(255,255,255,.06)",border:"1px solid "+(follow?"#0D7377":"rgba(255,255,255,.1)"),borderRadius:6,color:follow?"#0D7377":"rgba(255,255,255,.5)",fontSize:11,fontWeight:600,cursor:"pointer"}}>{follow?"📍 Following":"📍 Follow"}</button>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,color:"rgba(255,255,255,.5)",fontSize:16,width:26,height:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
        {["Data","Graph","Messages"].map(t=>(
          <button key={t} onClick={()=>setTab(t.toLowerCase())} style={{padding:"6px 20px",background:"transparent",borderBottom:tab===t.toLowerCase()?"2px solid #0D7377":"2px solid transparent",border:"none",color:tab===t.toLowerCase()?"#0D7377":"rgba(255,255,255,.4)",fontSize:12,fontWeight:tab===t.toLowerCase()?700:400,cursor:"pointer"}}>{t}</button>
        ))}
        <div style={{flex:1}}/>
        <span style={{padding:"6px 14px",fontSize:10,color:"rgba(255,255,255,.2)",alignSelf:"center"}}>{fmtTime(dev.fixtime)}</span>
      </div>
      <div style={{flex:1,overflow:"auto"}}>
        {tab==="data"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
            {dataFields.map((f,i)=>(
              <div key={f.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 14px",background:i%2===0?"rgba(255,255,255,.02)":"transparent",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,.35)",whiteSpace:"nowrap"}}>{f.label}</span>
                <span style={{fontSize:11,fontWeight:600,color:f.color||"rgba(255,255,255,.8)",textAlign:"right",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginLeft:8}}>{f.value}</span>
              </div>
            ))}
          </div>
        )}
        {tab==="graph"&&(
          <div style={{padding:"12px 20px",display:"flex",gap:32,flexWrap:"wrap",alignItems:"flex-start"}}>
            {loading?<div style={{color:"rgba(255,255,255,.3)",fontSize:12}}>Loading...</div>:(
              speedData.length===0?<div style={{color:"rgba(255,255,255,.3)",fontSize:12}}>No data for last hour</div>:
              <>
                <div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Speed km/h — last hour · {speedData.length} pts</div>
                  <Sparkline data={speedData} color="#22C55E"/>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(255,255,255,.25)",marginTop:2}}><span>60m ago</span><span style={{color:"#22C55E",fontWeight:700}}>max {Math.max(...speedData,0)} km/h</span><span>now</span></div>
                </div>
                {isEV&&battData.some(v=>v>0)&&(
                  <div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Battery % — last hour</div>
                    <Sparkline data={battData} color="#A78BFA"/>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(255,255,255,.25)",marginTop:2}}><span>60m ago</span><span style={{color:"#A78BFA",fontWeight:700}}>now {battData[battData.length-1]||0}%</span><span>now</span></div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab==="messages"&&(
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
            <thead style={{position:"sticky",top:0,background:"#0D1B2A",zIndex:1}}>
              <tr>{["Time (fix)","Lat","Lon","Speed","Course","Alt","Parameters"].map(h=>(
                <th key={h} style={{padding:"5px 10px",textAlign:"left",borderBottom:"1px solid rgba(255,255,255,.08)",color:"rgba(255,255,255,.35)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {loading?<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"rgba(255,255,255,.3)"}}>Loading...</td></tr>:
              history.length===0?<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"rgba(255,255,255,.25)"}}>No messages in last hour</td></tr>:
              history.slice().reverse().map((m,i)=>{
                const a=parseA(m.attributes);
                const ps=Object.entries(a).slice(0,8).map(([k,v])=>k+":"+(typeof v==="boolean"?v?"T":"F":String(v).substring(0,8))).join("  ");
                return(<tr key={i} style={{background:i%2?"rgba(255,255,255,.02)":"transparent",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                  <td style={{padding:"4px 10px",color:"rgba(255,255,255,.6)",whiteSpace:"nowrap"}}>{new Date(m.fixtime).toLocaleTimeString()}</td>
                  <td style={{padding:"4px 10px",color:"rgba(255,255,255,.5)"}}>{m.latitude?(+m.latitude).toFixed(5):"—"}</td>
                  <td style={{padding:"4px 10px",color:"rgba(255,255,255,.5)"}}>{m.longitude?(+m.longitude).toFixed(5):"—"}</td>
                  <td style={{padding:"4px 10px",color:+m.speed>0?"#22C55E":"rgba(255,255,255,.4)",fontWeight:600}}>{Math.round(+m.speed||0)}</td>
                  <td style={{padding:"4px 10px",color:"rgba(255,255,255,.4)"}}>{m.course||0}°</td>
                  <td style={{padding:"4px 10px",color:"rgba(255,255,255,.4)"}}>{m.altitude?Math.round(+m.altitude)+"m":"—"}</td>
                  <td style={{padding:"4px 10px",color:"rgba(255,255,255,.3)",fontFamily:"monospace",fontSize:9,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ps||"—"}</td>
                </tr>);
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function LiveMap() {
  const mapRef=useRef(null),mapInst=useRef(null),markersRef=useRef({}),trailsRef=useRef({}),posHistRef=useRef({});
  const tileLayerRef=useRef(null),overlayRef=useRef(null);
  const [devices,setDevices]=useState([]);
  const [selected,setSelected]=useState(null);
  const [tileMode,setTileMode]=useState("street");
  const [lastUpdate,setLastUpdate]=useState(null);
  const [follow,setFollow]=useState(null);
  const [search,setSearch]=useState("");
  const [panelW,setPanelW]=useState(280);
  const [collapsed,setCollapsed]=useState(false);
  const [statusFilter,setStatusFilter]=useState("all");

  useEffect(()=>{
    if(!window.L||mapInst.current)return;
    const map=window.L.map(mapRef.current,{center:[0.3618,32.6018],zoom:14,zoomControl:false});
    window.L.control.zoom({position:"bottomright"}).addTo(map);
    tileLayerRef.current=window.L.tileLayer(TILES.street.url,{attribution:TILES.street.attr}).addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;};
  },[]);

  useEffect(()=>{
    if(!mapInst.current||!tileLayerRef.current)return;
    const t=TILES[tileMode];tileLayerRef.current.setUrl(t.url);
    if(overlayRef.current){mapInst.current.removeLayer(overlayRef.current);overlayRef.current=null;}
    if(tileMode==="hybrid"&&t.overlay)overlayRef.current=window.L.tileLayer(t.overlay,{opacity:.35}).addTo(mapInst.current);
  },[tileMode]);

  const fetchLive=useCallback(async()=>{
    try{
      const res=await apiFetch("/telemetry/live");if(!res?.data)return;
      setDevices(res.data);setLastUpdate(new Date());
      const map=mapInst.current;if(!map)return;
      res.data.forEach(dev=>{
        if(!dev.latitude||!dev.longitude)return;
        const lat=+dev.latitude,lon=+dev.longitude,course=+dev.course||0;
        const st=getStatus(dev),attrs=dev.attributes||{};
        const isEV=dev.powertrain==="ev"||attrs.io113!==undefined;
        const isOnline=(dev.connectivity||"").trim()==="online";
        if(!posHistRef.current[dev.id])posHistRef.current[dev.id]=[];
        const hist=posHistRef.current[dev.id],last=hist[hist.length-1];
        if(!last||last[0]!==lat||last[1]!==lon){hist.push([lat,lon]);if(hist.length>12)hist.shift();}
        if(trailsRef.current[dev.id])map.removeLayer(trailsRef.current[dev.id]);
        if(hist.length>1&&isOnline)trailsRef.current[dev.id]=window.L.polyline(hist,{color:st.color,weight:2,opacity:.5,dashArray:"5,4"}).addTo(map);
        const icon=isOnline?makeArrow(st.color,course,isEV):makeOfflineIcon(st.color);
        if(markersRef.current[dev.id]){markersRef.current[dev.id].setLatLng([lat,lon]).setIcon(icon);}
        else{markersRef.current[dev.id]=window.L.marker([lat,lon],{icon}).addTo(map).on("click",()=>{setSelected(dev);if(map)map.panTo([lat,lon],{animate:true,duration:.5});});}
        if(follow===dev.id)map.panTo([lat,lon],{animate:true,duration:.5});
      });
      setSelected(sel=>sel?(res.data.find(d=>d.id===sel.id)||sel):null);
    }catch{}
  },[follow]);

  useEffect(()=>{fetchLive();const iv=setInterval(fetchLive,5000);return()=>clearInterval(iv);},[fetchLive]);

  const counts={
    all:devices.length,
    moving:devices.filter(d=>getStatus(d).key==="moving").length,
    stopped:devices.filter(d=>getStatus(d).key==="stopped").length,
    offline:devices.filter(d=>["warn30","warn60","offline"].includes(getStatus(d).key)).length,
  };
  const filtered=devices.filter(d=>{
    const st=getStatus(d);
    const ms=statusFilter==="all"?true:statusFilter==="moving"?st.key==="moving":statusFilter==="stopped"?st.key==="stopped":["warn30","warn60","offline"].includes(st.key);
    return ms&&(!search||(d.name||"").toLowerCase().includes(search.toLowerCase())||(d.plate_no||"").toLowerCase().includes(search.toLowerCase()));
  });
  const pw=collapsed?32:panelW;

  return(
    <div style={{display:"flex",width:"100%",height:"100%",overflow:"hidden"}}>
      <div style={{width:pw,minWidth:pw,maxWidth:pw,background:"#0D1B2A",borderRight:"1px solid rgba(255,255,255,.07)",display:"flex",flexDirection:"column",overflow:"hidden",transition:"width .2s,min-width .2s,max-width .2s",flexShrink:0}}>
        {collapsed?(
          <button onClick={()=>setCollapsed(false)} style={{margin:"8px auto",width:24,height:24,background:"rgba(13,115,119,.2)",border:"1px solid rgba(13,115,119,.4)",borderRadius:4,color:"#0D7377",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        ):(<>
          <div style={{padding:"10px 10px 6px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
              <div style={{flex:1,fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1}}>Objects ({devices.length})</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:"#22C55E"}}/><span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>{lastUpdate?lastUpdate.toLocaleTimeString():"—"}</span></div>
              <button onClick={()=>setCollapsed(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:14,padding:"0 2px"}}>‹</button>
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search objects..." style={{width:"100%",padding:"5px 8px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:5,color:"#fff",fontSize:11,outline:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:3,marginTop:6}}>
              {[{key:"all",label:"All "+counts.all},{key:"moving",label:"▶ "+counts.moving},{key:"stopped",label:"■ "+counts.stopped},{key:"offline",label:"✕ "+counts.offline}].map(f=>(
                <button key={f.key} onClick={()=>setStatusFilter(f.key)} style={{flex:1,padding:"3px 0",fontSize:9,fontWeight:600,background:statusFilter===f.key?"rgba(13,115,119,.3)":"rgba(255,255,255,.04)",border:"1px solid "+(statusFilter===f.key?"#0D7377":"rgba(255,255,255,.08)"),borderRadius:4,color:statusFilter===f.key?"#0D7377":"rgba(255,255,255,.4)",cursor:"pointer"}}>{f.label}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
            {filtered.length===0?<div style={{padding:"20px 10px",textAlign:"center",color:"rgba(255,255,255,.25)",fontSize:12}}>No objects</div>:
            filtered.map(dev=>(<DeviceRow key={dev.id} dev={dev} isSelected={selected?.id===dev.id} isFollowing={follow===dev.id} onClick={()=>{setSelected(dev);if(dev.latitude&&mapInst.current)mapInst.current.panTo([+dev.latitude,+dev.longitude],{animate:true,duration:.5});}}/>))}
          </div>
          <div onMouseDown={e=>{e.preventDefault();const sx=e.clientX,sw=panelW;const mv=ev=>setPanelW(Math.max(220,Math.min(420,sw+ev.clientX-sx)));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{height:4,background:"rgba(13,115,119,.2)",cursor:"col-resize",borderTop:"1px solid rgba(13,115,119,.2)"}}/>
        </>)}
      </div>
      <div style={{flex:1,position:"relative",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div ref={mapRef} style={{flex:1,width:"100%"}}/>
        <div style={{position:"absolute",top:10,right:10,zIndex:1000,background:"rgba(13,27,42,.92)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,display:"flex",overflow:"hidden"}}>
          {Object.entries(TILES).map(([k,t])=>(<button key={k} onClick={()=>setTileMode(k)} style={{padding:"6px 12px",border:"none",cursor:"pointer",background:tileMode===k?"#0D7377":"transparent",color:tileMode===k?"#fff":"rgba(255,255,255,.45)",fontSize:11,fontWeight:tileMode===k?700:400}}>{t.label}</button>))}
        </div>
        <div style={{position:"absolute",bottom:selected?250:20,left:10,zIndex:1000,background:"rgba(13,27,42,.9)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,padding:"8px 12px",transition:"bottom .3s"}}>
          {[{color:"#22C55E",label:"Moving"},{color:"#EAB308",label:"Stopped"},{color:"#F97316",label:"<30m offline"},{color:"#EA580C",label:"30-60m offline"},{color:"#EF4444",label:">60m offline"},{color:"#7C3AED",label:"EV"}].map(l=>(
            <div key={l.label} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:l.color,flexShrink:0}}/><span style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>{l.label}</span>
            </div>
          ))}
        </div>
        {selected&&<BottomPanel dev={selected} onClose={()=>{setSelected(null);setFollow(null);}} follow={follow===selected.id} onFollow={()=>setFollow(f=>f===selected.id?null:selected.id)}/>}
      </div>
      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}.leaflet-container{background:#0D1B2A}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px}"}</style>
    </div>
  );
}