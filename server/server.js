// KeepThinking v7.2.0 — Independent HTTP Server
// Local server for Web Console and API endpoints.
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let express;
try { express = require("express"); }
catch (_) { console.error("[keepthinking-server] express not found"); process.exit(1); }

const app = express();
const PORT = parseInt(process.env.KEEPTHINKING_PORT || "3456", 10);
const HOST = process.env.KEEPTHINKING_HOST || "127.0.0.1";
const engine = require("../engine.js");

// ─── Password Auth ─────────────────────────────────────────────
const PASS_FILE = path.join(engine.BASE, ".ktpass");
const TOKENS = new Map();

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(hash));
}

const hasPassword = fs.existsSync(PASS_FILE);
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of TOKENS) { if (data.expires < now) TOKENS.delete(token); }
}, 300000);

// ─── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Auth guard
const publicPaths = ["/api/health", "/api/login"];
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (publicPaths.includes(req.path)) return next();
  if (req.path === "/" || req.path.startsWith("/console.html")) return next();
  if (!hasPassword) return next();
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (token && TOKENS.has(token) && TOKENS.get(token).expires > Date.now()) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });
  next();
});

// Login
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || !hasPassword) return res.status(400).json({ error: "No password set" });
  const stored = fs.readFileSync(PASS_FILE, "utf8").trim();
  if (!verifyPassword(password, stored)) return res.status(401).json({ error: "Invalid password" });
  const token = crypto.randomBytes(32).toString("hex");
  TOKENS.set(token, { expires: Date.now() + 86400000, created: Date.now() });
  res.json({ success: true, token });
});

// ─── Static Files ──────────────────────────────────────────────
const webDir = path.resolve(__dirname, "..", "web");
app.use(express.static(webDir));

// ─── API Endpoints ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  const stats = engine.getStats();
  res.json({ status: "ok", version: stats.version, uptime: process.uptime(), node: process.version, platform: process.platform, dataDir: stats.dataDir });
});

app.get("/api/context", (req, res) => {
  const project = req.query.project || "";
  const ctx = engine.buildCognitiveContext();
  if (project) {
    const g = engine.loadGraph();
    const projectNodes = (g.nodes || []).filter(n => (n.project || "").toLowerCase() === project.toLowerCase());
    return res.json({ context: ctx, project, projectNodes: projectNodes.length, timestamp: engine.nowISO() });
  }
  res.json({ context: ctx, timestamp: engine.nowISO() });
});

app.get("/api/search", (req, res) => {
  const q = req.query.q || "";
  if (!q) return res.json({ results: [], query: "" });
  const results = engine.searchMemory(q, Math.min(parseInt(req.query.max || "10"), 50));
  res.json({ results, query: q, count: results.length });
});

app.get("/api/search/semantic", async (req, res) => {
  try {
    const { q, max = "10" } = req.query;
    if (!q || q.length < 2) return res.json({ results: [], query: q || "", count: 0 });
    const results = await engine.semanticSearch(q, parseInt(max));
    res.json({ results, query: q, count: results.length, engine: "local-onnx" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/projects", (req, res) => {
  const projects = engine.listProjects();
  res.json({ projects, count: projects.length });
});

app.get("/api/graph", (req, res) => {
  const project = req.query.project || "";
  const maxNodes = parseInt(req.query.maxNodes || "50", 10);
  let g = engine.loadGraph();
  if (project) {
    const pf = project.toLowerCase();
    const filteredNodes = (g.nodes || []).filter(n => (n.project || "").toLowerCase().includes(pf));
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = (g.edges || []).filter(e => filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to));
    g = { nodes: filteredNodes, edges: filteredEdges, version: g.version };
  }
  if (maxNodes) g.nodes = (g.nodes || []).slice(0, maxNodes);
  res.json(g);
});

app.get("/api/stats", (req, res) => { res.json(engine.getStats()); });

app.post("/api/nodes", (req, res) => {
  try {
    const { label, project, tags, context, source, weight, type, metadata } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ error: "label is required" });
    const g = engine.loadGraph();
    const node = engine.addNode(g, label, project || "", tags || [], context || "", { source, weight, type, metadata });
    if (!node) return res.status(400).json({ error: "failed to add node" });
    res.status(201).json({ id: node.id, label: node.label, project: node.project, tags: node.tags, source: node.source, time: node.time });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/bug/diagnose", (req, res) => {
  try {
    const { description, query } = req.body || {};
    const result = engine.bugDiagnose(description || query || "");
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", (req, res) => {
  const html = path.join(webDir, "console.html");
  if (fs.existsSync(html)) res.type("html").send(fs.readFileSync(html, "utf8"));
  else res.type("html").send("<h1>KeepThinking v7.2.0</h1>");
});

app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

// ─── Start ─────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log("[keepthinking-server] v7.2.0 — http://" + HOST + ":" + PORT);
  console.log("[keepthinking-server] Data: " + engine.BASE);
  console.log("[keepthinking-server] Web: " + webDir);
  if (hasPassword) console.log("[keepthinking-server] Auth: password protected");
  engine.startEnvHealer();
  const stats = engine.getStats();
  console.log("[keepthinking-server] Graph: " + stats.nodes + " nodes, " + stats.edges + " edges");
});

process.on("SIGTERM", () => { engine.stopEnvHealer(); process.exit(0); });
process.on("SIGINT", () => { engine.stopEnvHealer(); process.exit(0); });
