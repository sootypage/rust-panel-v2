// public/account.js
requireLogin();
document.getElementById("nav").innerHTML = navHTML("account");
attachLogout();

const me = document.getElementById("me");
const out = document.getElementById("out");

(async () => {
  const j = await api("/api/me");
  me.textContent = JSON.stringify(j, null, 2);
})();

document.getElementById("chg").onclick = async () => {
  const newPassword = document.getElementById("newPass").value.trim();
  const j = await api("/api/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword })
  });
  out.textContent = JSON.stringify(j, null, 2);
};
