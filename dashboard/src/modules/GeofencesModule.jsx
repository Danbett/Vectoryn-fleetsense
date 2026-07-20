import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';

export default function GeofencesModule(){
  const [zones,setZones]=useState([]);
  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('map');
  const [selZone,setSelZone]=useState(null);
  const [drawing,setDrawing]=useState(false);
  const [drawType,setDrawType]=useState('circle');
  const [form,setForm]=useState({name:'',zoneType:'circle',radiusM:500,speedLimit:'',alertOnEnter:true,alertOnExit:true,color:'#0D7377'});
  const [saving,setSaving]=useState(false);
  const mapRef=useRef(null),mapInst=useRef(null),zonesLayerRef=useRef(null),devicesLayerRef=useRef(null),drawLayerRef=useRef(null);

  useEffect(()=>{
    Promise.all([
      apiFetch('/geofences').catch(()=>({data:[]})),
      apiFetch('/geofences/events?days=7').catch(()=>({data:[]}))
    ]).then(([z,e])=>{setZones(z?.data||[]);setEvents(e?.data||[]);setLoading(false);});
  },[]);

  // Init Leaflet map
  useEffect(()=>{
    if(!window.L||mapInst.current||tab!=='map')return;
    const map=window.L.map(mapRef.current,{center:[0.3618,32.6018],zoom:12});
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
    zonesLayerRef.current=window.L.layerGroup().addTo(map);
    devicesLayerRef.current=window.L.layerGroup().addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;};
  },[tab]);

  // Render zones on map
  useEffect(()=>{
    if(!mapInst.current||!zonesLayerRef.current)return;
    zonesLayerRef.current.clearLayers();
    zones.forEach(z=>{
      try{
        const color=z.color||'#0D7377';
        if(z.zone_type==='circle'){
          const coords=JSON.parse(z.coordinates||'{}');
          if(coords.lat&&coords.lng){
            window.L.circle([coords.lat,coords.lng],{radius:z.radius_m||500,color,fillOpacity:.15,weight:2})
              .addTo(zonesLayerRef.current)
              .bindTooltip(z.name,{permanent:true,direction:'center',className:'geo-label'});
          }
        } else {
          const coords=JSON.parse(z.coordinates||'[]');
          if(Array.isArray(coords)&&coords.length>2){
            window.L.polygon(coords,{color,fillOpacity:.15,weight:2})
              .addTo(zonesLayerRef.current)
              .bindTooltip(z.name,{permanent:false});
          }
        }
      }catch{}
    });
  },[zones,tab]);

  // Draw a new circle on click
  useEffect(()=>{
    if(!mapInst.current)return;
    const map=mapInst.current;
    if(drawing){
      map.getContainer().style.cursor='crosshair';
      const onClick=(e)=>{
        if(drawLayerRef.current)map.removeLayer(drawLayerRef.current);
        const c=window.L.circle([e.latlng.lat,e.latlng.lng],{radius:form.radiusM||500,color:form.color||'#0D7377',fillOpacity:.2,weight:2,dashArray:'6,4'});
        c.addTo(map);drawLayerRef.current=c;
        setForm(f=>({...f,coordinates:JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng})}));
        setDrawing(false);map.getContainer().style.cursor='';
        map.off('click',onClick);
      };
      map.on('click',onClick);
      return()=>{map.off('click',onClick);map.getContainer().style.cursor='';};
    }
  },[drawing,form.radiusM,form.color]);

  async function saveZone(){
    setSaving(true);
    await apiFetch('/geofences',{method:'POST',body:JSON.stringify(form)}).catch(()=>{});
    setSaving(false);
    if(drawLayerRef.current&&mapInst.current){mapInst.current.removeLayer(drawLayerRef.current);drawLayerRef.current=null;}
    setForm({name:'',zoneType:'circle',radiusM:500,speedLimit:'',alertOnEnter:true,alertOnExit:true,color:'#0D7377'});
    const z=await apiFetch('/geofences').catch(()=>({data:[]}));
    setZones(z?.data||[]);
  }

  async function deleteZone(id){
    if(!confirm('Delete this zone?'))return;
    await apiFetch(`/geofences/${id}`,{method:'DELETE'}).catch(()=>{});
    const z=await apiFetch('/geofences').catch(()=>({data:[]}));
    setZones(z?.data||[]);if(selZone?.id===id)setSelZone(null);
  }

  return(<div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    {/* Header */}
    <div style={{padding:'16px 24px 10px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div>
          <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Operations</div>
          <h2 style={{fontSize:20,fontWeight:800}}>Geofences & POI</h2>
        </div>
        <div style={{flex:1}}/>
        {['map','zones','events'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'7px 18px',background:tab===t?'#0D7377':'rgba(255,255,255,.06)',border:`1px solid ${tab===t?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:8,color:tab===t?'#fff':'rgba(255,255,255,.5)',fontSize:12,fontWeight:tab===t?700:400,cursor:'pointer',textTransform:'capitalize'}}>{t==='map'?'Map & Draw':t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>
    </div>

    <div style={{flex:1,overflow:'hidden',display:'flex'}}>
      {tab==='map'?(<>
        {/* Draw panel */}
        <div style={{width:280,flexShrink:0,borderRight:'1px solid rgba(255,255,255,.07)',display:'flex',flexDirection:'column',overflow:'auto',padding:16}}>
          <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.6)',marginBottom:14}}>Draw New Zone</div>
          {[{l:'Zone Name',k:'name',t:'text'},{l:'Speed Limit (km/h)',k:'speedLimit',t:'number'},{l:'Radius (m)',k:'radiusM',t:'number'}].map(({l,k,t})=>(
            <div key={k} style={{marginBottom:10}}>
              <label style={{fontSize:10,color:'rgba(255,255,255,.35)',display:'block',marginBottom:3,textTransform:'uppercase'}}>{l}</label>
              <input type={t} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                style={{width:'100%',padding:'7px 10px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
          ))}
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,color:'rgba(255,255,255,.35)',display:'block',marginBottom:3,textTransform:'uppercase'}}>Color</label>
            <input type="color" value={form.color||'#0D7377'} onChange={e=>setForm(f=>({...f,color:e.target.value}))}
              style={{width:'100%',height:36,padding:2,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,cursor:'pointer'}}/>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            {[{k:'alertOnEnter',l:'Alert on Enter'},{k:'alertOnExit',l:'Alert on Exit'}].map(({k,l})=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'rgba(255,255,255,.6)'}}>
                <input type="checkbox" checked={!!form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.checked}))} style={{accentColor:'#0D7377'}}/>
                {l}
              </label>
            ))}
          </div>
          <button onClick={()=>setDrawing(true)} disabled={!form.name||drawing}
            style={{width:'100%',padding:'9px',background:drawing?'#0a5f63':'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',marginBottom:8,opacity:!form.name?.5:1}}>
            {drawing?'Click on map to place...':'📍 Click Map to Draw'}
          </button>
          {form.coordinates&&<button onClick={saveZone} disabled={saving}
            style={{width:'100%',padding:'9px',background:'#22C55E',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>
            {saving?'Saving...':'✓ Save Zone'}
          </button>}
          <div style={{borderTop:'1px solid rgba(255,255,255,.07)',marginTop:16,paddingTop:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',marginBottom:10}}>Zones ({zones.length})</div>
            {zones.map(z=>(<div key={z.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
              <div style={{width:10,height:10,borderRadius:2,background:z.color||'#0D7377',flexShrink:0}}/>
              <span style={{flex:1,fontSize:11,color:'rgba(255,255,255,.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{z.name}</span>
              <span style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>{z.event_count||0} ev</span>
              <button onClick={()=>deleteZone(z.id)} style={{background:'none',border:'none',color:'rgba(232,69,69,.6)',cursor:'pointer',fontSize:14,padding:0}}>×</button>
            </div>))}
          </div>
        </div>
        {/* Map */}
        <div style={{flex:1,position:'relative'}}>
          <div ref={mapRef} style={{width:'100%',height:'100%'}}/>
          {drawing&&<div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:1000,background:'rgba(13,115,119,.9)',color:'#fff',padding:'8px 20px',borderRadius:24,fontSize:13,fontWeight:600,pointerEvents:'none'}}>Click on the map to place the zone center</div>}
        </div>
      </>):

      tab==='zones'?(<div style={{flex:1,overflow:'auto',padding:20}}>
        {zones.length===0?<div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,.25)'}}><div style={{fontSize:40,marginBottom:8}}>📍</div><div>No zones created yet</div></div>:
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Name','Type','Radius','Speed Limit','Alerts','Events (7d)','Color','Actions'].map(h=>(
            <th key={h} style={{padding:'8px 12px',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.4)',fontSize:10,textTransform:'uppercase',letterSpacing:.5}}>{h}</th>
          ))}</tr></thead>
          <tbody>{zones.map((z,i)=>(<tr key={z.id} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.02)':'transparent'}}>
            <td style={{padding:'8px 12px',fontWeight:600}}>{z.name}</td>
            <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)',textTransform:'capitalize'}}>{z.zone_type}</td>
            <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)'}}>{z.radius_m?`${z.radius_m}m`:'—'}</td>
            <td style={{padding:'8px 12px',color:z.speed_limit?'#F59E0B':'rgba(255,255,255,.3)'}}>{z.speed_limit?`${z.speed_limit} km/h`:'—'}</td>
            <td style={{padding:'8px 12px'}}>
              {z.alert_on_enter&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:'rgba(34,197,94,.2)',color:'#22C55E',marginRight:4}}>IN</span>}
              {z.alert_on_exit&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:'rgba(239,68,68,.2)',color:'#EF4444'}}>OUT</span>}
            </td>
            <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)'}}>{z.event_count||0}</td>
            <td style={{padding:'8px 12px'}}><div style={{width:20,height:20,borderRadius:4,background:z.color||'#0D7377'}}/></td>
            <td style={{padding:'8px 12px'}}>
              <button onClick={()=>deleteZone(z.id)} style={{padding:'4px 10px',background:'rgba(232,69,69,.1)',border:'1px solid rgba(232,69,69,.2)',borderRadius:6,color:'#E84545',fontSize:11,cursor:'pointer'}}>Delete</button>
            </td>
          </tr>))}</tbody>
        </table>}
      </div>):

      (<div style={{flex:1,overflow:'auto',padding:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:'rgba(255,255,255,.7)'}}>Zone Events (last 7 days)</div>
        {events.length===0?<div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,.25)'}}><div style={{fontSize:40,marginBottom:8}}>🔔</div><div>No zone events yet</div></div>:
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Time','Zone','Device','Event','Dwell Time'].map(h=>(
            <th key={h} style={{padding:'8px 12px',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.4)',fontSize:10,textTransform:'uppercase',letterSpacing:.5}}>{h}</th>
          ))}</tr></thead>
          <tbody>{events.map((e,i)=>(<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i%2?'rgba(255,255,255,.02)':'transparent'}}>
            <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)',fontSize:11,whiteSpace:'nowrap'}}>{new Date(e.fixtime).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
            <td style={{padding:'8px 12px'}}><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:2,background:e.color||'#0D7377'}}/>{e.zone_name}</div></td>
            <td style={{padding:'8px 12px',fontWeight:600}}>{e.device_name}</td>
            <td style={{padding:'8px 12px'}}><span style={{color:e.event_type==='enter'?'#22C55E':'#EF4444',fontWeight:700}}>{e.event_type==='enter'?'→ Enter':'← Exit'}</span></td>
            <td style={{padding:'8px 12px',color:'rgba(255,255,255,.5)'}}>{e.dwell_s?`${Math.round(e.dwell_s/60)}m`:'—'}</td>
          </tr>))}</tbody>
        </table>}
      </div>)}
    </div>
    <style>{'.geo-label{background:transparent;border:none;color:#fff;font-weight:700;font-size:11px;text-shadow:0 1px 3px rgba(0,0,0,.8);}'}</style>
  </div>);
}
