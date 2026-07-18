import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

const POWERTRAIN_COLORS={'ice':'#2E5FA3','ev':'#8B5CF6','hybrid':'#F59E0B'};
const TYPES=['car','truck','van','bus','motorcycle','forklift','crane','generator','ev','ebike','other'];

export default function FleetRegistry(){
  const [devices,setDevices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [filter,setFilter]=useState('');

  useEffect(()=>{ loadDevices(); },[]);

  async function loadDevices(){
    setLoading(true);
    const r=await apiFetch('/fleet/devices?size=200').catch(()=>null);
    setDevices(r?.data||[]); setLoading(false);
  }

  function startEdit(dev){
    setEditing(dev.id);
    setForm({
      assetCode:dev.asset_code||'', assetType:dev.asset_type||'car',
      powertrain:dev.powertrain||'ice', make:dev.make||'', model:dev.model||'',
      year:dev.year||'', plateNo:dev.plate_no||'', fuelType:dev.fuel_type||'diesel',
      tankCapacityL:dev.tank_capacity_l||'', evPackKwh:dev.ev_pack_kwh||'',
      terminalModel:dev.terminal_model||'', iconKey:dev.icon_key||'truck',
      colorHex:dev.color_hex||'2E5FA3'
    });
    setSaved(false);
  }

  async function saveEdit(id){
    setSaving(true);
    await apiFetch(`/fleet/devices/${id}`,{method:'PUT',body:JSON.stringify(form)}).catch(()=>null);
    setSaving(false); setSaved(true);
    setTimeout(()=>{setEditing(null);loadDevices();},800);
  }

  const filtered=devices.filter(d=>
    !filter||(d.name||'').toLowerCase().includes(filter.toLowerCase())||
    (d.uniqueid||'').includes(filter)||(d.plate_no||'').toLowerCase().includes(filter.toLowerCase())
  );

  const inp=(label,key,type='text',opts=null)=>(
    <div style={{marginBottom:12}}>
      <label style={{fontSize:11,color:'rgba(255,255,255,.5)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>
      {opts?
        <select value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
          style={{width:'100%',padding:'8px 10px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:6,color:'#fff',fontSize:13}}>
          {opts.map(o=>(<option key={o} value={o} style={{background:'#1A3A5C'}}>{o}</option>))}
        </select>:
        <input type={type} value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
          style={{width:'100%',padding:'8px 10px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:6,color:'#fff',fontSize:13,outline:'none'}}/>
      }
    </div>
  );

  return(<div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    {/* Header */}
    <div style={{padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <div>
          <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Fleet</div>
          <h2 style={{fontSize:20,fontWeight:800}}>Asset Registry</h2>
        </div>
        <div style={{flex:1}}/>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search assets..."
          style={{padding:'8px 14px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:13,width:220,outline:'none'}}/>
        <div style={{fontSize:13,color:'rgba(255,255,255,.4)'}}>{devices.length} assets</div>
      </div>
    </div>

    <div style={{flex:1,overflow:'hidden',display:'flex'}}>
      {/* Device list */}
      <div style={{flex:1,overflowY:'auto',padding:16}}>
        {loading?<div style={{color:'rgba(255,255,255,.4)',padding:20}}>Loading fleet...</div>:
        <div style={{display:'grid',gap:12}}>
          {filtered.map(dev=>{
            const ptColor=POWERTRAIN_COLORS[dev.powertrain]||'#888';
            const online=dev.lastupdate&&new Date(dev.lastupdate)>new Date(Date.now()-300000);
            return(<div key={dev.id} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:20,display:'flex',alignItems:'center',gap:16,transition:'border-color .2s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(13,115,119,.4)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.07)'}>
              {/* Status dot */}
              <div style={{width:10,height:10,borderRadius:'50%',background:online?'#2ecc71':'#E84545',flexShrink:0}}/>
              {/* Info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:700}}>{dev.name}</span>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:`${ptColor}22`,color:ptColor,fontWeight:700,textTransform:'uppercase'}}>{dev.powertrain||'ice'}</span>
                  {dev.asset_type&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,.06)',color:'rgba(255,255,255,.5)'}}>{dev.asset_type}</span>}
                </div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.4)',display:'flex',gap:16,flexWrap:'wrap'}}>
                  <span>IMEI: {dev.uniqueid}</span>
                  {dev.plate_no&&<span>Plate: {dev.plate_no}</span>}
                  {dev.make&&<span>{dev.make} {dev.model||''} {dev.year||''}</span>}
                  {dev.terminal_model&&<span>Terminal: {dev.terminal_model}</span>}
                </div>
              </div>
              {/* Edit button */}
              <button onClick={()=>editing===dev.id?setEditing(null):startEdit(dev)}
                style={{padding:'7px 16px',background:editing===dev.id?'rgba(13,115,119,.2)':'rgba(255,255,255,.06)',border:`1px solid ${editing===dev.id?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:8,color:editing===dev.id?'#0D7377':'rgba(255,255,255,.6)',fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                {editing===dev.id?'Cancel':'Edit'}
              </button>
            </div>);
          })}
        </div>}
      </div>

      {/* Edit panel */}
      {editing&&(<div style={{width:320,flexShrink:0,borderLeft:'1px solid rgba(255,255,255,.07)',padding:20,overflowY:'auto',background:'rgba(13,27,42,.6)'}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:20,color:'#0D7377'}}>✏️ Edit Asset</div>
        {inp('Asset Code','assetCode')}
        {inp('Asset Type','assetType','text',TYPES)}
        {inp('Powertrain','powertrain','text',['ice','ev','hybrid'])}
        {inp('Make','make')}
        {inp('Model','model')}
        {inp('Year','year','number')}
        {inp('Plate Number','plateNo')}
        {form.powertrain==='ice'&&inp('Fuel Type','fuelType','text',['diesel','petrol','cng','lpg'])}
        {form.powertrain==='ice'&&inp('Tank Capacity (L)','tankCapacityL','number')}
        {(form.powertrain==='ev'||form.powertrain==='hybrid')&&inp('EV Pack kWh','evPackKwh','number')}
        {inp('Terminal Model','terminalModel','text',['FMB140','FMB920','FMB003','FMC003','TFT100','Other'])}
        <button onClick={()=>saveEdit(editing)} disabled={saving}
          style={{width:'100%',padding:'11px',background:saved?'#2ecc71':saving?'#0a5f63':'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',transition:'background .3s'}}>
          {saved?'✓ Saved!':saving?'Saving...':'Save Changes'}
        </button>
      </div>)}
    </div>
  </div>);
}