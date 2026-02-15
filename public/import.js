(async function(){
  const token = localStorage.getItem("token");
  if (!token) location.href = "/login.html";

  const form = document.getElementById("form");
  const msg = document.getElementById("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Importing...";

    const data = Object.fromEntries(new FormData(form).entries());
    data.modded = !!data.modded;

    ["app_port","query_port","rcon_port","map_seed","map_size","max_players"].forEach(k => {
      if (data[k] === "" || data[k] == null) return;
      data[k] = Number(data[k]);
    });

    const res = await fetch("/api/servers/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(data)
    });

    const j = await res.json().catch(()=>({ok:false,error:"bad json"}));
    if (!j.ok) { msg.textContent = "Error: " + (j.error || res.statusText); return; }
    msg.textContent = "Imported! Redirecting...";
    setTimeout(()=> location.href = "/index.html", 800);
  });
})();
