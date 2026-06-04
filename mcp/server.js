#!/usr/bin/env node
// KeepThinking MCP Server v7.2.1
// 8-tool MCP server — powered by engine.js
"use strict";

const path = require("path");
const ENGINE_PATH = path.join(process.env.KEEPTHINKING_HOME || path.join(process.env.HOME || "/root", ".keepthinking"), "engine.js");
const engine = require(ENGINE_PATH);

const tools = [
  {
    name: "search_memory",
    description: "Search all past memories, decisions, and experiences. Supports natural language queries. Returns matched items with project, tags, and time.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Search query" }, maxResults: { type: "integer", description: "Max results (default 10)", minimum: 1, maximum: 50 } }, required: ["query"] },
  },
  {
    name: "search_semantic",
    description: "Semantic search using ONNX embeddings — understands meaning, not just keywords. 50+ languages. Matches 'deploy failure' to 'CI/CD error', 'Nginx config' etc.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Natural language query" }, maxResults: { type: "integer", description: "Max results (default 10)", minimum: 1, maximum: 50 } }, required: ["query"] },
  },
  {
    name: "get_context",
    description: "Get full project context — all nodes + edges weighted by recency and relevance. Use at session start to bootstrap AI memory.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description: "List all projects with node count, decision count, experience count, last activity time.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cognitive_graph",
    description: "Get the full cognitive graph — nodes and edges. Useful for visualization and relationship analysis.",
    inputSchema: { type: "object", properties: { maxNodes: { type: "integer", description: "Max nodes to return (default 30)", minimum: 1, maximum: 500 } } },
  },
  {
    name: "engine_status",
    description: "Get engine health stats — nodes, edges, experiences, decisions, disk free GB, memory free MB, version, uptime.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "bug_diagnose",
    description: "Diagnose a bug/error description against 6 known patterns. Returns matched bug type, confidence score, and fix template. Chinese & English supported.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Bug description or error message" }, maxResults: { type: "integer", description: "Max results (default 5)", minimum: 1, maximum: 20 } }, required: ["query"] },
  },
  {
    name: "env_health",
    description: "Check environment health — disk alert if <7GB, memory alert if <500MB. Returns ok, issues list, diskGB, memoryMB.",
    inputSchema: { type: "object", properties: {} },
  },
];

// Read JSON-RPC from stdin
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  try {
    const req = JSON.parse(buffer);
    buffer = "";
    const resp = await handle(req);
    process.stdout.write(JSON.stringify(resp) + "\n");
  } catch (_) { /* wait for more data */ }
});
process.stdin.on("end", () => { if (buffer.trim()) try { process.stdout.write(JSON.stringify(handleSync(JSON.parse(buffer))) + "\n"); } catch(_) {} });

function handleSync(req) {
  const { method, id } = req;
  if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", serverInfo: { name: "keepthinking-mcp", version: "7.2.1" }, capabilities: { tools: {} } } };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found (use async for tool calls)" } };
}

async function handle(request) {
  const { method, params, id } = request;

  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", serverInfo: { name: "keepthinking-mcp", version: "7.2.1" }, capabilities: { tools: {} } } };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools } };
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    try {
      switch (name) {
        case "search_memory": {
          const results = await engine.searchMemory(args.query, args.maxResults || 10);
          return { jsonrpc: "2.0", id, result: { ok: true, results } };
        }
        case "search_semantic": {
          const results = await engine.semanticSearch ? await engine.semanticSearch(args.query, args.maxResults || 10) : [];
          return { jsonrpc: "2.0", id, result: { ok: true, results } };
        }
        case "get_context": {
          const ctx = engine.getStats ? await engine.buildCognitiveContext ? (() => {
            // buildCognitiveContext uses async internally but we return sync via getStats
            const g = engine.getSortedNodes ? engine.loadGraph() : { nodes: [], edges: [] };
            const s = engine.getStats();
            return { ok: true, context: { nodes: s.nodes, edges: s.edges, projects: s.projects || [] } };
          })() : { nodes: 0, edges: 0 } : { nodes: 0, edges: 0 };
          return { jsonrpc: "2.0", id, result: { ok: true, ...ctx.context || ctx } };
        }
        case "list_projects": {
          const projects = await engine.listProjects();
          return { jsonrpc: "2.0", id, result: { ok: true, projects } };
        }
        case "cognitive_graph": {
          const maxNodes = args.maxNodes || 30;
          const g = engine.loadGraph();
          const nodes = engine.getSortedNodes ? engine.getSortedNodes(g, maxNodes) : (g.nodes || []).slice(0, maxNodes);
          return { jsonrpc: "2.0", id, result: { ok: true, nodes, edges: (g.edges || []).slice(0, 200) } };
        }
        case "engine_status": {
          const stats = engine.getStats();
          return { jsonrpc: "2.0", id, result: { ok: true, stats } };
        }
        case "bug_diagnose": {
          const diag = engine.bugEngine && engine.bugEngine.diagnose ? await engine.bugEngine.diagnose(args.query, args.maxResults || 5) : { error: "bugEngine not available" };
          return { jsonrpc: "2.0", id, result: { ok: true, ...(diag.error ? diag : { results: diag }) } };
        }
        case "env_health": {
          const h = engine.runEnvCheck();
          return { jsonrpc: "2.0", id, result: { ok: h.ok, issues: h.issues, diskGB: h.disk, memoryMB: h.memory } };
        }
        default:
          return { jsonrpc: "2.0", id, error: { code: -32601, message: "Tool not found: " + name } };
      }
    } catch (e) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: e.message } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method: " + method } };
}
