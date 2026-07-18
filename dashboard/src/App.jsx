import { useState } from 'react';
import { getSession, setToken, setSession } from './api.js';
import Login from './Login.jsx';
import Sidebar from './Sidebar.jsx';
import Dashboard from './modules/Dashboard.jsx';
import LiveMap from './modules/LiveMap.jsx';
import Placeholder from './modules/Placeholder.jsx';

function renderModule(key, onNavigate) {
  if(key==='dashboard') return <Dashboard onNavigate={onNavigate}/>;
  if(key==='ops.map')   return <LiveMap/>;
  return <Placeholder moduleKey={key}/>;
}

export default function App() {
  const [session, setSessionState] = useState(()=>getSession());
  const [activeModule, setActiveModule] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);

  function handleLogin(data){setSession(data);setSessionState(data);setActiveModule('dashboard');}
  function handleLogout(){setToken(null);setSession(null);setSessionState(null);}

  if(!session) return <Login onLogin={handleLogin}/>;
  const isMap=activeModule==='ops.map';

  return(<div style={{display:'flex',height:'100vh',width:'100vw',background:'#0D1B2A',overflow:'hidden'}}>
    <Sidebar active={activeModule} onNavigate={setActiveModule} session={session} onLogout={handleLogout} collapsed={collapsed} onToggle={()=>setCollapsed(c=>!c)}/>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {!isMap&&(<div style={{height:52,background:'rgba(13,27,42,.95)',borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',padding:'0 24px',gap:16,flexShrink:0}}>
        <div style={{flex:1,fontSize:13,color:'rgba(255,255,255,.5)'}}>Vectoryn <span style={{color:'#0D7377',fontWeight:700}}>FleetSense</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:7,height:7,borderRadius:'50%',background:'#2ecc71',animation:'pulse 2s infinite'}}/><span style={{fontSize:12,color:'rgba(255,255,255,.45)'}}>Live · EAT</span></div>
        <div style={{fontSize:11,padding:'4px 12px',background:'rgba(13,115,119,.12)',border:'1px solid rgba(13,115,119,.25)',borderRadius:20,color:'#0D7377',fontWeight:600}}>{session.isSuperAdmin?'⭐ Super Admin':'Admin'}</div>
      </div>)}
      <div style={{flex:1,overflow:isMap?'hidden':'auto',width:'100%',scrollbarGutter:'stable'}}>{renderModule(activeModule,setActiveModule)}</div>
    </div>
    <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
  </div>);
}
