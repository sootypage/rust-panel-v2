requireLogin();
document.getElementById("nav").innerHTML = navHTML("settings");
attachLogout();

const whOut = document.getElementById("whOut");

document.getElementById("saveWh").onclick = async () => {
  const slug = document.getElementById("whSlug").value.trim();
  const webhookUrl = document.getElementById("whUrl").value.trim();
  const j = await api("/api/webhooks/discord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, webhookUrl })
  });
  whOut.textContent = JSON.stringify(j, null, 2);
};
