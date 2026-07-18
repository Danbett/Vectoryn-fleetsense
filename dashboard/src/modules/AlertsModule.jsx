import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

const SEV_COLORS={warning:'#F59E0B',danger:'#E84545',critical:'#E84545',info:'#0D7377'};
const OPERATORS=[{v:'gt',l:'Greater than (>)'},{v:'lt',l:'Less than (<)'},{v:'gte',l:'≥'},{v:'lte',l:'≤'},{v:'eq',l:'Equal to (=)'}];

export default function AlertsModule(){
  const [tab,setTab]=useState('history'); // history | rules | new
  const [history,setHistory]=useState([]);
  const [rules,setRules]=useState([]);
  const [avlParams,setAvlParams]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({name:'',paramKey:'speed',operator:'gt',threshold:'',severity:'warning',cooldownMin:5,notifyEmail:true,notifySse:true});
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    Promise.all([
      apiFetch('/alerts/history?size=50').catch(()=>({data:[]})),
      apiFetch('/alerts/rules').catch(()=>({data:[]})),
      apiFetch('/fleet/avl-params').catch(()=>({data:[]}))
    ]).then(([h,r,a])=>{
      setHistory(h?.data||[]);
      setRules(r?.data||[]);
      setAvlParams(a?.data||[]);
      setLoading(false);
    });
  },[]);

  async function ack(id){
    await apiFetch(`/alerts/history/${id}/acknowledge`,{method:'POST'}).catch(()=>{});
    setHistory(h=>h.map(a=>a.id===id?{...a,acknowledged:true}:a));
  }

  async function ackAll(){
    const unacked=history.filter(a=>!a.acknowledged);
    await Promise.all(unacked.map(a=>apiFetch(`/alerts/history/${a.id}/acknowledge`,{method:'POST'}).catch(()=>{})));
    setHistory(h=>h.map(a=>({...a,acknowledged:true})));
  }

  const TabBtn=({id,label})=>(<button onClick={()=>setTab(id)} style={{padding:'8px 20px',background:tab===id?'#0D7377':'transparent',border:`1px solid ${tab===id?'#0D7377':'rgba(255,255,255,.1)'}`,borderRadius:8,color:tab===id?'#fff':'rgba(255,255,255,.5)',fontSize:13,fontWeight:tab===id?700:400,cursor:'pointer'}}>{label}</button>);

  return(<div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    <div style={{padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div>
          <div style={{fontSize:11,color:'#0D7377',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Intelligence</div>
          <h2 style={{fontSize:20,fontWeight:800}}>Alerts</h2>
        </div>
        <div style={{flex:1}}/>
        <TabBtn id="history" label={`History (${history.filter(a=>!a.acknowledged).length} unread)`}/>
        <TabBtn id="rules" label={`Rules (${rules.length})`}/>
        <TabBtn id="new" label="+ New Rule"/>
      </div>
    </div>

    <div style={{flex:1,overflowY:'auto',padding:24}}>
      {loading?<div style={{color:'rgba(255,255,255,.4)'}}>Loading...</div>:

      tab==='history'?(<div>
        {history.filter(a=>!a.acknowledged).length>0&&(
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <button onClick={ackAll} style={{padding:'7px 16px',background:'rgba(13,115,119,.15)',border:'1px solid rgba(13,115,119,.3)',borderRadius:8,color:'#0D7377',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              Acknowledge All ({history.filter(a=>!a.acknowledged).length})
            </button>
          </div>
        )}
        {history.length===0?(<div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontSize:15,fontWeight:600}}>No alerts</div>
          <div style={{fontSize:13,marginTop:4}}>Create alert rules to start monitoring</div>
        </div>):
        history.map((a,i)=>{
          const c=SEV_COLORS[a.severity]||'#0D7377';
          return(<div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',background:'rgba(255,255,255,.03)',border:`1px solid ${a.acknowledged?'rgba(255,255,255,.05)':c+'44'}`,borderRadius:10,marginBottom:8,opacity:a.acknowledged?.6:1,transition:'opacity .2s'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:a.acknowledged?'rgba(255,255,255,.2)':c,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:a.acknowledged?'rgba(255,255,255,.5)':'#fff'}}>{a.name}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,.35)',marginTop:2}}>
                {new Date(a.triggered_at).toLocaleString()} · {a.param_key||'parameter'}
              </div>
            </div>
            <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,background:`${c}22`,color:c,fontWeight:700,textTransform:'uppercase'}}>{a.severity}</span>
            {!a.acknowledged&&<button onClick={()=>ack(a.id)} style={{padding:'5px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'rgba(255,255,255,.6)',fontSize:11,cursor:'pointer'}}>Ack</button>}
          </div>);
        })}
      </div>):

      tab==='rules'?(<div>
        {rules.length===0?(<div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>📋</div>
          <div>No alert rules yet</div>
          <button onClick={()=>setTab('new')} style={{marginTop:16,padding:'9px 24px',background:'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Create First Rule</button>
        </div>):
        rules.map((r,i)=>(<div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:10,marginBottom:8}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:r.active?'#2ecc71':'#E84545'}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600}}>{r.name}</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:2}}>{r.param_key} {r.operator} {r.threshold}</div>
          </div>
          <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,background:`${SEV_COLORS[r.severity]||'#888'}22`,color:SEV_COLORS[r.severity]||'#888',fontWeight:700,textTransform:'uppercase'}}>{r.severity}</span>
        </div>))}
      </div>):

      (<div style={{maxWidth:480}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Create Alert Rule</div>
        {[{label:'Rule Name',key:'name',type:'text'},{label:'Threshold Value',key:'threshold',type:'number'},{label:'Cooldown (minutes)',key:'cooldownMin',type:'number'}].map(({label,key,type})=>(
          <div key={key} style={{marginBottom:14}}>
            <label style={{fontSize:11,color:'rgba(255,255,255,.5)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>
            <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
              style={{width:'100%',padding:'9px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,color:'#fff',fontSize:13,outline:'none'}}/>
          </div>
        ))}
        {[{label:'AVL Parameter',key:'paramKey',opts:['speed','ignition','battery',...avlParams.slice(0,30).map(p=>p.name||p.avl_id)]},
          {label:'Operator',key:'operator',opts:OPERATORS.map(o=>o.v)},
          {label:'Severity',key:'severity',opts:['info','warning','danger','critical']}
        ].map(({label,key,opts})=>(
          <div key={key} style={{marginBottom:14}}>
            <label style={{fontSize:11,color:'rgba(255,255,255,.5)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>
            <select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
              style={{width:'100%',padding:'9px 12px',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,color:'#fff',fontSize:13}}>
              {opts.map(o=>(<option key={o} value={o} style={{background:'#1A3A5C'}}>{o}</option>))}
            </select>
          </div>
        ))}
        <div style={{display:'flex',gap:16,marginBottom:20}}>
          {[{key:'notifyEmail',label:'Email Notification'},{key:'notifySse',label:'In-App Notification'}].map(({key,label})=>(
            <label key={key} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'rgba(255,255,255,.7)'}}>
              <input type="checkbox" checked={!!form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.checked}))} style={{accentColor:'#0D7377'}}/>
              {label}
            </label>
          ))}
        </div>
        <button onClick={async()=>{setSaving(true);await apiFetch('/alerts/rules',{method:'POST',body:JSON.stringify(form)}).catch(()=>{});setSaving(false);setTab('rules');}} disabled={saving||!form.name||!form.threshold}
          style={{width:'100%',padding:'11px',background:'#0D7377',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',opacity:saving||!form.name||!form.threshold?.5:1}}>
          {saving?'Creating...':'Create Alert Rule'}
        </button>
      </div>)}
    </div>
  </div>);
}