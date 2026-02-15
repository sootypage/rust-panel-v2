// public/settings.js
requireLogin();
document.getElementById("nav").innerHTML = navHTML("settings");
attachLogout();

const out = document.getElementById("out");

document.getElementById("save").onclick = async () => {
  const key = document.getElementById("key").value.trim();
  const value = document.getElementById("val").value.trim();

  const j = await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value })
  });

  out.textContent = JSON.stringify(j, null, 2);
};
