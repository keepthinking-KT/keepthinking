// KeepThinking v7.1.0 — Independent HTTP Server
// Private local server for the Web Console and API endpoints.
// Listens only on localhost (127.1.0.1) — never exposed to the network.
"use strict";

const path = require("path");
const fs = require("fs");

// Try to load Express, fall back to built-in http if not available
let express;
try {
  express = require("express");
} catch (_) {
  // Will be handled by install.sh which runs npm install first
  console.error("[keepthinking-server] express not found — run 'npm install express' first");
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.KEEPTHINKING_PORT || "3456", 10);
const HOST = process.env.KEEPTHINKING_HOST || "127.1.0.1";

// Import the engine
const engine = require("../engine.js");

// ─── Middleware ────────────────────────────────────────────────
app.use(express.json());

// ─── CORS (local only, safe) ──────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ─── Static File Serving ──────────────────────────────────────
const webDir = path.resolve(__dirname, "..", "web");
app.use(express.static(webDir));

// ─── API: Health Check ────────────────────────────────────────
app.get("/api/health", (req, res) => {
  const stats = engine.getStats();
  res.json({
    status: "ok",
    version: stats.version,
    uptime: process.uptime(),
    node: process.version,
    platform: process.platform,
    dataDir: stats.dataDir,
  });
});

// ─── API: Cognitive Context ───────────────────────────────────
app.get("/api/context", (req, res) => {
  const project = req.query.project || "";
  const ctx = engine.buildCognitiveContext();
  
  // If project filter, add project-specific info
  if (project) {
    const g = engine.loadGraph();
    const projectNodes = (g.nodes || []).filter(n => (n.project || "").toLowerCase() === project.toLowerCase());
    res.json({
      context: ctx,
      project: project,
      projectNodes: projectNodes.length,
      timestamp: engine.nowISO(),
    });
    return;
  }
  
  res.json({
    context: ctx,
    timestamp: engine.nowISO(),
  });
});

// ─── API: Search Memory ───────────────────────────────────────
app.get("/api/search", (req, res) => {
  const q = req.query.q || "";
  const max = parseInt(req.query.max || "10", 10);
  if (!q) {
    res.json({ results: [], query: "" });
    return;
  }
  const results = engine.searchMemory(q, Math.min(max, 50));
  res.json({ results, query: q, count: results.length });
});

// Semantic Search (v7.1.0)
app.get("/api/search/semantic", async (req, res) => {
  try {
    const { q, max = "10" } = req.query;
    if (!q || q.length < 2) return res.json({ results: [], query: q || "", count: 0 });
    const results = await engine.semanticSearch(q, parseInt(max));
    res.json({ results, query: q, count: results.length, engine: "local-wasm" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ─── API: List Projects ───────────────────────────────────────
app.get("/api/projects", (req, res) => {
  const projects = engine.listProjects();
  res.json({ projects, count: projects.length });
});

// ─── API: Cognitive Graph ─────────────────────────────────────
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
  if (maxNodes) {
    g.nodes = (g.nodes || []).slice(0, maxNodes);
  }
  
  res.json(g);
});

// ─── API: Stats (for dashboard) ───────────────────────────────
app.get("/api/stats", (req, res) => {
  const stats = engine.getStats();
  res.json(stats);
});

// ─── Root: Serve console.html ─────────────────────────────────
// ─── API: Add Node (POST /api/nodes) ──────────────────────────
app.post("/api/nodes", (req, res) => {
  try {
    const { label, project, tags, context, source, weight, type, metadata } = req.body || {};
    if (!label || !label.trim()) {
      return res.status(400).json({ error: "label is required" });
    }
    const g = engine.loadGraph();
    const node = engine.addNode(g, label, project || "", tags || [], context || "", { source, weight, type, metadata });
    if (!node) {
      return res.status(400).json({ error: "failed to add node" });
    }
    res.status(201).json({ id: node.id, label: node.label, project: node.project, tags: node.tags, source: node.source, time: node.time });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  const consolePath = path.join(webDir, "console.html");
  if (fs.existsSync(consolePath)) {
    res.type("html").send(fs.readFileSync(consolePath, "utf8"));
  } else {
    res.type("html").send("<!DOCTYPE html><html><head><title>KeepThinking v7.0</title></head><body><h1>KeepThinking Cognitive Engine v7.1.0</h1><p>Data dir: " + engine.BASE + "</p></body></html>");
  }
});

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

// ─── Start Server ─────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log("[keepthinking-server] v7.1.0 — http://" + HOST + ":" + PORT);
  console.log("[keepthinking-server] Data: " + engine.BASE);
  console.log("[keepthinking-server] Web: " + webDir);
  
  // Start env healer
  engine.startEnvHealer();
  
  // Log stats
  const stats = engine.getStats();
  console.log("[keepthinking-server] Graph: " + stats.nodes + " nodes, " + stats.edges + " edges, " + stats.experiences + " exp, " + stats.decisions + " dec");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[keepthinking-server] Shutting down...");
  engine.stopEnvHealer();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("[keepthinking-server] Shutting down...");
  engine.stopEnvHealer();
  process.exit(0);
});
