// KeepThinking OpenClaw Plugin v7.2.0
// Auto-capture AI decisions via OpenClaw hooks.
// Reference engine.js for all core capabilities.
"use strict";

const path = require("path");

// Load the independent engine
let engine;
try {
  engine = require(path.join(__dirname, "..", "engine.js"));
} catch (_) {
  try {
    engine = require(path.join(__dirname, "..", "engine.jsc"));
  } catch (_2) {
    try {
      engine = require("/opt/keepthinking-dev/v7/engine.js");
    } catch (_3) {
      console.error("[keepthinking-plugin] Failed to load engine module");
      engine = null;
    }
  }
}

if (!engine) {
  throw new Error("KeepThinking plugin requires the engine module. Install: /opt/keepthinking-dev/v7");
}

// ─── In-memory session tracking ───────────────────────────────
const activeSubagents = new Map();  // subagentId → { task, startTime }

// ─── Plugin export ────────────────────────────────────────────
module.exports = function keepthinking(config) {
  const opts = config || {};

  return {
    hooks: {

      // ── gateway_start: inject global cognitive context ──
      gateway_start: async (ctx) => {
        try {
          const cognitiveCtx = engine.buildCognitiveContext();
          if (!cognitiveCtx) return;

          // Inject as a system message so AI is aware of project history
          const messages = ctx.messages || ctx.systemMessages || [];
          messages.unshift({
            role: "system",
            content: cognitiveCtx,
            metadata: { source: "keepthinking", hook: "gateway_start" },
          });

          if (ctx.messages) ctx.messages = messages;
          else if (ctx.systemMessages) ctx.systemMessages = messages;

          if (opts.verbose) {
            console.log("[keepthinking] gateway_start: injected cognitive context (" +
              cognitiveCtx.length + " chars)");
          }
        } catch (e) {
          console.error("[keepthinking] gateway_start error:", e.message);
        }
      },

      // ── before_prompt_build: inject top-3 relevant memories ──
      before_prompt_build: async (ctx) => {
        try {
          // Extract searchable text from current session context
          const sessionText = extractSessionText(ctx);
          if (!sessionText || sessionText.length < 10) return;

          const results = await engine.semanticSearch(sessionText, 10);
          if (!results || !results.length) return;

          // Take top 3 most relevant
          const top3 = results.slice(0, 3);
          let injection = "🧠 [KeepThinking 关联记忆]\n";
          injection += "以下是与当前会话最相关的历史记忆，请参考：\n\n";

          for (const r of top3) {
            const date = (r.time || "").slice(0, 10);
            const tags = (r.tags || []).slice(0, 3).join(", ");
            injection += `• [${date}] [${r.project || "general"}] ${r.label}`;
            if (tags) injection += ` [${tags}]`;
            injection += ` (相关度: ${Math.round(r.score * 100)}%)\n`;
          }
          injection += "\n";

          // Prepend to system prompt
          const messages = ctx.messages || ctx.systemMessages || [];
          if (messages.length > 0 && messages[0].role === "system") {
            messages[0].content = injection + messages[0].content;
          } else {
            messages.unshift({ role: "system", content: injection });
          }

          if (ctx.messages) ctx.messages = messages;
          else if (ctx.systemMessages) ctx.systemMessages = messages;

          if (opts.verbose) {
            console.log("[keepthinking] before_prompt_build: injected top-3 related memories for query:",
              sessionText.slice(0, 80));
          }

          // Auto-capture decisions from session text
          try {
            const g = engine.loadGraph();
            const decisions = engine.extractDecisions(sessionText, 5);
            for (const d of decisions) {
              engine.addNode(g, d.label, d.project || "general", d.tags, d.context, {
                source: "auto-prompt",
                type: d.type,
                weight: d.confidence ? Math.min(d.confidence * 4, 4) : 2,
              });
            }
          } catch (_) {}

        } catch (e) {
          console.error("[keepthinking] before_prompt_build error:", e.message);
        }
      },

      // ── subagent_spawned: record task start ──
      subagent_spawned: async (ctx) => {
        try {
          const subagentId = ctx.subagentId || ctx.id || ctx.name || "unknown";
          const task = ctx.task || ctx.prompt || ctx.description || "";
          const startTime = ctx.startTime || new Date().toISOString();

          activeSubagents.set(subagentId, { task, startTime });

          if (opts.verbose) {
            console.log("[keepthinking] subagent_spawned: recording start for", subagentId);
          }
        } catch (e) {
          console.error("[keepthinking] subagent_spawned error:", e.message);
        }
      },

      // ── subagent_ended: auto-capture decisions ──
      subagent_ended: async (ctx) => {
        try {
          const subagentId = ctx.subagentId || ctx.id || ctx.name || "unknown";
          const session = activeSubagents.get(subagentId);

          const task = ctx.task || ctx.prompt || ctx.description ||
            (session ? session.task : "");
          const result = ctx.result || ctx.output || ctx.summary || "";
          const duration = session
            ? Date.now() - new Date(session.startTime).getTime()
            : 0;

          // Clean up tracking
          activeSubagents.delete(subagentId);

          // Skip trivial tasks (too short duration or no meaningful output)
          if (duration < (engine.CFG ? engine.CFG.minTaskMs : 3000)) {
            if (opts.verbose) {
              console.log("[keepthinking] subagent_ended: skipping short task", subagentId,
                "(" + duration + "ms)");
            }
            return;
          }

          // Check if result contains significant decisions
          if (!isSignificant(task, result)) {
            if (opts.verbose) {
              console.log("[keepthinking] subagent_ended: skipping non-significant task", subagentId);
            }
            return;
          }

          // Extract tags and build label
          const tags = engine.extractTags(task, result);
          tags.push("auto-capture", "subagent");

          const project = engine.guessProject(task);
          const label = buildLabel(task, result, subagentId);

          // Build context snippet
          const context = buildContext(task, result, duration);

          // Add to cognitive graph
          const g = engine.loadGraph();
          const node = engine.addNode(g, label, project, tags, context, {
            source: "openclaw-hook",
            metadata: {
              subagentId,
              duration,
              hookVersion: "7.2.0",
              taskPreview: task.slice(0, 100),
              resultPreview: result.slice(0, 100),
            },
          });

          if (node) {
            console.log("[keepthinking] subagent_ended: captured decision →",
              node.id, "|", project, "|", tags.join(","), "|", label.slice(0, 60));
          }
        } catch (e) {
          console.error("[keepthinking] subagent_ended error:", e.message);
        }
      },

    },

  }; // end return
}; // end module.exports

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

const SIGNIFICANT_KEYWORDS = [
  "决策", "决定", "fix", "修复", "迁移", "重构", "架构",
  "deploy", "部署", "release", "发布", "upgrade", "升级",
  "migration", "refactor", "architecture", "redesign",
  "change", "修改", "optimize", "优化", "patch", "security",
  "add", "新增", "remove", "删除", "replace", "替换",
  "implement", "实现", "configure", "配置",
];

function isSignificant(task, result) {
  const text = ((task || "") + " " + (result || "")).toLowerCase();
  return SIGNIFICANT_KEYWORDS.some(kw => text.includes(kw));
}

function buildLabel(task, result) {
  // Try to extract a concise label from the task or result
  const clean = (t) => t
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Prefer task as source for the label
  let source = clean(task || result || "");
  if (source.length > 120) {
    // Try to take first meaningful sentence
    const firstSent = source.split(/[。.!！?\n]/)[0];
    if (firstSent && firstSent.length > 10) {
      source = firstSent.trim();
    } else {
      source = source.slice(0, 120);
    }
  }

  // Remove instruction prefixes
  source = source
    .replace(/^(在|on the|on )/i, "")
    .trim();

  return source || "Subagent task completed";
}

function buildContext(task, result, duration) {
  const durSec = Math.round(duration / 1000);
  let ctx = "";

  if (task && task.trim()) {
    ctx += "Task: " + task.slice(0, 80).replace(/\n/g, " ") + ". ";
  }
  if (result && result.trim()) {
    ctx += "Result: " + result.slice(0, 80).replace(/\n/g, " ") + ". ";
  }
  ctx += "Duration: " + durSec + "s.";

  return ctx.slice(0, 200);
}

function extractSessionText(ctx) {
  // Extract text from the current session context for semantic search
  const parts = [];

  if (ctx.task || ctx.prompt) parts.push(ctx.task || ctx.prompt);
  if (ctx.topic || ctx.subject) parts.push(ctx.topic || ctx.subject);

  // Try to extract from messages
  const messages = ctx.messages || [];
  for (const msg of messages) {
    if (msg.content && typeof msg.content === "string") {
      parts.push(msg.content);
    } else if (msg.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.text) parts.push(block.text);
      }
    }
  }

  // Also check systemMessages
  const sysMsgs = ctx.systemMessages || [];
  for (const msg of sysMsgs) {
    if (msg.content && typeof msg.content === "string") parts.push(msg.content);
  }

  return parts.join(" ").slice(0, 500);
}
