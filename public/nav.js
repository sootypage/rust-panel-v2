function navHTML(active) {
  const items = [
    ["Dashboard", "/", "dashboard"],
    ["Create Server", "/create.html", "create"],
    ["Files", "/files.html", "files"],
    ["Settings", "/settings.html", "settings"],
    ["Account", "/account.html", "account"],
  ];
  return `
  <header>
    <div class="container row" style="justify-content:space-between;align-items:center;">
      <div style="font-weight:bold;">Rust Panel</div>
      <div class="row" style="justify-content:flex-end;">
        ${items.map(([label, href, key]) =>
          `<a class="btn" href="${href}" style="${active===key?'border-color:#8ab4ff':''}">${label}</a>`
        ).join("")}
        <button class="btn" id="logoutBtn">Logout</button>
      </div>
    </div>
  </header>`;
}

function requireLogin() {
  const token = localStorage.getItem("token");
  if (!token) location.href = "/login.html";
  return token;
}

function attachLogout() {
  const b = document.getElementById("logoutBtn");
  if (!b) return;
  b.onclick = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    location.href = "/login.html";
  };
}

async function api(path, opts={}) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers||{}), Authorization: `Bearer ${token}` } });
  return res.json();
}
