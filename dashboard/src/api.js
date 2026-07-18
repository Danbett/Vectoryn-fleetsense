const BASE='/api/v1';
export function getToken(){return sessionStorage.getItem('fs_token')||'';}
export function setToken(t){if(t)sessionStorage.setItem('fs_token',t);else sessionStorage.removeItem('fs_token');}
export function getSession(){try{const s=sessionStorage.getItem('fs_session');return s?JSON.parse(s):null;}catch{return null;}}
export function setSession(s){if(s)sessionStorage.setItem('fs_session',JSON.stringify(s));else sessionStorage.removeItem('fs_session');}
export async function apiFetch(path,opts={}){
  const token=getToken();
  const res=await fetch(`${BASE}${path}`,{...opts,headers:{'Content-Type':'application/json',...(token?{'X-Session-Token':token}:{}),...(opts.headers||{})}});
  if(res.status===401){setToken(null);setSession(null);window.location.reload();return null;}
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function login(email,password){
  const res=await fetch(`${BASE}/users-roles/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data=await res.json();
  if(data.token){setToken(data.token);setSession(data);}
  return data;
}
export function logout(){apiFetch('/users-roles/logout',{method:'POST'}).catch(()=>{});setToken(null);setSession(null);}
