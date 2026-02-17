const { EventEmitter } = require("events");

// In-memory install streams.
// Key: installId, Value: { emitter, createdAt, done }
const streams = new Map();

function createInstallStream(installId) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  const obj = { emitter, createdAt: Date.now(), done: false };
  streams.set(installId, obj);
  return obj;
}

function getInstallStream(installId) {
  return streams.get(installId);
}

function appendLine(installId, line) {
  const s = streams.get(installId);
  if (!s) return;
  s.emitter.emit("line", String(line));
}

function markDone(installId, ok, extra = {}) {
  const s = streams.get(installId);
  if (!s) return;
  s.done = true;
  s.emitter.emit("done", { ok: !!ok, ...extra });

  // Auto-clean after 10 minutes
  setTimeout(() => streams.delete(installId), 10 * 60 * 1000).unref?.();
}

// Best-effort cleanup of old streams
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of streams.entries()) {
    if (now - s.createdAt > 60 * 60 * 1000) streams.delete(id);
  }
}, 15 * 60 * 1000).unref?.();

module.exports = {
  createInstallStream,
  getInstallStream,
  appendLine,
  markDone,
};
