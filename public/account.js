\
requireLogin();
document.getElementById("nav").innerHTML = navHTML("account");
attachLogout();

const me = document.getElementById("me");
const out = document.getElementById("out");
const avatar = document.getElementById("avatar");

async function refresh() {
  const j = await api("/api/me");
  me.textContent = JSON.stringify(j, null, 2);
  if (j.ok && j.user && j.user.avatar_path) avatar.src = j.user.avatar_path;
  else avatar.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMTExYTIyIi8+PHRleHQgeD0iMzIiIHk9IjM4IiBmb250LXNpemU9IjE0IiBmaWxsPSIjOGFiNGZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5BPC90ZXh0Pjwvc3ZnPg==";
}
refresh();

document.getElementById("chgPass").onclick = async () => {
  const newPassword = document.getElementById("newPass").value.trim();
  const j = await api("/api/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword })
  });
  out.textContent = JSON.stringify(j, null, 2);
};

document.getElementById("chgUser").onclick = async () => {
  const newUsername = document.getElementById("newUser").value.trim();
  const j = await api("/api/me/username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newUsername })
  });
  out.textContent = JSON.stringify(j, null, 2);
  if (j.ok) out.textContent += "\\n\\nUsername changed. Please log out and log back in.";
};

document.getElementById("upAvatar").onclick = async () => {
  const f = document.getElementById("avatarFile").files[0];
  if (!f) return (out.textContent = "Choose an image file first.");
  const fd = new FormData();
  fd.append("file", f);

  const token = localStorage.getItem("token");
  const res = await fetch("/api/me/avatar", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  const j = await res.json();
  out.textContent = JSON.stringify(j, null, 2);
  refresh();
};
