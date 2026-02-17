require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const api = require("./routes");
const { ensureInitialOwner } = require("./owner_bootstrap");

const app = express();

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);

app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(rateLimit({ windowMs: 60_000, limit: 500 }));
app.use(express.json({ limit: "4mb" }));

// API
app.use("/api", api);
// Always return JSON for unknown API routes (prevents "Bad JSON" in the UI)
app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// Static UI
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (_req, res) => res.redirect("/login.html"));

ensureInitialOwner().catch((e) => {
  console.warn("[panel] owner bootstrap warning:", e?.message || e);
});

app.listen(PORT, HOST, () => {
  console.log(`[panel] listening on http://${HOST}:${PORT}`);
});
