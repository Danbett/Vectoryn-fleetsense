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
  const evBadge = isEV ? '<circle cx="29" cy="7" r="7" fill="#7C3AED" stroke="#fff" stroke-width="1.5"/><text x="29" y="11" text-anchor="middle" font-size="7" font-weight="bold" fill="#fff">EV</text>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><filter id="sh"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.4"/></filter><g transform="rotate(${course||0},18,18)" filter="url(#sh)"><polygon points="18,3 26,30 18,24 10,30" fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="2"/></g>${evBadge}</svg>`;
  return window.L.divIcon({ html:svg, className:'', iconSize:[36,36], iconAnchor:[18,18] });
}

function makeOfflineIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" opacity="0.85"/><line x1="8" y1="8" x2="16" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
  return window.L.divIcon({ html:svg, className:'', iconSize:[24,24], iconAnchor:[12,12] });
}

function timeAgo(ts) {
  if (!ts) return '—';
  const m = Math.round((Date.now()-new Date(ts).getTime())/60000);
  if (m<1) return 'just now'; if (m<60) return m+'m ago';
  if (m<1440) return Math.floor(m/60)+'h ago'; return Math.floor(m/1440)+'d ago';
}

function parseA(raw){if(!raw)return{};if(typeof raw==='object')return raw;try{return JSON.parse(raw);}catch{return{};}}

function DeviceRow({ dev, isSelected, onClick, isFollowing }) {
  const st=getStatus(dev), attrs=dev.attributes||{};
  const isEV=dev.powertrain==='ev'||attrs.io113!==undefined;
  const speed=parseFloat(dev.speed||0), ignition=attrs.ignition===true||attrs.ignition==='true';
  const battery=attrs.io113??null, fuel=attrs.io48??null;
  return (
    <div onClick={onClick}
      style={{padding:'7px 10px',background:isSelected?'rgba(13,115,119,.2)':'transparent',
        borderLeft:'3px solid '+(isSelected?'#0D7377':'transparent'),
        borderBottom:'1px solid rgba(255,255,255,.05)',cursor:'pointer'}}
      onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background='rgba(255,255,255,.04)';}}
      onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background='transparent';}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:st.color,flexShrink:0,
          boxShadow:st.key==='moving'?'0 0 6px '+st.color:'none'}}/>
        <span style={{fontSize:12,fontWeight:600,color:isSelected?'#fff':'rgba(255,255,255,.85)',
          flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dev.name}</span>
        <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,
          background:isEV?'rgba(124,58,237,.3)':'rgba(46,95,163,.3)',
          color:isEV?'#A78BFA':'#93C5FD',fontWeight:700,flexShrink:0}}>{isEV?'EV':'ICE'}</span>
        {isFollowing&&<span style={{fontSize:9,color:'#0D7377'}}>📍</span>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:10,color:'rgba(255,255,255,.45)'}}>
        <span style={{color:speed>0?'#22C55E':'rgba(255,255,255,.3)',fontWeight:600,minWidth:44}}>{Math.round(speed)} km/h</span>
        <span style={{color:ignition?'#22C55E':'rgba(255,255,255,.25)'}}>{ignition?'🔑':'⚪'}</span>
        {isEV&&battery!==null&&<span style={{color:+battery>50?'#A78BFA':+battery>20?'#EAB308':'#EF4444',fontWeight:700}}>🔋{battery}%</span>}
        {!isEV&&fuel!==null&&<span style={{color:+fuel>25?'#60A5FA':'#EF4444',fontWeight:700}}>⛽{Math.round(+fuel)}%</span>}
        <span style={{marginLeft:'auto',color:'rgba(255,255,255,.3)',fontSize:9}}>{timeAgo(dev.fixtime)}</span>
      </div>
      {dev.address&&<div style={{fontSize:9,color:'rgba(255,255,255,.22)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📍 {dev.address}</div>}
    </div>
  );
}

export default function LiveMap() {
  const mapRef=useRef(null),mapInst=useRef(null),markersRef=useRef({}),trailsRef=useRef({}),posHistRef=useRef({});
  const tileLayerRef=useRef(null),overlayRef=useRef(null);
  const [devices,setDevices]=useState([]);
  const [selected,setSelected]=useState(null);
  const [tileMode,setTileMode]=useState('street');
  const [lastUpdate,setLastUpdate]=useState(null);
  const [follow,setFollow]=useState(null);
  const [search,setSearch]=useState('');
  const [panelW,setPanelW]=useState(280);
  const [collapsed,setCollapsed]=useState(false);
  const [statusFilter,setStatusFilter]=useState('all');

  useEffect(()=>{
    if(!window.L||mapInst.current)return;
    const map=window.L.map(mapRef.current,{center:[0.3618,32.6018],zoom:14,zoomControl:false});
    window.L.control.zoom({position:'bottomright'}).addTo(map);
    tileLayerRef.current=window.L.tileLayer(TILES.street.url,{attribution:TILES.street.attr}).addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;};
  },[]);

  useEffect(()=>{
    if(!mapInst.current||!tileLayerRef.current)return;
    const t=TILES[tileMode]; tileLayerRef.current.setUrl(t.url);
    if(overlayRef.current){mapInst.current.removeLayer(overlayRef.current);overlayRef.current=null;}
    if(tileMode==='hybrid'&&t.overlay)
      overlayRef.current=window.L.tileLayer(t.overlay,{opacity:.35}).addTo(mapInst.current);
  },[tileMode]);

  const fetchLive=useCallback(async()=>{
    try{
      const res=await apiFetch('/telemetry/live'); if(!res?.data)return;
      setDevices(res.data); setLastUpdate(new Date());
      const map=mapInst.current; if(!map)return;
      res.data.forEach(dev=>{
        if(!dev.latitude||!dev.longitude)return;
        const lat=+dev.latitude,lon=+dev.longitude,course=+dev.course||0;
        const st=getStatus(dev), attrs=dev.attributes||{};
        const isEV=dev.powertrain==='ev'||attrs.io113!==undefined;
        const isOnline=(dev.connectivity||'').trim()==='online';
        if(!posHistRef.current[dev.id])posHistRef.current[dev.id]=[];
        const hist=posHistRef.current[dev.id], last=hist[hist.length-1];
        if(!last||last[0]!==lat||last[1]!==lon){hist.push([lat,lon]);if(hist.length>12)hist.shift();}
        if(trailsRef.current[dev.id])map.removeLayer(trailsRef.current[dev.id]);
        if(hist.length>1&&isOnline)
          trailsRef.current[dev.id]=window.L.polyline(hist,{color:st.color,weight:2,opacity:.5,dashArray:'5,4'}).addTo(map);
        const icon=isOnline?makeArrow(st.color,course,isEV):makeOfflineIcon(st.color);
        if(markersRef.current[dev.id]){markersRef.current[dev.id].setLatLng([lat,lon]).setIcon(icon);}
        else{markersRef.current[dev.id]=window.L.marker([lat,lon],{icon}).addTo(map)
          .on('click',()=>{setSelected(dev);map.panTo([lat,lon],{animate:true,duration:.5});});}
        if(follow===dev.id)map.panTo([lat,lon],{animate:true,duration:.5});
      });
      setSelected(sel=>sel?(res.data.find(d=>d.id===sel.id)||sel):null);
    }catch{}
  },[follow]);

  useEffect(()=>{fetchLive();const iv=setInterval(fetchLive,5000);return()=>clearInterval(iv);},[fetchLive]);

  const counts={
    all:devices.length,
    moving:devices.filter(d=>getStatus(d).key==='moving').length,
    stopped:devices.filter(d=>getStatus(d).key==='stopped').length,
    offline:devices.filter(d=>['warn30','warn60','offline'].includes(getStatus(d).key)).length,
  };

  const filtered=devices.filter(d=>{
    const st=getStatus(d);
    const ms=statusFilter==='all'?true:
      statusFilter==='moving'?st.key==='moving':
      statusFilter==='stopped'?st.key==='stopped':
      ['warn30','warn60','offline'].includes(st.key);
    return ms&&(!search||(d.name||'').toLowerCase().includes(search.toLowerCase())||
      (d.plate_no||'').toLowerCase().includes(search.toLowerCase()));
  });

  const pw=collapsed?32:panelW;

  return(
    <div style={{display:'flex',width:'100%',height:'100%',overflow:'hidden'}}>
      <div style={{width:pw,minWidth:pw,maxWidth:pw,background:'#0D1B2A',
        borderRight:'1px solid rgba(255,255,255,.07)',display:'flex',flexDirection:'column',
        overflow:'hidden',transition:'width .2s,min-width .2s,max-width .2s',flexShrink:0}}>
        {collapsed?(
          <button onClick={()=>setCollapsed(false)} style={{margin:'8px auto',width:24,height:24,
            background:'rgba(13,115,119,.2)',border:'1px solid rgba(13,115,119,.4)',
            borderRadius:4,color:'#0D7377',cursor:'pointer',fontSize:14,display:'flex',
            alignItems:'center',justifyContent:'center'}}>›</button>
        ):(<>
          <div style={{padding:'10px 10px 6px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:7}}>
              <div style={{flex:1,fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
                textTransform:'uppercase',letterSpacing:1}}>Objects ({devices.length})</div>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#22C55E'}}/>
                <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{lastUpdate?lastUpdate.toLocaleTimeString():'—'}</span>
              </div>
              <button onClick={()=>setCollapsed(true)} style={{background:'none',border:'none',
                color:'rgba(255,255,255,.3)',cursor:'pointer',fontSize:14,padding:'0 2px'}}>‹</button>
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search objects...'
              style={{width:'100%',padding:'5px 8px',background:'rgba(255,255,255,.06)',
                border:'1px solid rgba(255,255,255,.1)',borderRadius:5,color:'#fff',
                fontSize:11,outline:'none',boxSizing:'border-box'}}/>
            <div style={{display:'flex',gap:3,marginTop:6}}>
              {[
                {key:'all',label:'All '+counts.all},
                {key:'moving',label:'▶ '+counts.moving},
                {key:'stopped',label:'■ '+counts.stopped},
                {key:'offline',label:'✕ '+counts.offline}
              ].map(f=>(
                <button key={f.key} onClick={()=>setStatusFilter(f.key)} style={{
                  flex:1,padding:'3px 0',fontSize:9,fontWeight:600,cursor:'pointer',
                  background:statusFilter===f.key?'rgba(13,115,119,.3)':'rgba(255,255,255,.04)',
                  border:'1px solid '+(statusFilter===f.key?'#0D7377':'rgba(255,255,255,.08)'),
                  borderRadius:4,color:statusFilter===f.key?'#0D7377':'rgba(255,255,255,.4)'
                }}>{f.label}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto',overflowX:'hidden'}}>
            {filtered.length===0
              ?<div style={{padding:'20px 10px',textAlign:'center',color:'rgba(255,255,255,.25)',fontSize:12}}>No objects</div>
              :filtered.map(dev=>(
                <DeviceRow key={dev.id} dev={dev}
                  isSelected={selected?.id===dev.id}
                  isFollowing={follow===dev.id}
                  onClick={()=>{
                    setSelected(dev);
                    if(dev.latitude&&mapInst.current)
                      mapInst.current.panTo([+dev.latitude,+dev.longitude],{animate:true,duration:.5});
                  }}/>
              ))
            }
          </div>
          <div onMouseDown={e=>{
            e.preventDefault();
            const sx=e.clientX,sw=panelW;
            const mv=ev=>setPanelW(Math.max(220,Math.min(420,sw+ev.clientX-sx)));
            const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
            document.addEventListener('mousemove',mv);
            document.addEventListener('mouseup',up);
          }} style={{height:4,background:'rgba(13,115,119,.2)',cursor:'col-resize',borderTop:'1px solid rgba(13,115,119,.2)'}}/>
        </>)}
      </div>

      <div style={{flex:1,position:'relative',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div ref={mapRef} style={{flex:1,width:'100%'}}/>

        <div style={{position:'absolute',top:10,right:10,zIndex:1000,
          background:'rgba(13,27,42,.92)',backdropFilter:'blur(8px)',
          border:'1px solid rgba(255,255,255,.1)',borderRadius:8,display:'flex',overflow:'hidden'}}>
          {Object.entries(TILES).map(([k,t])=>(
            <button key={k} onClick={()=>setTileMode(k)} style={{
              padding:'6px 12px',border:'none',cursor:'pointer',
              background:tileMode===k?'#0D7377':'transparent',
              color:tileMode===k?'#fff':'rgba(255,255,255,.45)',
              fontSize:11,fontWeight:tileMode===k?700:400
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{position:'absolute',bottom:selected?300:20,left:10,zIndex:1000,
          background:'rgba(13,27,42,.9)',backdropFilter:'blur(8px)',
          border:'1px solid rgba(255,255,255,.08)',borderRadius:8,padding:'8px 12px',transition:'bottom .3s'}}>
          {[{color:'#22C55E',label:'Moving'},{color:'#EAB308',label:'Stopped'},
            {color:'#F97316',label:'<30m offline'},{color:'#EA580C',label:'30-60m offline'},
            {color:'#EF4444',label:'>60m offline'},{color:'#7C3AED',label:'EV'}
          ].map(l=>(
            <div key={l.label} style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:l.color,flexShrink:0}}/>
              <span style={{fontSize:10,color:'rgba(255,255,255,.5)'}}>{l.label}</span>
            </div>
          ))}
        </div>

        {selected&&(
          <BottomPanel
            dev={selected}
            onClose={()=>{setSelected(null);setFollow(null);}}
            follow={follow===selected.id}
            onFollow={()=>setFollow(f=>f===selected.id?null:selected.id)}
          />
        )}
      </div>

      <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}.leaflet-container{background:#0D1B2A}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px}'}</style>
    </div>
  );
}
