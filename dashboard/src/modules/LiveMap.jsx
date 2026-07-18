import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';
const TILES={
  street:{label:'Street',url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',attr:'© OpenStreetMap contributors'},
  satellite:{label:'Satellite',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attr:'© Esri'},
  hybrid:{label:'Hybrid',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attr:'© Esri',overlay:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
};
function arrow(color,course,isEV){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><g transform="rotate(${course||0},18,18)"><polygon points="18,4 26,28 18,23 10,28" fill="${color}" stroke="#fff" stroke-width="2" opacity=".95"/></g>${isEV?`<circle cx="28" cy="8" r="7" fill="#8B5CF6" stroke="#fff" stroke-width="1.5"/><text x="28" y="12" text-anchor="middle" font-size="8" fill="white" font-weight="bold">EV</text>`:''}</svg>`;
  return window.L.divIcon({html:svg,className:'',iconSize:[36,36],iconAnchor:[18,18]});
}
function offIcon(){
  return window.L.divIcon({html:`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#E84545" stroke="#fff" stroke-width="2" opacity=".8"/><text x="14" y="18" text-anchor="middle" font-size="12" fill="white">✕</text></svg>`,className:'',iconSize:[28,28],iconAnchor:[14,14]});
}
export default function LiveMap(){
  const mapRef=useRef(null),mapInst=useRef(null),markers=useRef({}),trails=useRef({}),hist=useRef({});
  const tileRef=useRef(null),overlayRef=useRef(null);
  const [devices,setDevices]=useState([]);const [sel,setSel]=useState(null);
  const [tileMode,setTileMode]=useState('street');const [lastUp,setLastUp]=useState(null);
  const [follow,setFollow]=useState(null);
  useEffect(()=>{
    if(!window.L||mapInst.current)return;
    const map=window.L.map(mapRef.current,{center:[0.3618,32.6018],zoom:14});
    tileRef.current=window.L.tileLayer(TILES.street.url,{attribution:TILES.street.attr}).addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;};
  },[]);
  useEffect(()=>{
    if(!mapInst.current||!tileRef.current)return;
    const t=TILES[tileMode];tileRef.current.setUrl(t.url);
    if(overlayRef.current){mapInst.current.removeLayer(overlayRef.current);overlayRef.current=null;}
    if(tileMode==='hybrid'&&t.overlay)overlayRef.current=window.L.tileLayer(t.overlay,{opacity:.4}).addTo(mapInst.current);
  },[tileMode]);
  const fetchLive=useCallback(async()=>{
    try{
      const res=await apiFetch('/telemetry/live');if(!res?.data)return;
      setDevices(res.data);setLastUp(new Date());
      const map=mapInst.current;if(!map)return;
      res.data.forEach(dev=>{
        if(!dev.latitude||!dev.longitude)return;
        const lat=+dev.latitude,lon=+dev.longitude,speed=+dev.speed||0,course=+dev.course||0;
        const attrs=dev.attributes||{},isEV=dev.powertrain==='ev'||attrs.io113!==undefined;
        const isOnline=(dev.connectivity||'').trim()==='online';
        const isMoving=isOnline&&speed>2;
        // 5-state color logic per spec:
        // moving=green, stopped(online)=yellow, no comms 5-30min=orange, 30-60min=dark orange, 60min+=red
        const lastUp=dev.fixtime?new Date(dev.fixtime):null;
        const minsAgo=lastUp?(Date.now()-lastUp.getTime())/60000:9999;
        let color;
        if(isEV&&isOnline) color='#8B5CF6';          // EV online = purple
        else if(isMoving) color='#2ecc71';             // moving = green
        else if(isOnline) color='#F59E0B';             // online stopped = yellow
        else if(minsAgo<30) color='#F97316';           // no comms < 30min = orange
        else if(minsAgo<60) color='#EA580C';           // no comms 30-60min = dark orange
        else color='#E84545';                          // no comms > 60min = red
        if(!hist.current[dev.id])hist.current[dev.id]=[];
        const h=hist.current[dev.id];
        if(h.length===0||h[h.length-1][0]!==lat||h[h.length-1][1]!==lon){h.push([lat,lon]);if(h.length>12)h.shift();}
        if(trails.current[dev.id])map.removeLayer(trails.current[dev.id]);
        if(h.length>1&&isOnline)trails.current[dev.id]=window.L.polyline(h,{color,weight:2.5,opacity:.6,dashArray:'6,4'}).addTo(map);
        const icon=isOnline?arrow(color,course,isEV):offIcon();
        if(markers.current[dev.id]){markers.current[dev.id].setLatLng([lat,lon]).setIcon(icon);}
        else{markers.current[dev.id]=window.L.marker([lat,lon],{icon}).addTo(map).on('click',()=>setSel(dev));}
        if(follow===dev.id)map.setView([lat,lon],map.getZoom());
      });
    }catch(e){}
  },[follow]);
  useEffect(()=>{fetchLive();const iv=setInterval(fetchLive,5000);return()=>clearInterval(iv);},[fetchLive]);
  useEffect(()=>{if(sel){const u=devices.find(d=>d.id===sel.id);if(u)setSel(u);}},[devices]);
  const attrs=sel?.attributes||{},bat=attrs.io113??null;
  return(<div style={{position:'relative',width:'100%',height:'100%'}}>
    <div ref={mapRef} style={{width:'100%',height:'100%'}}/>
    <div style={{position:'absolute',top:12,right:12,zIndex:1000,background:'rgba(13,27,42,.92)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,display:'flex',overflow:'hidden'}}>
      {Object.entries(TILES).map(([k,t])=>(<button key={k} onClick={()=>setTileMode(k)} style={{padding:'7px 14px',border:'none',cursor:'pointer',background:tileMode===k?'#0D7377':'transparent',color:tileMode===k?'#fff':'rgba(255,255,255,.5)',fontSize:12,fontWeight:tileMode===k?700:400}}>{t.label}</button>))}
    </div>
    <div style={{position:'absolute',top:12,left:12,zIndex:1000,background:'rgba(13,27,42,.92)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,padding:'8px 14px',display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:'#2ecc71',animation:'pulse 2s infinite'}}/>
      <span style={{fontSize:12,color:'rgba(255,255,255,.7)',fontWeight:600}}>{devices.filter(d=>d.connectivity==='online').length} / {devices.length} Online</span>
      {lastUp&&<span style={{fontSize:11,color:'rgba(255,255,255,.35)'}}>· {lastUp.toLocaleTimeString()}</span>}
    </div>
    <div style={{position:'absolute',bottom:20,left:12,zIndex:1000,background:'rgba(13,27,42,.92)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,padding:10,minWidth:200}}>
      <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:8,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>Assets</div>
      {devices.map(d=>{
        const online=(d.connectivity||'').trim()==='online',ev=d.powertrain==='ev'||(d.attributes?.io113!==undefined);
        const color=ev?'#8B5CF6':(online?'#2ecc71':'#E84545');
        return(<div key={d.id} onClick={()=>{setSel(d);if(d.latitude&&mapInst.current)mapInst.current.setView([+d.latitude,+d.longitude],16);}}
          style={{display:'flex',alignItems:'center',gap:8,padding:'6px 4px',cursor:'pointer',borderRadius:6}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:1}}>{online?`${+(d.speed||0).toFixed?parseFloat(d.speed||0).toFixed(0):0} km/h`:'Offline'}{ev?' · EV 🔋':''}</div>
          </div>
        </div>);
      })}
    </div>
    <div style={{position:'absolute',bottom:20,right:12,zIndex:1000,background:'rgba(13,27,42,.92)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,padding:'10px 14px'}}>
      {[{color:'#2ecc71',label:'Moving'},{color:'#F59E0B',label:'Idle'},{color:'#8B5CF6',label:'EV'},{color:'#E84545',label:'Offline'}].map(l=>(
        <div key={l.label} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:l.color}}/>
          <span style={{fontSize:11,color:'rgba(255,255,255,.55)'}}>{l.label}</span>
        </div>))}
    </div>
    {sel&&(<div style={{position:'absolute',top:60,right:12,zIndex:1001,width:300,background:'rgba(13,27,42,.97)',border:'1px solid rgba(13,115,119,.4)',borderRadius:12,padding:20,backdropFilter:'blur(12px)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
        <div><div style={{fontSize:15,fontWeight:700}}>{sel.name}</div><div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginTop:2}}>{sel.uniqueid}</div></div>
        <button onClick={()=>setSel(null)} style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:18}}>×</button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        {[{label:sel.connectivity,color:(sel.connectivity||'').trim()==='online'?'#2ecc71':'#E84545'},{label:sel.map_status,color:'#F59E0B'},...(sel.powertrain==='ev'?[{label:'EV',color:'#8B5CF6'}]:[])].map(b=>(<span key={b.label} style={{fontSize:10,padding:'3px 10px',borderRadius:20,background:`${b.color}22`,color:b.color,fontWeight:700,textTransform:'uppercase'}}>{b.label}</span>))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
        {[{label:'Speed',value:`${parseFloat(sel.speed||0).toFixed(0)} km/h`},{label:'Course',value:`${sel.course||0}°`},{label:'Latitude',value:sel.latitude?parseFloat(sel.latitude).toFixed(5):'N/A'},{label:'Longitude',value:sel.longitude?parseFloat(sel.longitude).toFixed(5):'N/A'},{label:'Satellites',value:attrs.sat??'N/A'},{label:'Signal',value:attrs.rssi!==undefined?`${attrs.rssi} dBm`:'N/A'},{label:'Power',value:attrs.power?`${attrs.power}V`:'N/A'},{label:'Battery',value:attrs.battery?`${attrs.battery}V`:'N/A'}].map(r=>(<div key={r.label} style={{background:'rgba(255,255,255,.04)',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginBottom:2}}>{r.label}</div><div style={{fontSize:13,fontWeight:600}}>{r.value}</div></div>))}
      </div>
      {bat!==null&&<div style={{marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>🔋 EV Battery</span><span style={{fontSize:13,fontWeight:700,color:'#8B5CF6'}}>{bat}%</span></div><div style={{height:6,background:'rgba(255,255,255,.1)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',borderRadius:3,width:`${bat}%`,background:bat>50?'#2ecc71':bat>20?'#F59E0B':'#E84545'}}/></div></div>}
      {sel.fixtime&&<div style={{fontSize:11,color:'rgba(255,255,255,.3)',borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:10}}>Last fix: {new Date(sel.fixtime).toLocaleString()}</div>}
      <button onClick={()=>setFollow(follow===sel.id?null:sel.id)} style={{marginTop:10,width:'100%',padding:'8px',background:follow===sel.id?'rgba(13,115,119,.3)':'rgba(255,255,255,.06)',border:follow===sel.id?'1px solid #0D7377':'1px solid rgba(255,255,255,.1)',borderRadius:8,color:follow===sel.id?'#0D7377':'rgba(255,255,255,.6)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{follow===sel.id?'📍 Following...':'📍 Follow Asset'}</button>
    </div>)}
    <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}'}</style>
  </div>);
}
