#!/usr/bin/env node
// KeepThinking MCP Server v7.7.0
// Universal Developer Cognitive Engine — works with any MCP-compatible agent
// (Claude Desktop, Cursor, OpenAgent, OpenClaw, Hermes, etc.)
//
// IMPROVEMENTS in v7.7.0:
//   - Added engine_status tool (nodes, edges, exp, dec, disk, memory)
//   - Independent: uses local engine module (no OpenClaw dependency)
//   - Standalone deployment via ~/.keepthinking/
//
// Tools:
//   search_memory    — semantic search across all past sessions
//   bug_diagnose     — diagnose bugs against known patterns (NEW in v7.7.0)
//   get_context      — full project context with cognitive graph ranking
//   list_projects    — list all known projects with stats
//   cognitive_graph  — full cognitive graph (nodes + edges) for visual analysis
//   engine_status    — engine health & stats (NEW in v7.7.0)

"use strict";
const fs = require("fs");
const path = require("path");

// Load the independent engine (resolve from install location)
let engine;
try {
  engine = require(path.join(__dirname, "..", "..", "engine.jsc"));
} catch (_) {
  try {
    engine = require(path.join(__dirname, "..", "..", "engine.js"));
  } catch (_2) {
    try {
      engine = require("/opt/keepthinking-dev/v7/engine.js");
    } catch (_3) {
      console.error("[keepthinking-mcp] ERROR: Cannot load engine module");
      process.exit(1);
    }
  }
}

// Bug engine for bug diagnosis (v7.7.0)
let bugEngine;
try {
  bugEngine = require(path.join(__dirname, "..", "engine-bug.js"));
} catch (_) {
  bugEngine = null;
  if (process.env.DEBUG) console.error("[keepthinking-mcp] Bug engine not loaded");
}

// MCP Protocol
function sendJSON(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

const TOOLS = [
  {
    name: "search_memory",
    description: "Semantic search across cognitive graph + past sessions. Returns prioritized results from both the cognitive graph and legacy experiences.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "integer", description: "Max results (default 10)", minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_context",
    description: "Full project context with cognitive graph ranking. Top nodes sorted by relevance (weight × decay + edge connections). Inject at start of new session.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Optional project filter" },
      },
    },
  },
  {
    name: "list_projects",
    description: "List all known projects with node/decision/experience counts and last activity.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cognitive_graph",
    description: "Full cognitive graph — all nodes and edges. For visualization, analysis, or debugging the AI's knowledge structure.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Optional project filter" },
        maxNodes: { type: "integer", description: "Max nodes to return", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "search_semantic",
    description: "Semantic (vector) search across cognitive graph using local WASM embedding. Zero external API calls — 100% local. Finds conceptually related results even with different wording.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "integer", description: "Max results (default 5)", minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "bug_diagnose",
    description: "Diagnose a bug description against known patterns. Returns matched bug type, confidence, and fix template. Supports Chinese and English error descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Bug description or error message" },
        maxResults: { type: "integer", description: "Max results to return (default 5)", minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "engine_status",
    description: "Get KeepThinking engine health & stats — nodes, edges, experiences, decisions, disk free, memory free. Use to monitor the cognitive engine's state.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleMethod(request) {
  const { method, params, id } = request;

  switch (method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "KeepThinking MCP Server",
          version: "7.1.0",
          description: "独立认知引擎 — Independent cognitive engine, no OpenClaw dependency. 100% local storage."
        },
        capabilities: { tools: {} },
      }};

    case "notifications/initialized":
      return null;

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    case "tools/call": {
      const { name, arguments: args } = params || {};
      let result;
      try {
        switch (name) {
          case "search_memory":
            result = engine.searchMemory(args?.query, args?.maxResults || 10);
            break;
          case "get_context":
            result = engine.buildCognitiveContext();
            if (args?.project) {
              result = "Project: " + args.project + "\n\n" + result;
            }
            break;
          case "list_projects":
            result = engine.listProjects();
            break;
          case "cognitive_graph": {
            let g = engine.loadGraph();
            if (args?.project) {
              const pf = args.project.toLowerCase();
              g = {
                nodes: (g.nodes||[]).filter(n => (n.project||"").toLowerCase().includes(pf)),
                edges: (g.edges||[]).filter(e => {
                  const fromNode = (g.nodes||[]).find(n => n.id === e.from);
                  const toNode = (g.nodes||[]).find(n => n.id === e.to);
                  return (fromNode?.project||"").toLowerCase().includes(pf) || (toNode?.project||"").toLowerCase().includes(pf);
                }),
                version: g.version,
              };
            }
            if (args?.maxNodes) {
              g.nodes = (g.nodes||[]).slice(0, args.maxNodes);
            }
            result = g;
            break;
          }
          case "search_semantic": {
            const semQuery = args?.query || '';
            result = await engine.semanticSearch(semQuery, args?.maxResults || 5);
            if (result.length === 0) {
              result = { message: 'No semantic matches found (embedding engine may still be warming up on first use)', results: [] };
            }
            break;
          }
          case "bug_diagnose": {
            if (!bugEngine) {
              result = { error: 'Bug engine not loaded', matches: [] };
            } else {
              const diagnosis = bugEngine.suggestFix(args?.query || '');
              if (args?.maxResults && args.maxResults > 0 && diagnosis.matches && diagnosis.matches.length > args.maxResults) {
                diagnosis.matches = diagnosis.matches.slice(0, args.maxResults);
              }
              result = diagnosis;
            }
            break;
          }
          case "engine_status": {
            const stats = engine.getStats();
            result = {
              engine: "KeepThinking v" + stats.version,
              description: "独立认知引擎 — 100% 本地存储，零数据上传",
              health: {
                nodes: stats.nodes,
                edges: stats.edges,
                experiences: stats.experiences,
                decisions: stats.decisions,
                diskFreeGB: stats.diskFreeGB,
                memoryFreeMB: stats.memoryFreeMB,
                dataDir: stats.dataDir,
              },
              status: (parseFloat(stats.diskFreeGB) >= engine.CFG.diskMinGB && parseInt(stats.memoryFreeMB) >= engine.CFG.memoryMinMB) ? "healthy" : "degraded",
            };
            break;
          }
          default:
            throw new Error("Unknown tool: " + name);
        }
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        result = { content: [{ type: "text", text }] };
      } catch (e) {
        result = { content: [{ type: "text", text: "Error: " + e.message }], isError: true };
      }
      return { jsonrpc: "2.0", id, result };
    }

    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  }
}

// ── STDIO Loop
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf("\n");
    if (idx < 0) break;
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    const request = (() => { try { return JSON.parse(line); } catch (_) { return null; } })();
    if (!request) continue;
    const response = await handleMethod(request);
    if (response) sendJSON(response);
  }
});

const g = engine.loadGraph();
const s = engine.getStats();
process.stderr.write("[keepthinking-mcp] v7.7.0 — independent cognitive engine ready\n");
process.stderr.write("[keepthinking-mcp] Graph: " + (g.nodes||[]).length + " nodes, " + (g.edges||[]).length + " edges\n");
process.stderr.write("[keepthinking-mcp] Data: " + s.dataDir + "\n");
process.stderr.write("[keepthinking-mcp] Health: " + s.diskFreeGB + "G disk, " + s.memoryFreeMB + "MB mem\n");
