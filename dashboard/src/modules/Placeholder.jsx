const META={
  'ops.trips':{icon:'🛣',title:'Trips & History',desc:'Full trip replay with animated playback, driver event overlay, stop detection, and export.'},
  'ops.geo':{icon:'📍',title:'Geofences & POI',desc:'Draw zones, build routes, set speed limits, track dwell times.'},
  'drivers':{icon:'👤',title:'Driver Management',desc:'Driver registry, iButton/RFID assignment, behaviour scoring, trip logbook.'},
  'fleet':{icon:'🚗',title:'Fleet Registry',desc:'Full asset lifecycle, sensor calibration, AVL template assignment, bulk import.'},
  'alerts':{icon:'🔔',title:'Alerts & Notifications',desc:'Rule builder for all 286 AVL parameters, custom thresholds, email/SSE delivery.'},
  'fuel':{icon:'⛽',title:'Fuel & Energy',desc:'Multi-witness fill/drain detection, consumption trends, tank probe calibration.'},
  'ev':{icon:'🔋',title:'EV Monitoring',desc:'SOC history, charge session log, range prediction, low-battery dispatch alerts.'},
  'maintenance':{icon:'🔧',title:'Maintenance',desc:'Predictive maintenance queue, work orders, service scheduling, cost tracking.'},
  'explorer':{icon:'📡',title:'Telemetry Explorer',desc:'Every raw AVL message decoded — filter by parameter, time range, or device.'},
  'reports':{icon:'📊',title:'Reports',desc:'Custom report builder with scheduling, PDF/Excel/CSV export.'},
  'commands':{icon:'⚙',title:'Remote Commands',desc:'Engine immobiliser, digital output control, config push with full audit trail.'},
  'admin.users':{icon:'🛡',title:'Users & Roles',desc:'Custom role builder, per-module permissions, asset-group scoping, API key management.'},
  'admin.tenants':{icon:'🏢',title:'Tenants',desc:'Tenant lifecycle, white-label config, billing plans, asset counts.'},
  'portal':{icon:'🌐',title:'Client Portal',desc:'White-label client portal with own login realm, scoped to tenant assets.'},
};
export default function Placeholder({moduleKey}){
  const m=META[moduleKey]||{icon:'🔧',title:moduleKey,desc:'Coming in next build phase.'};
  return(<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',textAlign:'center',padding:40}}>
    <div style={{fontSize:72,marginBottom:24}}>{m.icon}</div>
    <h2 style={{fontSize:26,fontWeight:800,marginBottom:12}}>{m.title}</h2>
    <p style={{fontSize:15,color:'rgba(255,255,255,.45)',maxWidth:480,lineHeight:1.7,marginBottom:32}}>{m.desc}</p>
    <div style={{display:'inline-flex',alignItems:'center',gap:10,background:'rgba(13,115,119,.12)',border:'1px solid rgba(13,115,119,.25)',borderRadius:24,padding:'10px 24px',fontSize:13,color:'#0D7377',fontWeight:600}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:'#0D7377',animation:'pulse 2s infinite'}}/>
      Building — Phase 2
    </div>
    <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
  </div>);
}