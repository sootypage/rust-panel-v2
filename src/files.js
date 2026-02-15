const fs = require("fs");
const path = require("path");
const { getServerBySlug } = require("./servers");

function safeJoin(base, rel) {
  const baseResolved = path.resolve(base);
  const p = path.resolve(base, rel || ".");
  if (!p.startsWith(baseResolved + path.sep) && p !== baseResolved) {
    throw new Error("Invalid path");
  }
  return p;
}

function listDir(slug, relPath) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  const full = safeJoin(s.base_dir, relPath);

  const items = fs.readdirSync(full, { withFileTypes: true }).map(d => ({
    name: d.name,
    type: d.isDirectory() ? "dir" : "file"
  }));
  return { base: s.base_dir, path: relPath || ".", items };
}

function readFile(slug, relPath) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  const full = safeJoin(s.base_dir, relPath);
  const stat = fs.statSync(full);
  if (stat.size > 2 * 1024 * 1024) throw new Error("File too large (2MB limit)");
  return fs.readFileSync(full, "utf8");
}

function writeFile(slug, relPath, content) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  const full = safeJoin(s.base_dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, String(content ?? ""), "utf8");
  return true;
}

module.exports = { listDir, readFile, writeFile };
