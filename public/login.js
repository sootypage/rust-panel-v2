// public/login.js
const out = document.getElementById("out");
document.getElementById("btn").onclick = async () => {
  out.textContent = "";
  const username = document.getElementById("u").value.trim();
  const password = document.getElementById("p").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ username, password })
  });
  const j = await res.json();
  if (!j.ok) {
    out.textContent = j.error || "Login failed";
    return;
  }
  localStorage.setItem("token", j.token);
  localStorage.setItem("role", j.role);
  location.href = "/";
};
