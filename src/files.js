const fs = require("fs");
const path = require("path");

function safeJoin(baseDir, rel) {
  const p = path.resolve(baseDir, rel || ".");
  if (!p.startsWith(path.resolve(baseDir))) throw new Error("Invalid path");
  return p;
}

function listDir(baseDir, rel="") {
  const p = safeJoin(baseDir, rel);
  const items = fs.readdirSync(p, { withFileTypes: true }).map(d => ({ name: d.name, isDir: d.isDirectory() }));
  return { path: rel, items };
}

function readFile(baseDir, rel) {
  const p = safeJoin(baseDir, rel);
  return fs.readFileSync(p, "utf8");
}

function writeFile(baseDir, rel, content) {
  const p = safeJoin(baseDir, rel);
  fs.writeFileSync(p, content, "utf8");
}

module.exports = { listDir, readFile, writeFile };
