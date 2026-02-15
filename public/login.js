document.getElementById("btn").onclick = async () => {
  const username = document.getElementById("u").value.trim();
  const password = document.getElementById("p").value.trim();
  const msg = document.getElementById("msg");

  const res = await fetch("/api/login", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ username, password })
  });
  const j = await res.json();
  if (!j.ok) { msg.textContent = j.error; return; }

  localStorage.setItem("token", j.token);
  localStorage.setItem("role", j.role);
  location.href = "/";
};
