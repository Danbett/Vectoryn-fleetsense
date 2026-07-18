import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';

export default function TelemetryExplorer(){
  const [devices,setDevices]=useState([]);
  const [selDevice,setSelDevice]=useState(null);
  const [hours,setHours]=useState(1);
  const [messages,setMessages]=useState([]);
  const [loading,setLoading]=useState(false);
  const [selMsg,setSelMsg]=useState(null);
  const [avlMap,setAvlMap]=useState({});
  const [filter,setFilter]=useState('');
  const [autoRefresh,setAutoRefresh]=useState(false);
  const timerRef=useRef(null);

  useEffect(()=>{
    apiFetch('/telemetry/live').then(r=>{
      const devs=r?.data||[]; setDevices(devs);
      if(devs.length>0)setSelDevice(devs[0]);
    });
    apiFetch('/fleet/avl-params').then(r=>{
      const map={};
      (r?.data||[]).forEach(p=>{ map[`io${p.avl_id}`]=p; map[p.name]=p; });
      setAvlMap(map);
    });
  },[]);

  useEffect(()=>{
    if(selDevice) fetchMessages();
  },[selDevice,hours]);

  useEffect(()=>{
    if(autoRefresh){ timerRef.current=setInterval(fetchMessages,10000); }
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[autoRefresh,selDevice,hours]);

  async function fetchMessages(){
    if(!selDevice)return;
    setLoading(true);
    const r=await apiFetch(`/telemetry/device/${selDevice.id}/history?hours=${hours}`).catch(()=>null);
    setMessages(r?.data||[]); setLoading(false);
  }

  function parseAttrs(raw){
    if(!raw)return{};
    if(typeof raw==='object')return raw;
    try{return JSON.parse(raw);}catch{return{};}
  }

  const allKeys=selMsg?Object.keys(parseAttrs(selMsg.attributes)).sort():[];
  const filteredMsgs=messages.filter(m=>
    !filter||(m.fixtime||'').includes(filter)||
    JSON.stringify(m.attributes).toLowerCase().includes(filter.toLowerCase())
  );

  return(<div style={{height:'100%',display:'flex',overflow:'hidden'}}>
    {/* Left — message list */}
    <div style={{width:360,flexShrink:0,borderRight:'1px solid rgba(255,255,255,.07)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'16px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
        <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:12}}>Telemetry Explorer</div>
        <select value={selDevice?.id||''} onChange={e=>{const d=devices.find(x=>x.id==e.target.value);setSelDevice(d);}}
          style={{width:'100%',padding:'8px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'#fff',fontSize:12,marginBottom:8}}>
          {devices.map(d=>(<option key={d.id} value={d.id} style={{background:'#1A3A5C'}}>{d.name}</option>))}
        </select>
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          {[1,6,24].map(h=>(<button key={h} onClick={()=>setHours(h)}
            style={{flex:1,padding:'6px',background:hours===h?'#0D7377':'rgba(255,255,255,.06)',border:`1px solid ${hours===h?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:6,color:hours===h?'#fff':'rgba(255,255,255,.5)',fontSize:11,cursor:'pointer'}}>{h}h</button>))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter messages..."
            style={{flex:1,padding:'6px 10px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'#fff',fontSize:11,outline:'none'}}/>
          <button onClick={()=>setAutoRefresh(a=>!a)}
            style={{padding:'6px 10px',background:autoRefresh?'rgba(13,115,119,.3)':'rgba(255,255,255,.06)',border:`1px solid ${autoRefresh?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:6,color:autoRefresh?'#0D7377':'rgba(255,255,255,.5)',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>
            {autoRefresh?'⏸ Live':'▶ Live'}
          </button>
        </div>
        <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:8}}>{filteredMsgs.length} messages</div>
      </div>

      <div style={{flex:1,overflowY:'auto'}}>
        {loading&&messages.length===0?(<div style={{padding:20,color:'rgba(255,255,255,.4)',fontSize:12}}>Loading messages...</div>):
        filteredMsgs.map((m,i)=>{
          const attrs=parseAttrs(m.attributes);
          const ign=attrs.ignition;const spd=attrs.io24||attrs.speed||m.speed;
          const bat=attrs.io113;
          return(<div key={i} onClick={()=>setSelMsg(m)}
            style={{padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,.04)',cursor:'pointer',background:selMsg===m?'rgba(13,115,119,.15)':'transparent',borderLeft:selMsg===m?'3px solid #0D7377':'3px solid transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:600,color:selMsg===m?'#fff':'rgba(255,255,255,.75)'}}>{new Date(m.fixtime).toLocaleTimeString()}</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{Object.keys(attrs).length} params</span>
            </div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.35)',display:'flex',gap:10}}>
              {ign!==undefined&&<span style={{color:ign?'#2ecc71':'#E84545'}}>IGN:{ign?'ON':'OFF'}</span>}
              {spd!==undefined&&<span>SPD:{Math.round(+spd)}km/h</span>}
              {bat!==undefined&&<span style={{color:'#8B5CF6'}}>BAT:{bat}%</span>}
              <span>{parseFloat(m.latitude).toFixed(4)},{parseFloat(m.longitude).toFixed(4)}</span>
            </div>
          </div>);
        })}
      </div>
    </div>

    {/* Right — decoded message */}
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      {!selMsg?(<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'rgba(255,255,255,.3)'}}>
        <div style={{fontSize:48}}>📡</div>
        <div style={{fontSize:15,fontWeight:600}}>Select a message to decode</div>
        <div style={{fontSize:13}}>Every AVL parameter decoded with units</div>
      </div>):(
        <div style={{flex:1,overflowY:'auto',padding:20}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Message Detail</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,.4)'}}>
              {new Date(selMsg.fixtime).toLocaleString()} · {parseFloat(selMsg.latitude).toFixed(6)}, {parseFloat(selMsg.longitude).toFixed(6)} · {selMsg.speed} km/h
            </div>
          </div>
          <div style={{display:'grid',gap:6}}>
            {allKeys.map(key=>{
              const val=parseAttrs(selMsg.attributes)[key];
              const avl=avlMap[key];
              const unit=avl?.units||'';
              const displayVal=typeof val==='boolean'?val?'TRUE':'FALSE':String(val);
              const isSpecial=['ignition','motion'].includes(key)||(typeof val==='boolean');
              const isEV=['io113','io116','io151','io152'].includes(key);
              return(<div key={key} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 12px',background:'rgba(255,255,255,.03)',borderRadius:8,border:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{width:10,height:10,borderRadius:2,background:isEV?'#8B5CF6':isSpecial?'#0D7377':'rgba(255,255,255,.15)',flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:isEV?'#A78BFA':isSpecial?'#0D7377':'rgba(255,255,255,.8)'}}>{key}</div>
                  {avl?.name&&avl.name!==key&&<div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:1}}>{avl.name}</div>}
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <span style={{fontSize:13,fontWeight:700,color:isEV?'#A78BFA':isSpecial&&val===true?'#2ecc71':isSpecial&&val===false?'#E84545':'#fff'}}>{displayVal}</span>
                  {unit&&<span style={{fontSize:10,color:'rgba(255,255,255,.35)',marginLeft:4}}>{unit}</span>}
                </div>
              </div>);
            })}
          </div>
        </div>
      )}
    </div>
  </div>);
}