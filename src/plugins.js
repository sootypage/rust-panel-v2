// src/plugins.js
const fs = require("fs");
const path = require("path");

function ensureDirs(baseDir) {
  fs.mkdirSync(path.join(baseDir, "oxide", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "oxide", "plugins", "disabled"), { recursive: true });
}

function listPlugins(baseDir) {
  const dir = path.join(baseDir, "oxide", "plugins");
  const disabled = path.join(dir, "disabled");
  ensureDirs(baseDir);

  const enabledFiles = fs.readdirSync(dir).filter(f => f.endsWith(".cs"));
  const disabledFiles = fs.readdirSync(disabled).filter(f => f.endsWith(".cs"));
  return { enabled: enabledFiles, disabled: disabledFiles };
}

function movePlugin(baseDir, filename, enable) {
  const dir = path.join(baseDir, "oxide", "plugins");
  const disabled = path.join(dir, "disabled");
  ensureDirs(baseDir);

  const from = enable ? path.join(disabled, filename) : path.join(dir, filename);
  const to = enable ? path.join(dir, filename) : path.join(disabled, filename);
  if (!fs.existsSync(from)) throw new Error("Plugin not found");
  fs.renameSync(from, to);
  return true;
}

module.exports = { ensureDirs, listPlugins, movePlugin };
