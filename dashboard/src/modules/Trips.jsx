import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../api.js';

function fmt(s){ if(!s)return'—'; const d=new Date(s); return d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
function dur(s){ if(!s)return'—'; const m=Math.round(+s/60); if(m<60)return`${m}m`; return`${Math.floor(m/60)}h ${m%60}m`; }
function spd(v){ return v?`${Math.round(+v)} km/h`:'—'; }

export default function Trips(){
  const [devices,setDevices]=useState([]);
  const [selDevice,setSelDevice]=useState(null);
  const [trips,setTrips]=useState([]);
  const [selTrip,setSelTrip]=useState(null);
  const [replayPos,setReplayPos]=useState([]);
  const [playing,setPlaying]=useState(false);
  const [playIdx,setPlayIdx]=useState(0);
  const [loading,setLoading]=useState(false);
  const [view,setView]=useState('list'); // list | replay
  const mapRef=useRef(null),mapInst=useRef(null),markerRef=useRef(null),polyRef=useRef(null),fullPolyRef=useRef(null);
  const animRef=useRef(null);

  useEffect(()=>{
    apiFetch('/telemetry/live').then(r=>{ setDevices(r?.data||[]); if(r?.data?.length>0)setSelDevice(r.data[0]); });
  },[]);

  useEffect(()=>{ if(selDevice)loadTrips(); },[selDevice]);

  async function loadTrips(){
    setLoading(true); setSelTrip(null); setView('list');
    const r=await apiFetch(`/trips/device/${selDevice.id}?days=30`).catch(()=>null);
    setTrips(r?.data||[]); setLoading(false);
  }

  async function openReplay(trip){
    setSelTrip(trip); setPlaying(false); setPlayIdx(0);
    const from=trip.start_time, to=trip.end_time;
    const r=await apiFetch(`/trips/device/${selDevice.id}/replay?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).catch(()=>null);
    const pos=r?.data||[];
    setReplayPos(pos);
    setView('replay');
    setTimeout(()=>initMap(pos),100);
  }

  function initMap(pos){
    if(!window.L)return;
    if(mapInst.current){mapInst.current.remove();mapInst.current=null;}
    const map=window.L.map(mapRef.current,{zoomControl:true});
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
    if(pos.length===0)return;
    const latlngs=pos.map(p=>[+p.latitude,+p.longitude]);
    fullPolyRef.current=window.L.polyline(latlngs,{color:'#0D7377',weight:3,opacity:.5,dashArray:'4,4'}).addTo(map);
    map.fitBounds(fullPolyRef.current.getBounds(),{padding:[30,30]});
    // Start/end markers
    window.L.circleMarker(latlngs[0],{radius:8,fillColor:'#2ecc71',color:'#fff',weight:2,fillOpacity:1}).addTo(map).bindPopup('Start');
    window.L.circleMarker(latlngs[latlngs.length-1],{radius:8,fillColor:'#E84545',color:'#fff',weight:2,fillOpacity:1}).addTo(map).bindPopup('End');
    // Moving marker
    const icon=window.L.divIcon({html:`<svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 18,20 12,16 6,20" fill="#8B5CF6" stroke="#fff" stroke-width="1.5"/></svg>`,className:'',iconSize:[24,24],iconAnchor:[12,12]});
    markerRef.current=window.L.marker(latlngs[0],{icon}).addTo(map);
    mapInst.current=map;
  }

  useEffect(()=>{
    if(!playing||replayPos.length===0)return;
    animRef.current=setInterval(()=>{
      setPlayIdx(i=>{
        const next=i+1;
        if(next>=replayPos.length){setPlaying(false);return i;}
        const p=replayPos[next];
        const ll=[+p.latitude,+p.longitude];
        if(markerRef.current){
          const svg=`<svg width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${+p.course||0},12,12)"><polygon points="12,2 18,20 12,16 6,20" fill="#8B5CF6" stroke="#fff" stroke-width="1.5"/></g></svg>`;
          markerRef.current.setLatLng(ll).setIcon(window.L.divIcon({html:svg,className:'',iconSize:[24,24],iconAnchor:[12,12]}));
        }
        if(mapInst.current)mapInst.current.panTo(ll,{animate:true,duration:.3});
        return next;
      });
    },100);
    return()=>clearInterval(animRef.current);
  },[playing,replayPos]);

  const curPos=replayPos[playIdx];
  const pct=replayPos.length>0?Math.round(playIdx/replayPos.length*100):0;

  return(<div style={{display:'flex',height:'100%',overflow:'hidden'}}>
    {/* Left panel */}
    <div style={{width:320,flexShrink:0,borderRight:'1px solid rgba(255,255,255,.07)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Device selector */}
      <div style={{padding:'16px',borderBottom:'1px solid rgba(255,255,255,.07)'}}>
        <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Asset</div>
        <select value={selDevice?.id||''} onChange={e=>{const d=devices.find(x=>x.id==e.target.value);setSelDevice(d);}}
          style={{width:'100%',padding:'8px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,color:'#fff',fontSize:13}}>
          {devices.map(d=>(<option key={d.id} value={d.id} style={{background:'#1A3A5C'}}>{d.name}</option>))}
        </select>
      </div>
      {/* Trip list */}
      <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
        <div style={{padding:'8px 16px',fontSize:11,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:1}}>
          Trips (last 30 days) · {trips.length} found
        </div>
        {loading?<div style={{padding:20,color:'rgba(255,255,255,.4)',fontSize:13}}>Computing trips...</div>:
        trips.length===0?<div style={{padding:20,color:'rgba(255,255,255,.3)',fontSize:13,textAlign:'center'}}><div style={{fontSize:32,marginBottom:8}}>🛣</div>No trips found</div>:
        trips.map((t,i)=>{
          const active=selTrip?.trip_num===t.trip_num&&view==='replay';
          return(<div key={i} onClick={()=>openReplay(t)} style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,.04)',cursor:'pointer',background:active?'rgba(13,115,119,.15)':'transparent',borderLeft:active?'3px solid #0D7377':'3px solid transparent',transition:'all .15s'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:600,color:active?'#fff':'rgba(255,255,255,.8)'}}>Trip {trips.length-i}</span>
              <span style={{fontSize:11,color:'rgba(255,255,255,.35)'}}>{dur(t.duration_s)}</span>
            </div>
            <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:4}}>{fmt(t.start_time)}</div>
            <div style={{display:'flex',gap:12}}>
              <span style={{fontSize:11,color:'#0D7377'}}>⚡ {spd(t.max_speed_kmh)} max</span>
              <span style={{fontSize:11,color:'rgba(255,255,255,.35)'}}>{t.position_count} pts</span>
            </div>
          </div>);
        })}
      </div>
    </div>

    {/* Right — replay or placeholder */}
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {view==='list'?(
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'rgba(255,255,255,.3)'}}>
          <div style={{fontSize:48}}>🛣</div>
          <div style={{fontSize:15,fontWeight:600}}>Select a trip to replay</div>
          <div style={{fontSize:13}}>Click any trip in the list on the left</div>
        </div>
      ):(
        <>
          {/* Replay controls */}
          <div style={{padding:'12px 20px',background:'rgba(13,27,42,.95)',borderBottom:'1px solid rgba(255,255,255,.07)',display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:700,color:'#0D7377'}}>🎬 Trip Replay</div>
            <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'rgba(255,255,255,.6)',fontSize:11,padding:'4px 12px',cursor:'pointer'}}>← Back</button>
            <div style={{flex:1}}/>
            {curPos&&<div style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>{fmt(curPos.fixtime)} · {spd(curPos.speed)}</div>}
            <button onClick={()=>{if(playIdx>=replayPos.length-1)setPlayIdx(0);setPlaying(p=>!p);}}
              style={{padding:'7px 20px',background:playing?'#E84545':'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',minWidth:80}}>
              {playing?'⏸ Pause':playIdx>0?'▶ Resume':'▶ Play'}
            </button>
            <button onClick={()=>{setPlaying(false);setPlayIdx(0);if(markerRef.current&&replayPos.length>0)markerRef.current.setLatLng([+replayPos[0].latitude,+replayPos[0].longitude]);}}
              style={{padding:'7px 14px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'rgba(255,255,255,.6)',fontSize:13,cursor:'pointer'}}>⏹</button>
          </div>
          {/* Progress bar / scrubber */}
          <div style={{padding:'8px 20px',background:'rgba(13,27,42,.9)',borderBottom:'1px solid rgba(255,255,255,.05)',flexShrink:0}}>
            <input type="range" min={0} max={replayPos.length-1} value={playIdx}
              onChange={e=>{
                const idx=+e.target.value; setPlayIdx(idx); setPlaying(false);
                const p=replayPos[idx];
                if(markerRef.current&&p)markerRef.current.setLatLng([+p.latitude,+p.longitude]);
              }}
              style={{width:'100%',accentColor:'#0D7377',cursor:'pointer'}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'rgba(255,255,255,.3)',marginTop:4}}>
              <span>{fmt(replayPos[0]?.fixtime)}</span>
              <span style={{color:'#0D7377',fontWeight:600}}>{pct}% · {playIdx}/{replayPos.length} pts</span>
              <span>{fmt(replayPos[replayPos.length-1]?.fixtime)}</span>
            </div>
          </div>
          {/* Map */}
          <div ref={mapRef} style={{flex:1}}/>
        </>
      )}
    </div>
  </div>);
}