async function api(url, opts={}){
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type":"application/json", ...(opts.headers||{}) }
  });
  const j = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

window.addEventListener("DOMContentLoaded", ()=>{
  const u = document.getElementById("u");
  const p = document.getElementById("p");
  const out = document.getElementById("out");
  const form = document.getElementById("loginForm");

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    out.textContent = "Logging in…";
    try{
      const r = await api("/api/auth/login", {
        method:"POST",
        body: JSON.stringify({ username: u.value.trim(), password: p.value })
      });
      localStorage.setItem("token", r.token);
      location.href = "/dashboard.html";
    }catch(err){
      out.textContent = "❌ " + (err.message || err);
      console.error(err);
    }
  });
});
