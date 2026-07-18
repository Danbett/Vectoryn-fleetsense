const MODULES=[
  {key:'dashboard',label:'Dashboard',icon:'▦',group:null},
  {key:'ops.map',label:'Live Map',icon:'🗺',group:'Operations'},
  {key:'ops.trips',label:'Trips',icon:'🛣',group:'Operations'},
  {key:'ops.geo',label:'Geofences & POI',icon:'📍',group:'Operations'},
  {key:'drivers',label:'Drivers',icon:'👤',group:'Fleet'},
  {key:'fleet',label:'Fleet Registry',icon:'🚗',group:'Fleet'},
  {key:'alerts',label:'Alerts',icon:'🔔',group:'Intelligence'},
  {key:'fuel',label:'Fuel & Energy',icon:'⚡',group:'Intelligence'},
  {key:'ev',label:'EV Monitoring',icon:'🔋',group:'Intelligence'},
  {key:'maintenance',label:'Maintenance',icon:'🔧',group:'Intelligence'},
  {key:'explorer',label:'Telemetry Explorer',icon:'📡',group:'Data'},
  {key:'reports',label:'Reports',icon:'📊',group:'Data'},
  {key:'commands',label:'Commands',icon:'⚙',group:'Data'},
  {key:'admin.users',label:'Users & Roles',icon:'🛡',group:'Admin'},
  {key:'admin.tenants',label:'Tenants',icon:'🏢',group:'Admin'},
];
export default function Sidebar({active,onNavigate,session,onLogout,collapsed,onToggle}){
  let lastGroup=null;
  return(<div style={{width:collapsed?56:220,minWidth:collapsed?56:220,background:'#0D1B2A',borderRight:'1px solid rgba(255,255,255,.07)',display:'flex',flexDirection:'column',height:'100vh',transition:'width .2s,min-width .2s',overflow:'hidden',flexShrink:0}}>
    <div style={{padding:collapsed?'16px 10px':'16px',borderBottom:'1px solid rgba(255,255,255,.07)',display:'flex',alignItems:'center',gap:10,minHeight:60}}>
      <div style={{width:32,height:32,background:'#0D7377',borderRadius:7,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:13,color:'#fff'}}>VF</div>
      {!collapsed&&<div><div style={{fontWeight:800,fontSize:13,whiteSpace:'nowrap'}}>Vectoryn <span style={{color:'#0D7377'}}>FleetSense</span></div><div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:1}}>Enterprise Telematics</div></div>}
      <button onClick={onToggle} style={{marginLeft:'auto',background:'none',border:'none',color:'rgba(255,255,255,.3)',cursor:'pointer',fontSize:16,padding:4,flexShrink:0}}>{collapsed?'›':'‹'}</button>
    </div>
    <div style={{flex:1,overflowY:'auto',overflowX:'hidden',padding:'8px 0'}}>
      {MODULES.map(m=>{
        const showGroup=!collapsed&&m.group&&m.group!==lastGroup;
        if(m.group)lastGroup=m.group;
        const isActive=active===m.key;
        return(<div key={m.key}>
          {showGroup&&<div style={{padding:'10px 16px 4px',fontSize:10,fontWeight:700,color:'rgba(255,255,255,.25)',textTransform:'uppercase',letterSpacing:1}}>{m.group}</div>}
          <button onClick={()=>onNavigate(m.key)} title={collapsed?m.label:''} style={{width:'100%',display:'flex',alignItems:'center',gap:collapsed?0:10,padding:collapsed?'10px 0':'9px 16px',justifyContent:collapsed?'center':'flex-start',background:isActive?'rgba(13,115,119,.2)':'transparent',borderLeft:isActive?'3px solid #0D7377':'3px solid transparent',border:'none',cursor:'pointer',color:isActive?'#fff':'rgba(255,255,255,.55)',fontSize:13,fontWeight:isActive?600:400,whiteSpace:'nowrap'}}>
            <span style={{fontSize:15,width:20,textAlign:'center',flexShrink:0}}>{m.icon}</span>
            {!collapsed&&<span>{m.label}</span>}
          </button>
        </div>);
      })}
    </div>
    <div style={{borderTop:'1px solid rgba(255,255,255,.07)',padding:collapsed?'12px 8px':'12px 16px'}}>
      {!collapsed&&session&&<div style={{marginBottom:8}}><div style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,.8)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.name}</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.email}</div></div>}
      <button onClick={onLogout} style={{width:'100%',background:'rgba(232,69,69,.1)',border:'1px solid rgba(232,69,69,.2)',borderRadius:6,color:'#E84545',fontSize:12,fontWeight:600,padding:'7px 0',cursor:'pointer'}}>{collapsed?'↩':'Sign Out'}</button>
    </div>
  </div>);
}