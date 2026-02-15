const fs = require("fs");
const path = require("path");
const { getServerBySlug } = require("./servers");

function ensureDirs(base) {
  const pluginsDir = path.join(base, "oxide", "plugins");
  const disabledDir = path.join(base, "oxide", "plugins_disabled");
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(disabledDir, { recursive: true });
  return { pluginsDir, disabledDir };
}

function listPlugins(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  const { pluginsDir, disabledDir } = ensureDirs(s.base_dir);

  const enabled = fs.readdirSync(pluginsDir).filter(f => f.endsWith(".cs"));
  const disabled = fs.readdirSync(disabledDir).filter(f => f.endsWith(".cs"));
  return { enabled, disabled };
}

function movePlugin(slug, name, enable) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  const { pluginsDir, disabledDir } = ensureDirs(s.base_dir);

  const safeName = path.basename(name);
  const from = enable ? path.join(disabledDir, safeName) : path.join(pluginsDir, safeName);
  const to   = enable ? path.join(pluginsDir, safeName)   : path.join(disabledDir, safeName);

  if (!fs.existsSync(from)) throw new Error("Plugin not found");
  fs.renameSync(from, to);
  return true;
}

module.exports = { listPlugins, movePlugin, ensureDirs };
