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
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Auth guard — accepts Bearer token in header OR kt_token in cookie
const publicPaths = ["/api/health", "/api/login"];
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (publicPaths.includes(req.path)) return next();
  if (req.path === "/" || req.path.startsWith("/console.html")) return next();
  if (!hasPassword) return next();
  // Check Authorization header
  let token = (req.headers.authorization || "").replace("Bearer ", "");
  // Also check cookie
  if (!token) {
    const cookies = (req.headers.cookie || "").split(";").map(c => c.trim());
    const ktCookie = cookies.find(c => c.startsWith("kt_token="));
    if (ktCookie) token = ktCookie.split("=")[1];
  }
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

// ─── Auto-Extract Decisions from Conversation ───────────────────
app.post("/api/decisions/auto-extract", (req, res) => {
  try {
    const { text, project, source = "auto-extract" } = req.body || {};
    if (!text || text.length < 10) return res.json({ extracted: [], message: "Text too short" });
    
    // Extract candidate decisions from text
    const candidates = engine.extractDecisions(text);
    const imported = [];
    const g = engine.loadGraph();
    
    for (const c of candidates) {
      // Use provided project or auto-detected
      const p = project || c.project || "general";
      const node = engine.addNode(g, c.label, p, c.tags, c.context, {
        source: source,
        type: c.type,
        weight: c.confidence ? Math.min(c.confidence * 5, 5) : 3,
      });
      if (node) imported.push({ id: node.id, label: node.label, type: node.type, project: p, confidence: c.confidence });
    }
    
    res.json({
      candidates: candidates.length,
      imported: imported.length,
      decisions: imported,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/bug/diagnose", (req, res) => {
  try {
    const { description, query } = req.body || {};
    const bugEngine = require(path.join(__dirname, "..", "engine-bug.js"));
    const desc = description || query || "";
    const matches = bugEngine.searchBugPatterns(desc);
    const classification = bugEngine.classifyBug(desc);
    const topMatch = matches.length > 0 ? matches[0] : null;
    res.json({
      diagnosis: topMatch?.type || classification.type || "unknown",
      confidence: topMatch?.confidence || classification.confidence || 0,
      pattern: topMatch?.type || null,
      patternLabel: topMatch?.tags?.join(", ") || null,
      fixSuggestion: topMatch?.fixTemplate || null,
      hitsMatched: topMatch?.hitCount || 0,
      matchesDetected: matches.length,
      allPatterns: bugEngine.listBugPatterns().length
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", (req, res) => {
  // If password is set and user is not authenticated, show login page
  if (hasPassword) {
    let token = (req.headers.authorization || "").replace("Bearer ", "");
    // Also check cookie
    if (!token) {
      const cookies = (req.headers.cookie || "").split(";").map(c => c.trim());
      const ktCookie = cookies.find(c => c.startsWith("kt_token="));
      if (ktCookie) token = ktCookie.split("=")[1];
    }
    if (!token || !TOKENS.has(token) || TOKENS.get(token).expires <= Date.now()) {
      return res.type("html").send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KeepThinking — 登录</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;max-width:400px;width:90%;text-align:center}
h1{font-size:1.8rem;margin-bottom:8px;background:linear-gradient(135deg,#58a6ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{color:#8b949e;margin-bottom:24px;font-size:0.9rem}
input{width:100%;padding:12px 16px;border:1px solid #30363d;border-radius:8px;background:#0d1117;color:#e6edf3;font-size:1rem;outline:none;margin-bottom:16px}
input:focus{border-color:#58a6ff}
button{width:100%;padding:12px;background:#1f6feb;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:600}
button:hover{background:#388bfd}
.error{color:#f85149;margin-top:8px;font-size:0.85rem;display:none}
.footer{margin-top:20px;color:#8b949e;font-size:0.8rem}
</style>
</head>
<body>
<div class="box">
<h1>KeepThinking</h1>
<p class="sub">AI 的第二大脑</p>
<input type="password" id="pwd" placeholder="请输入访问密码" autofocus>
<button onclick="login()">登 录</button>
<p class="error" id="err"></p>
<p class="footer">v7.2.0 · 数据100%本地 · 零上传</p>
</div>
<script>
async function login() {
  const p=document.getElementById('pwd').value;
  const e=document.getElementById('err');
  try {
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});
    if(r.ok) {
      const d=await r.json();
      document.cookie='kt_token='+d.token+';path=/;max-age=86400';
      location.reload();
    } else { e.style.display='block';e.textContent='密码错误'; }
  } catch(_) { e.style.display='block';e.textContent='连接失败，请确认服务已启动'; }
}
document.getElementById('pwd').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
</script>
</body>
</html>`);
    }
  }
  const html = path.join(webDir, "console.html");
  if (fs.existsSync(html)) res.type("html").send(fs.readFileSync(html, "utf8"));
  else res.type("html").send("<h1>KeepThinking v7.2.0</h1>");
});

app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

// ─── Start ─────────────────────────────────────────────────────
app.listen(PORT, HOST, async () => {
  console.log("[keepthinking-server] v7.2.0 — http://" + HOST + ":" + PORT);
  console.log("[keepthinking-server] Data: " + engine.BASE);
  console.log("[keepthinking-server] Web: " + webDir);
  if (hasPassword) console.log("[keepthinking-server] Auth: password protected");
  engine.startEnvHealer();
  // Auto-discover existing memories on first run
  if (engine.getStats().nodes === 0) {
    try {
      const discover = require("../engine-discover.js");
      const report = await discover.runDiscovery(engine, process.env.HOME || "/root");
      console.log("[keepthinking-server] Auto-discovery: " + report.decisionsImported + " decisions, " + report.gitProjectsFound + " projects");
    } catch(e) {
      console.log("[keepthinking-server] Auto-discovery skipped: " + e.message);
    }
  }
  const stats = engine.getStats();
  console.log("[keepthinking-server] Graph: " + stats.nodes + " nodes, " + stats.edges + " edges");
});

process.on("SIGTERM", () => { engine.stopEnvHealer(); process.exit(0); });
process.on("SIGINT", () => { engine.stopEnvHealer(); process.exit(0); });
