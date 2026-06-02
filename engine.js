// KeepThinking v7.2.0 — Independent Cognitive Engine Core
// "Let AI truly know your project — every /new, every time."
// Standalone module — no OpenClaw dependency.
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const bugEngine = require('./engine-bug');

const BASE = process.env.KEEPTHINKING_HOME || path.join(process.env.HOME || "/root", ".keepthinking");

// Allow loading dependencies from server/node_modules (for production install)
const serverNodeModules = path.join(BASE, "server", "node_modules");
if (fs.existsSync(serverNodeModules) && !module.paths.includes(serverNodeModules)) {
  module.paths.unshift(serverNodeModules);
}
// Also try root node_modules (for development)
const rootNodeModules = path.join(BASE, "node_modules");
if (fs.existsSync(rootNodeModules) && !module.paths.includes(rootNodeModules)) {
  module.paths.unshift(rootNodeModules);
}
const MEM_DIR = path.join(BASE, "memory");
const GRAPH_FILE = path.join(MEM_DIR, "graph.json");
const EXP_FILE = path.join(MEM_DIR, "experiences.json");
const DEC_FILE = path.join(MEM_DIR, "decisions.json");

// ─── Config ──────────────────────────────────────────────────
const CFG = {
  maxNodes: 200, maxEdges: 500, maxInject: 5, injectChars: 1500,
  archiveDays: 90, minTaskMs: 3000, decayWindow: 7, decayHalfLife: 30, minWeight: 0.1,
  diskMinGB: 7, memoryMinMB: 500, checkIntervalMs: 1800000,
};

// ─── Helpers ─────────────────────────────────────────────────
function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {} }
function gid() { return crypto.randomUUID().slice(0, 12); }
function nowISO() { return new Date().toISOString(); }
function ageDays(ts) { return (Date.now() - new Date(ts).getTime()) / 86400000; }
function decayWeight(ts) {
  const days = ageDays(ts);
  if (days <= CFG.decayWindow) return 1;
  return Math.max(CFG.minWeight, Math.pow(0.5, (days - CFG.decayWindow) / CFG.decayHalfLife));
}
ensureDir(MEM_DIR);

// ─── JSON I/O ────────────────────────────────────────────────
function loadJSON(f, def) {
  try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8")); }
  catch (e) { /* silent */ }
  return def;
}
function saveJSON(f, data) {
  try { fs.writeFileSync(f, JSON.stringify(data, null, 2)); } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
//  TAG EXTRACTION
// ══════════════════════════════════════════════════════════════
const TAGS = {
  deploy: ["deploy","部署","发布","上线"],
  flutter: ["flutter","dart","app","ios","android","widget"],
  "bug-fix": ["bug","fix","修复","报错","崩溃"],
  security: ["security","安全","漏洞","审计","加密"],
  ui: ["ui","界面","设计","样式","css","splash","启动"],
  api: ["api","接口","后端","http","rest"],
  build: ["build","构建","编译","打包"],
  ai: ["ai","模型","prompt","llm","deepseek","openai"],
  plugin: ["plugin","插件","hook","extension"],
  memory: ["memory","记忆","上下文","固化"],
  pricing: ["定价","价格","会员","额度","paywall","购买","付费"],
  appstore: ["apple","app store","testflight","审核","拒审","app review"],
  payment: ["支付","iap","内购","收款","zpay"],
  server: ["服务器","nginx","pm2","docker","ssh","node"],
  branding: ["品牌","logo","名字","命名","定位","slogan"],
  database: ["数据库","sqlite","postgres","mysql","mongodb","redis"],
  cdn: ["cdn","加速","缓存","静态"],
  migration: ["迁移","切换","换成","换到","改为","改成"],
  deprecate: ["砍掉","取消","废弃","下线","不要了","不做了"],
  optimize: ["优化","提升","改进","性能","提速"],
  legal: ["合规","隐私","条款","协议","备案","icp"],
  mcp: ["mcp","server","protocol","context","协议"],
};

function extractTags(task, result) {
  const text = ((task || "") + " " + (result || "")).toLowerCase();
  const hits = [];
  for (const [tag, keys] of Object.entries(TAGS)) {
    if (keys.some(k => text.includes(k))) hits.push(tag);
  }
  return hits.length ? hits : ["general"];
}

function guessProject(text) {
  const t = (text || "").toLowerCase();
  if (/\b(flutter|dart|app|ios|android|widget|apk|ipa|testflight)\b/.test(t)) return "app";
  if (/\b(plugin|hook|extension|openclaw|keepthinking)\b/.test(t)) return "plugin";
  if (/\b(server|nginx|pm2|docker|deploy|域名|ssh|node)\b/.test(t)) return "infra";
  if (/\b(定价|价格|会员|paywall|购买|付费|支付|收款|zpay)\b/.test(t)) return "pricing";
  if (/\b(mcp|protocol|server|claude|cursor|openagent)\b/.test(t)) return "mcp";
  return "general";
}

// ══════════════════════════════════════════════════════════════
//  COGNITIVE GRAPH ENGINE
// ══════════════════════════════════════════════════════════════

function loadGraph() {
  return loadJSON(GRAPH_FILE, { nodes: [], edges: [], version: "7.0" });
}

function saveGraph(g) {
  if (g.nodes.length > CFG.maxNodes) g.nodes = g.nodes.slice(-CFG.maxNodes);
  if (g.edges.length > CFG.maxEdges) g.edges = g.edges.slice(-CFG.maxEdges);
  saveJSON(GRAPH_FILE, g);
}

function addNode(g, label, project, tags, context, opts) {
  // R3+R5: Reject nodes with empty/whitespace-only labels
  if (!label || !label.trim()) {
    console.warn('[keepthinking] addNode: skipping node with empty label');
    return null;
  }
  const o = opts || {};
  const id = "n" + gid();
  const node = { 
    id, 
    type: o.type || "decision", 
    label, 
    project, 
    tags, 
    context: (context||"").slice(0,200), 
    time: nowISO(), 
    weight: typeof o.weight === "number" ? o.weight : 1.0,
    source: o.source || "api",
    metadata: o.metadata || {}
  };
  g.nodes = g.nodes || [];
  
  // Deduplicate: same label + same project = merge (unless source forces unique)
  if (o.source !== "git-commit") {
    const existing = g.nodes.find(n => n.label === label && n.project === project);
    if (existing) {
      existing.weight = (existing.weight || 1) + 0.2;
      existing.time = nowISO();
      if (o.source) existing.source = o.source;
      if (o.metadata) existing.metadata = { ...existing.metadata, ...o.metadata };
      return existing;
    }
  }
  
  g.nodes.push(node);
  
  // Auto-create edges: same tags or same project
  (g.edges = g.edges || []);
  for (const other of g.nodes) {
    if (other.id === id) continue;
    const sharedTags = (node.tags || []).filter(t => (other.tags || []).includes(t));
    if (sharedTags.length > 0 || other.project === project) {
      const edgeId = "e" + gid();
      const relation = other.project === project ? "same-project" : "shared-tags";
      const edgeWeight = sharedTags.length * 0.3 + (other.project === project ? 0.5 : 0);
      if (!g.edges.some(e => (e.from === id && e.to === other.id) || (e.from === other.id && e.to === id))) {
        g.edges.push({ id: edgeId, from: id, to: other.id, relation, weight: Math.min(edgeWeight, 1.0) });
      }
    }
  }
  
  // Also sync to decisions/experiences files
  if (node.type === "decision") {
    const decs = loadJSON(DEC_FILE, []);
    decs.push({ project: project, decision: label, tags: tags, context: context, time: nowISO(), source: o.source || "api" });
    saveJSON(DEC_FILE, decs.slice(-500));
  } else if (node.type === "experience" || node.type === "task" || node.type === "bug") {
    const exps = loadJSON(EXP_FILE, []);
    exps.push({ task: project, summary: label, type: node.type, tags: tags, context: context, time: nowISO(), source: o.source || "api" });
    saveJSON(EXP_FILE, exps.slice(-500));
  }

  saveGraph(g);
  return node;
}
function getSortedNodes(g, maxCount) {
  const nodes = g.nodes || [];

  const edges = g.edges || [];
  
  // Calculate relevance: weight * decay + sum of connected edge weights
  const scored = nodes.map(n => {
    const connections = edges.filter(e => e.from === n.id || e.to === n.id);
    const edgeScore = connections.reduce((sum, e) => sum + (e.weight || 0), 0);
    const relevance = (n.weight || 1) * decayWeight(n.time) + edgeScore;
    return { node: n, relevance };
  });
  
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, maxCount || CFG.maxInject).map(s => s.node);
}

// ══════════════════════════════════════════════════════════════
//  EXPERIENCES & DECISIONS (Legacy)
// ══════════════════════════════════════════════════════════════

function loadExps() {
  const all = loadJSON(EXP_FILE, []);
  const cutoff = Date.now() - CFG.archiveDays * 86400000;
  return all.filter(e => new Date(e.time).getTime() >= cutoff);
}

function loadDecs() {
  const all = loadJSON(DEC_FILE, []);
  const cutoff = Date.now() - CFG.archiveDays * 86400000;
  return all.filter(d => new Date(d.time).getTime() >= cutoff);
}

function saveExp(exp) {
  const all = loadJSON(EXP_FILE, []);
  all.push(exp);
  if (all.length > CFG.maxNodes * 2) all.splice(0, all.length - CFG.maxNodes * 2);
  saveJSON(EXP_FILE, all);
}

function saveDecision(dec) {
  const all = loadJSON(DEC_FILE, []);
  all.push(dec);
  if (all.length > 200) all.splice(0, all.length - 200);
  saveJSON(DEC_FILE, all);
}

// ══════════════════════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════════════════════


// Keyword search wrapper (REST API compatibility)
function search(query, maxResults) {
  maxResults = maxResults || 10;
  const g = loadGraph();
  const results = [];
  
  if (!query || query.length < 2) return { results, count: 0 };
  
  const qLower = query.toLowerCase();
  const nodes = (g.nodes || []).filter(Boolean).filter(n => n.label && n.label.trim());
  
  for (const node of nodes) {
    let score = 0;
    const label = (node.label || '').toLowerCase();
    const context = (node.context || '').toLowerCase();
    const tags = (node.tags || []).join(' ').toLowerCase();
    
    for (const term of qLower.split(/\s+/)) {
      if (label.includes(term)) score += 3;
      if (context.includes(term)) score += 1;
      if (tags.includes(term)) score += 2;
    }
    
    if (score > 0) {
      results.push({
        id: node.id,
        label: node.label,
        project: node.project || 'general',
        tags: node.tags || [],
        time: node.time || '',
        relevance: score,
      });
    }
  }
  
  results.sort((a, b) => b.relevance - a.relevance);
  return { results: results.slice(0, maxResults), count: Math.min(results.length, maxResults) };
}
function searchExps(prompt, max) {
  const exps = loadExps();
  if (!exps.length) return [];
  const text = (prompt || "").toLowerCase();
  const scored = exps.map(e => {
    let s = 0;
    const kw = (e.task + " " + e.summary + " " + (e.tags || []).join(" ")).toLowerCase();
    const words = text.split(/\s+/).filter(w => w.length > 2);
    for (const w of words) { if (kw.includes(w)) s += 1; }
    const etags = e.tags || [];
    for (const t of etags) { if (text.includes(t)) s += 2; }
    s *= decayWeight(e.time);
    return { exp: e, score: s };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, max).map(s => s.exp);
}

function searchMemory(query, maxResults) {
  const exps = loadExps();
  const decs = loadDecs();
  const g = loadGraph();
  const text = (query || "").toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 1);

  // Score graph nodes first (cognitive priority)
  const graphResults = (g.nodes || []).map(n => {
    let score = 0;
    const haystack = (n.label + " " + (n.project || "") + " " + (n.tags || []).join(" ")).toLowerCase();
    for (const w of words) { if (haystack.includes(w)) score += 3; }
    for (const t of (n.tags || [])) { if (text.includes(t)) score += 4; }
    score *= decayWeight(n.time) * (n.weight || 1);
    return { source: "cognitive-graph", type: "decision", time: n.time, project: n.project || "general", content: n.label, tags: n.tags || [], score };
  });

  // Score experiences
  const expResults = exps.map(e => {
    let score = 0;
    const haystack = (e.task + " " + e.summary + " " + (e.tags || []).join(" ")).toLowerCase();
    for (const w of words) { if (haystack.includes(w)) score += 2; }
    for (const t of (e.tags || [])) { if (text.includes(t)) score += 2; }
    score *= decayWeight(e.time);
    return { source: "experience", type: "task", time: e.time, project: e.task, content: e.summary, tags: e.tags || [], score };
  });

  const all = [...graphResults, ...expResults]
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  // Bug pattern diagnosis (v7.2.0)
  const bugMatches = bugEngine.classifyBug(query);
  
  const results = all.map(r => {
    const entry = {
      source: r.source,
      time: r.time,
      project: r.project,
      content: r.content,
      tags: r.tags,
      relevance: Math.round(r.score * 100) / 100,
    };
    
    // Attach bug pattern if content matches any known bug pattern
    if (r.content) {
      const contentBug = bugEngine.classifyBug(r.content);
      if (contentBug.length > 0) {
        entry.bugPattern = {
          type: contentBug[0].type,
          confidence: contentBug[0].confidence,
          fixTemplate: contentBug[0].fixTemplate,
        };
      }
    }
    
    return entry;
  });

  // Append bug diagnosis as a separate result block if bug patterns were found
  if (bugMatches.length > 0) {
    results.push({
      source: 'bug-diagnosis',
      time: new Date().toISOString(),
      project: 'bug-patterns',
      content: 'Bug模式诊断结果',
      tags: ['bug-diagnosis'],
      relevance: 1,
      bugPatterns: bugMatches.map(m => ({
        type: m.type,
        confidence: m.confidence,
        priority: m.priority,
        fixTemplate: m.fixTemplate,
      })),
      suggestion: bugEngine.suggestFix(query).suggestion,
    });
  }
  
  return results;
}

function fmtInjection(exps, maxChars) {
  if (!exps.length) return "";
  let out = "[Memory] Recent context:\n";
  let len = out.length;
  for (const e of exps) {
    const line = "📌 " + e.task + ": " + e.summary + " [" + (e.tags||["general"]).join(",") + "]\n";
    if (len + line.length > maxChars) break;
    out += line; len += line.length;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
//  COGNITIVE CONTEXT BUILDER (v7.0 — enhanced)
// ══════════════════════════════════════════════════════════════

function tierIcon(idx) {
  if (idx === 0) return "🥇";
  if (idx === 1) return "🥈";
  if (idx === 2) return "🥉";
  return "  ";
}

function buildCognitiveContext() {
  const g = loadGraph();
  const decs = loadDecs();
  
  if (!g.nodes.length && !decs.length) return "";
  
  let ctx = "🧠 [KeepThinking 认知引擎 v7.0]\n";
  ctx += "以下是你之前在这个项目中的关键决策和认知图谱。请参考这些上下文来回答问题。\n\n";
  
  // Get top sorted nodes from cognitive graph
  const topNodes = getSortedNodes(g, CFG.maxInject);
  
  if (topNodes.length) {
    ctx += "## 🔗 关联最紧密的决策（按认知图谱排序）\n";
    for (const n of topNodes) {
      const date = (n.time || "").slice(0, 10);
      const tags = (n.tags || []).slice(0, 3).join(",");
      ctx += tierIcon(topNodes.indexOf(n)) + " [" + date + "] " + (n.project || "general") + ": " + n.label;
      if (tags) ctx += " [" + tags + "]";
      ctx += "\n";
    }
    ctx += "\n";
  }
  
  // Recent decisions (fallback if graph is sparse)
  const recentDecs = decs.slice(-5).reverse();
  if (recentDecs.length && topNodes.length < 3) {
    ctx += "## 🔑 最近决策\n";
    for (const d of recentDecs) {
      const date = (d.time || "").slice(0, 10);
      ctx += "• [" + date + "] " + (d.project || "") + ": " + d.decision + "\n";
    }
    ctx += "\n";
  }
  
  // Active tags summary
  const allTags = new Set();
  for (const n of g.nodes.slice(-30)) for (const t of (n.tags || [])) allTags.add(t);
  for (const d of decs.slice(-20)) for (const t of (d.tags || [])) allTags.add(t);
  if (allTags.size) {
    ctx += "## 📊 活跃领域\n" + [...allTags].join(", ") + "\n\n";
  }
  
  // Code review reminder
  const recentTags = [...allTags];
  if (recentTags.includes("bug-fix")) {
    ctx += "## ⚠️ 代码审查提醒\n最近高频修复 Bug，建议本次改动后检查：空值保护、mounted 检查、异步异常处理\n\n";
  }
  
  // Git integration (v7.1.0)
  try {
    const gitCtx = readGitContext(20);
    if (gitCtx && ctx.length + gitCtx.length < CFG.injectChars) {
      ctx += gitCtx;
    }
  } catch (_) {}

  // Truncate
  if (ctx.length > CFG.injectChars) {
    ctx = ctx.slice(0, CFG.injectChars) + "\n\n[认知图谱太大，已截断...]";
  }
  
  return ctx;
}

// ══════════════════════════════════════════════════════════════
//  ENVIRONMENT AUTO-HEALER
// ══════════════════════════════════════════════════════════════

function getDiskFreeGB() {
  try {
    const stat = fs.statfsSync("/");
    return (stat.bsize * stat.bfree / 1024 / 1024 / 1024).toFixed(1);
  } catch (_) { return null; }
}

function getMemoryFreeMB() {
  return (os.freemem() / 1024 / 1024).toFixed(0);
}

function runEnvCheck() {
  const issues = [];
  try {
    const freeMemMB = getMemoryFreeMB();
    console.log("[keepthinking] health: mem " + (freeMemMB/1024).toFixed(1) + "G free");
    const freeDisk = getDiskFreeGB();
    if (freeDisk !== null) {
      console.log("[keepthinking] health: disk " + freeDisk + "G free");
      if (parseFloat(freeDisk) < CFG.diskMinGB) issues.push("DISK_LOW:" + freeDisk + "G");
    }
    if (parseFloat(freeMemMB) / 1024 < CFG.memoryMinMB / 1024) issues.push("MEM_LOW:" + (freeMemMB/1024).toFixed(1) + "G");
    if (issues.length) console.log("[keepthinking] WARNING: " + issues.join("; "));
    else console.log("[keepthinking] health: OK");
  } catch(e) { console.log("[keepthinking] health error:", e.message); }
  return { ok: issues.length === 0, issues: issues.length ? issues : [], disk: getDiskFreeGB(), memory: getMemoryFreeMB() };
}

let _healthTimer = null;
function startEnvHealer() {
  runEnvCheck();
  if (_healthTimer) clearInterval(_healthTimer);
  _healthTimer = setInterval(runEnvCheck, CFG.checkIntervalMs);
  _healthTimer.unref();
  return _healthTimer;
}

function stopEnvHealer() {
  if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
}

// ══════════════════════════════════════════════════════════════
//  GET STATS (for dashboard / API)
// ══════════════════════════════════════════════════════════════

function getStats() {
  const g = loadGraph();
  const exps = loadExps();
  const decs = loadDecs();
  return {
    version: "7.1.0",
    nodes: (g.nodes || []).length,
    edges: (g.edges || []).length,
    experiences: exps.length,
    decisions: decs.length,
    dataDir: BASE,
    memoryDir: MEM_DIR,
    diskFreeGB: getDiskFreeGB() || "unknown",
    memoryFreeMB: getMemoryFreeMB() || "unknown",
  };
}

// ══════════════════════════════════════════════════════════════
//  PROJECT LISTING
// ══════════════════════════════════════════════════════════════

function listProjects() {
  const g = loadGraph();
  const decs = loadDecs();
  const exps = loadExps();
  const projects = {};

  for (const n of (g.nodes || [])) {
    const p = n.project || "general";
    if (!projects[p]) projects[p] = { nodes: 0, decisions: 0, experiences: 0, lastActive: n.time };
    projects[p].nodes++;
    if (n.time > projects[p].lastActive) projects[p].lastActive = n.time;
  }
  for (const d of decs) {
    const p = d.project || "general";
    if (!projects[p]) projects[p] = { nodes: 0, decisions: 0, experiences: 0, lastActive: d.time };
    projects[p].decisions++;
  }
  for (const e of exps) {
    const p = e.task || "general";
    if (!projects[p]) projects[p] = { nodes: 0, decisions: 0, experiences: 0, lastActive: e.time };
    projects[p].experiences++;
  }

  return Object.entries(projects)
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
}

// ══════════════════════════════════════════════════════════════
//  GIT INTEGRATION (v7.1.0)
//  Reads local Git history for developer context
// ══════════════════════════════════════════════════════════════

function readGitContext(maxCommits) {
  try {
    const { execSync } = require("child_process");
    const cwd = process.cwd();
    
    try {
      execSync("git rev-parse --git-dir", { cwd, stdio: "pipe", timeout: 2000 });
    } catch (_) {
      return ""; // Not a git repo
    }
    
    const count = maxCommits || 20;
    const branch = execSync("git branch --show-current", { cwd, encoding: "utf8", timeout: 2000 }).trim();
    const log = execSync("git log --oneline -" + count, { cwd, encoding: "utf8", timeout: 3000 }).trim();
    
    if (!log) return "";
    
    let gitCtx = "\n## 📝 Git 项目上下文\n";
    gitCtx += "当前分支: " + branch + "\n";
    gitCtx += "最近 " + log.split("\n").length + " 次提交:\n";
    gitCtx += log.split("\n").slice(0, 15).map(function(l) { return "  • " + l; }).join("\n");
    
    try {
      const files = execSync("ls package.json go.mod Cargo.toml requirements.txt pom.xml 2>/dev/null || true", { cwd, encoding: "utf8", timeout: 1000 }).trim();
      if (files.includes("package.json")) gitCtx += "\n  项目类型: Node.js/JavaScript";
      else if (files.includes("go.mod")) gitCtx += "\n  项目类型: Go";
      else if (files.includes("Cargo.toml")) gitCtx += "\n  项目类型: Rust";
    } catch (_) {}
    
    gitCtx += "\n";
    return gitCtx;
  } catch (e) {
    return ""; // Silently fail on git errors
  }
}


// ══════════════════════════════════════════════════════════════
//  LOCAL EMBEDDING ENGINE (v7.1.0)
//  Zero API calls — 100% local ONNX Runtime WASM
// ══════════════════════════════════════════════════════════════

let _embedder = null;
let _embedderLoading = false;
let _embedderReady = false;

async function getEmbedder() {
  if (_embedderReady && _embedder) return _embedder;
  if (_embedderLoading) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (_embedderReady && _embedder) return _embedder;
    }
    throw new Error('Embedder load timeout');
  }
  _embedderLoading = true;
  try {
    const { pipeline, env } = require('@xenova/transformers');
    // Cache models locally in ~/.keepthinking/cache/
    env.cacheDir = path.join(BASE, 'cache');
    env.allowRemoteModels = true;
    _embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
    console.log('[keepthinking] ONNX embedding model loaded and cached');
    _embedderReady = true;
    console.log('[keepthinking] Embedding engine ready (ONNX, local, 384-dim)');
    return _embedder;
  } catch (e) {
    _embedderLoading = false;
    console.error('[keepthinking] Embedder init failed:', e.message);
    throw e;
  }
}

async function embedText(text) {
  if (!text || text.length < 2) return null;
  try {
    const embedder = await getEmbedder();
    const result = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  } catch (e) {
    console.error('[keepthinking] Embed failed:', e.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

const EMBED_CACHE_FILE = path.join(MEM_DIR, 'embed_cache.json');

function loadEmbedCache() {
  return loadJSON(EMBED_CACHE_FILE, {});
}

function saveEmbedCache(cache) {
  const keys = Object.keys(cache);
  if (keys.length > 1000) {
    const sorted = keys.sort((a, b) => (cache[b].ts || 0) - (cache[a].ts || 0));
    for (const k of sorted.slice(1000)) delete cache[k];
  }
  saveJSON(EMBED_CACHE_FILE, cache);
}

async function semanticSearch(query, maxResults) {
  try {
    const queryVec = await embedText(query);
    if (!queryVec) return [];
    
    const g = loadGraph();
    const cache = loadEmbedCache();
    const results = [];
    
    for (const node of (g.nodes || [])) {
      let vec = cache[node.id];
      if (!vec || !vec.vector) {
        const text = (node.label || '') + ' ' + (node.context || '') + ' ' + (node.tags || []).join(' ');
        const nodeVec = await embedText(text);
        if (nodeVec) {
          cache[node.id] = { vector: nodeVec, ts: Date.now() };
        }
        vec = cache[node.id] || null;
      }
      
      if (vec && vec.vector) {
        const score = cosineSimilarity(queryVec, vec.vector);
          // R4: Boost nodes whose tags match query keywords
          const qLower = query.toLowerCase();
          const nodeTags = (node.tags || []).join(' ').toLowerCase();
          let tagBoost = 0;
          if (nodeTags.length > 0) {
            for (const term of qLower.split(/\s+/)) {
              if (term.length > 1 && nodeTags.includes(term)) tagBoost += 0.15;
            }
          }
          const finalScore = Math.min(1, score + tagBoost);
        if (finalScore > 0.15) {
          results.push({
            id: node.id,
            label: node.label,
            project: node.project || 'general',
            tags: node.tags || [],
            time: node.time,
            score: Math.round(finalScore * 100) / 100,
          });
        }
      }
    }
    
    saveEmbedCache(cache);
    results.forEach(r => { if (r.tags && r.tags.length <= 1 && r.score < 0.5) r.score *= 0.85; }); results.sort((a, b) => b.score - a.score);
    
    // Bug pattern diagnosis for semantic search results (v7.2.0)
    const semResults = results.slice(0, maxResults || 10).map(r => {
      const entry = { ...r };
      if (r.label) {
        const contentBug = bugEngine.classifyBug(r.label);
        if (contentBug.length > 0) {
          entry.bugPattern = {
            type: contentBug[0].type,
            confidence: contentBug[0].confidence,
            fixTemplate: contentBug[0].fixTemplate,
          };
        }
      }
      return entry;
    });
    
    // Append global bug diagnosis from the query
    const queryBug = bugEngine.classifyBug(query);
    if (queryBug.length > 0) {
      semResults.push({
        source: 'bug-diagnosis',
        type: 'bug-pattern',
        content: 'Bug模式诊断',
        bugPatterns: queryBug.map(m => ({
          type: m.type,
          confidence: m.confidence,
          priority: m.priority,
          fixTemplate: m.fixTemplate,
        })),
        suggestion: bugEngine.suggestFix(query).suggestion,
        score: 1,
        bugDiagnosis: true,
      });
    }
    
    return semResults;
  } catch (e) {
    console.error('[keepthinking] Semantic search failed:', e.message);
    return [];
  }
}


// ══════════════════════════════════════════════════════════════
//  AUTO-DECISION EXTRACTOR (v7.2.0)
//  Extracts key decisions from conversation text using pattern matching
// ══════════════════════════════════════════════════════════════

const DECISION_PATTERNS = [
  { re: /(?:决定|决定要|确定|选[用择定]|采用|定下|拍板)[：:]*\s*(.+?)(?:[。！;\n]|$)/g, type: 'decision' },
  { re: /(?:修[复改正]了|改好了|修好了|修复完成|fixed|resolved|solved|patched)[：:]*\s*(.+?)(?:[。！.\n]|$)/gi, type: 'bug' },
  { re: /(?:部署|上线|发布完成|deployed|released)[：:要]*\s*(.+?)(?:[。！.\n]|$)/gi, type: 'deployment' },
  { re: /(?:架构|architecture|design)[：:是]*\s*(.+?)(?:[。！.\n]|$)/gi, type: 'architecture' },
  { re: /(?:创建了|新建了|初始化了|搭建了|created|initialized)[：:了]*\s*(.+?)(?:[。！.\n]|$)/gi, type: 'creation' },
  { re: /(?:should|decided to|chose to|plan to)\s+(.+?)(?:[.!]|$)/gi, type: 'decision' },
  { re: /(?:给|为|对|在)\s*[^。！]*?(?:添加了|加入了|实现了|完成了|修复了|改为了|更新了|升级了|优化了|重构了|集成了|增加了|新建了)[^。！]*/g, type: 'creation' },
  { re: /(?:添加了|加入了|实现了|完成了|更新了|升级了|优化了|重构了|集成了|增加了|新建了|发布了)[：:]*\s*(.+?)(?:[。！]|$)/g, type: 'creation' },
];

const DECISION_STOP_WORDS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '这', '那', '是', '的', '了', '吗', '吧', '呢', '啊', '嗯', '哦',
  '好', '行', '可以', '知道', '明白', '了解', '对', '不对', '不', '没', '有', '没有', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'this', 'that', 'it', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'as',
]);

function extractDecisions(text, maxResults = 10) {
  if (!text || text.length < 10) return [];
  // Split into sentences (Chinese: 、。！？ English: .!?)
  const sentences = text.split(/(?<=[。！？.!?])\s*/).filter(s => s.trim());
  const results = [];
  const seen = new Set();
  
  const extractors = [
    // Fix/bug patterns: "修复了X" "fixed X" "solved X"
    { re: /(?:修[复改正]了|fix(?:ed)?|resolved?|solved?|patched?)[：:]*\s*(.+)/i, type: 'bug' },
    // Decision patterns: "决定X" "decided to X" "should X"
    { re: /(?:决定|决定要|确定|选[用择定]|采用|定下|拍板)[：:]*\s*(.+)/i, type: 'decision' },
    { re: /(?:should|decided to|chose to|plan to|going to)\s+(.+)/i, type: 'decision' },
    // Creation: "创建了X" "实现了X" "添加了X" "集成了X"
    { re: /(?:创建了|新建了|初始化了|搭建了|实现了|完成了|添加了|加入了|更新了|升级了|优化了|重构了|集成了|增加了|发布了|created|added|implemented|integrated)[：:]*\s*(.+)/gi, type: 'creation' },
    // Action verbs: "给/为/对/把...添加了/修复了/实现了/改为了"
    { re: /(?:给|为|对|在)\s*(.+?(?:添加了|加入了|实现了|完成了|修复了|改为了|更新了|升级了|优化了|重构了|集成了).+)/i, type: 'creation' },
    // Deployment: "部署X" "上线X" "发布X" "deployed X"
    { re: /(?:部署|上线|发布完成|deployed?|released?)[：:要]*\s*(.+)/i, type: 'deployment' },
    // Architecture: "架构X" "design X"
    { re: /(?:架构|architecture|design)[：:是]*\s*(.+)/i, type: 'architecture' },
  ];
  
  for (const sent of sentences) {
    if (sent.trim().length < 4) continue;
    for (const ext of extractors) {
      const m = sent.trim().match(ext.re);
      if (!m) continue;
      const snippet = (m[1] || m[0]).trim();
      if (snippet.length < 4) continue;
      if (seen.has(snippet)) continue;
      seen.add(snippet);
      
      const project = guessProject(snippet);
      const tags = extractTags(snippet, '');
      if (!tags.includes(ext.type)) tags.unshift(ext.type);
      if (!tags.includes("auto-extract")) tags.push("auto-extract");
      
      results.push({
        label: snippet.slice(0, 60),
        context: snippet.slice(0, 150),
        type: ext.type,
        project: project,
        tags: tags.slice(0, 6),
        confidence: 1 - (results.length * 0.05),
      });
      if (results.length >= maxResults) return results;
      break; // one match per sentence
    }
    if (results.length >= maxResults) return results;
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
//  MODULE EXPORTS (independent — no OpenClaw dependency)
// ══════════════════════════════════════════════════════════════

module.exports = {
  // Config
  BASE, MEM_DIR, CFG,

  // Graph engine
  loadGraph, saveGraph, addNode, getSortedNodes,

  // Memory engine
  loadExps, loadDecs, saveExp, saveDecision,

  // Search
  search, searchExps, searchMemory, decayWeight, extractTags, guessProject,

  // Auto-extract
  extractDecisions, DECISION_PATTERNS,

  // Context builder
  buildCognitiveContext, fmtInjection,

  // Env healer
  runEnvCheck, startEnvHealer, stopEnvHealer, getDiskFreeGB, getMemoryFreeMB,

  // Stats & projects
  getStats, listProjects,

  // Tags constant
  TAGS,

  // Helpers
  gid, nowISO, ensureDir,

  // Embedding engine (v7.1.0)
  getEmbedder, embedText, semanticSearch, cosineSimilarity,

  // Bug pattern engine (v7.2.0)
  bugEngine,
};
