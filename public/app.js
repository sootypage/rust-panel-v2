
const API=(p)=>`/api${p}`;
const token=()=>localStorage.getItem("token");
const setToken=(t)=>localStorage.setItem("token",t);
const clearToken=()=>localStorage.removeItem("token");

async function api(path,opts={}){
  const headers={"Content-Type":"application/json",...(opts.headers||{})};
  if(token()) headers.Authorization="Bearer "+token();
  const r=await fetch(API(path),{...opts,headers});
  const j=await r.json().catch(()=>({ok:false,error:"Bad JSON"}));
  if(!r.ok||j.ok===false) throw new Error(j.error||("HTTP "+r.status));
  return j;
}
function qs(k){ return new URLSearchParams(location.search).get(k); }
function navActive(id){ document.querySelectorAll(".nav a").forEach(a=>a.classList.toggle("active", a.dataset.id===id)); }
async function requireMe(){
  try{
    const r=await api("/me");
    const me=document.querySelector("#me");
    if(me) me.textContent = `${r.user.username} (${r.user.role})`;
    return r.user;
  }catch(e){
    clearToken();
    location.href="/login.html";
  }
}
